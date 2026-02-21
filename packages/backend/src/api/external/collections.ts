import { findRelatedDocuments } from "@lydie/core/embedding/search";
import { convertYjsToJson } from "@lydie/core/yjs-to-json";
import { collectionFieldsTable, collectionsTable, db, documentsTable } from "@lydie/database";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { extractTableOfContents } from "../../utils/toc";
import { transformDocumentLinksToInternalLinkMarks } from "../utils/link-transformer";
import { apiKeyAuth, externalRateLimit } from "./middleware";

type SortBy = "created_at" | "updated_at" | "title";
type SortOrder = "asc" | "desc";

function parseSortBy(value: string | undefined): SortBy {
  if (value === "updated_at" || value === "title") {
    return value;
  }

  return "created_at";
}

function parseSortOrder(value: string | undefined): SortOrder {
  return value === "asc" ? "asc" : "desc";
}

function buildDocumentOrder(sortBy: SortBy, sortOrder: SortOrder): SQL[] {
  const order = sortOrder === "asc" ? asc : desc;

  if (sortBy === "updated_at") {
    return [order(documentsTable.updatedAt), order(documentsTable.id)];
  }

  if (sortBy === "title") {
    return [order(documentsTable.title), order(documentsTable.id)];
  }

  return [order(documentsTable.createdAt), order(documentsTable.id)];
}

function parseFilters(query: Record<string, string>): Record<string, string> {
  const filters: Record<string, string> = {};

  for (const [key, value] of Object.entries(query)) {
    const match = key.match(/^filter\[(.+)\]$/);
    if (match && value !== undefined) {
      filters[match[1]] = value;
    }
  }

  return filters;
}

function getUniquePropertyNames(properties: unknown): string[] {
  if (!Array.isArray(properties)) return [];

  return properties
    .map((property) => {
      if (typeof property !== "object" || property === null) {
        return null;
      }

      const candidate = property as { name?: unknown; unique?: unknown };
      if (candidate.unique === true && typeof candidate.name === "string") {
        return candidate.name;
      }

      return null;
    })
    .filter((name): name is string => name !== null);
}

function buildUniquePropertyMatchWhere(
  collections: Array<{ id: string; properties: unknown }>,
  identifier: string,
): SQL | null {
  const conditions: SQL[] = [];

  for (const collection of collections) {
    const uniqueNames = getUniquePropertyNames(collection.properties);
    for (const propertyName of uniqueNames) {
      conditions.push(
        sql`(${collectionFieldsTable.collectionId} = ${collection.id} AND ${collectionFieldsTable.values}->>${propertyName} = ${identifier})`,
      );
    }
  }

  if (conditions.length === 0) return null;
  return conditions.reduce((acc, condition) => sql`${acc} OR ${condition}`);
}

async function findCollectionDocumentByIdentifier(
  organizationId: string,
  collection: { id: string; properties: unknown },
  identifier: string,
): Promise<typeof documentsTable.$inferSelect | null> {
  const documentById = await db
    .select()
    .from(documentsTable)
    .where(
      and(
        eq(documentsTable.id, identifier),
        eq(documentsTable.organizationId, organizationId),
        eq(documentsTable.collectionId, collection.id),
        sql`${documentsTable.deletedAt} IS NULL`,
        eq(documentsTable.published, true),
      ),
    )
    .limit(1);

  if (documentById[0]) {
    return documentById[0];
  }

  const uniquePropertyMatchWhere = buildUniquePropertyMatchWhere([collection], identifier);

  if (!uniquePropertyMatchWhere) {
    return null;
  }

  const documentsByUniqueProperty = await db
    .select({ document: documentsTable })
    .from(collectionFieldsTable)
    .innerJoin(documentsTable, eq(collectionFieldsTable.documentId, documentsTable.id))
    .where(
      and(
        uniquePropertyMatchWhere,
        eq(documentsTable.organizationId, organizationId),
        eq(documentsTable.collectionId, collection.id),
        sql`${documentsTable.deletedAt} IS NULL`,
        eq(documentsTable.published, true),
      ),
    )
    .limit(1);

  return documentsByUniqueProperty[0]?.document ?? null;
}

async function transformToDocumentResponse(
  doc: typeof documentsTable.$inferSelect,
  fieldValues: Record<string, unknown>,
  includeRelated: boolean,
  includeToc: boolean,
): Promise<Record<string, unknown>> {
  let jsonContent: ReturnType<typeof convertYjsToJson> = null;
  if (doc.yjsState) {
    const rawContent = convertYjsToJson(doc.yjsState);
    jsonContent = await transformDocumentLinksToInternalLinkMarks(rawContent);
  }

  let toc: Array<{ id: string; level: number; text: string }> = [];
  if (includeToc && jsonContent) {
    try {
      toc = extractTableOfContents(jsonContent);
    } catch (error) {
      console.error("Error extracting table of contents:", error);
    }
  }

  let related: Awaited<ReturnType<typeof findRelatedDocuments>> = [];
  if (includeRelated && doc.id) {
    try {
      related = await findRelatedDocuments(doc.id, doc.organizationId, 5);
    } catch (error) {
      console.error("Error fetching related documents:", error);
    }
  }

  const { yjsState: _, ...docWithoutYjs } = doc;

  return {
    ...docWithoutYjs,
    fields: fieldValues,
    jsonContent,
    ...(includeRelated && { related }),
    ...(includeToc && { toc }),
  };
}

export const CollectionsApi = new Hono()
  .use(apiKeyAuth)
  .use(externalRateLimit)
  .get("/:handle/documents", async (c) => {
    const organizationId = c.get("organizationId");
    const handle = c.req.param("handle");
    const includeRelated = c.req.query("include_related") === "true";
    const includeToc = c.req.query("include_toc") === "true";
    const sortBy = parseSortBy(c.req.query("sort_by"));
    const sortOrder = parseSortOrder(c.req.query("sort_order"));

    const collectionResult = await db
      .select()
      .from(collectionsTable)
      .where(
        and(
          eq(collectionsTable.organizationId, organizationId),
          eq(collectionsTable.handle, handle),
        ),
      )
      .limit(1);

    const collection = collectionResult[0];

    if (!collection) {
      throw new HTTPException(404, { message: "Collection not found" });
    }

    const filters = parseFilters(c.req.query());

    const whereConditions: SQL[] = [
      eq(documentsTable.organizationId, organizationId),
      eq(documentsTable.collectionId, collection.id),
      sql`${documentsTable.deletedAt} IS NULL`,
      eq(documentsTable.published, true),
    ];

    for (const [fieldName, value] of Object.entries(filters)) {
      whereConditions.push(sql`${collectionFieldsTable.values}->>${fieldName} = ${value}`);
    }

    const documents = await db
      .select({
        document: documentsTable,
        fieldValues: collectionFieldsTable.values,
      })
      .from(documentsTable)
      .leftJoin(
        collectionFieldsTable,
        and(
          eq(documentsTable.id, collectionFieldsTable.documentId),
          eq(collectionFieldsTable.collectionId, collection.id),
        ),
      )
      .where(and(...whereConditions))
      .orderBy(...buildDocumentOrder(sortBy, sortOrder));

    const response = await Promise.all(
      documents.map((doc) =>
        transformToDocumentResponse(
          doc.document,
          (doc.fieldValues as Record<string, unknown>) || {},
          includeRelated,
          includeToc,
        ),
      ),
    );

    return c.json({ documents: response });
  })
  .get("/:handle/documents/:documentIdOrPropertyValue", async (c) => {
    const organizationId = c.get("organizationId");
    const handle = c.req.param("handle");
    const identifier = c.req.param("documentIdOrPropertyValue");
    const includeRelated = c.req.query("include_related") === "true";
    const includeToc = c.req.query("include_toc") === "true";

    const collectionResult = await db
      .select({ id: collectionsTable.id, properties: collectionsTable.properties })
      .from(collectionsTable)
      .where(
        and(
          eq(collectionsTable.organizationId, organizationId),
          eq(collectionsTable.handle, handle),
        ),
      )
      .limit(1);

    const collection = collectionResult[0];

    if (!collection) {
      throw new HTTPException(404, { message: "Collection not found" });
    }

    const document = await findCollectionDocumentByIdentifier(organizationId, collection, identifier);

    if (!document) {
      throw new HTTPException(404, { message: "Document not found" });
    }

    const fieldValuesResult = await db
      .select({ values: collectionFieldsTable.values })
      .from(collectionFieldsTable)
      .where(
        and(
          eq(collectionFieldsTable.documentId, document.id),
          eq(collectionFieldsTable.collectionId, collection.id),
        ),
      )
      .limit(1);

    const response = await transformToDocumentResponse(
      document,
      (fieldValuesResult[0]?.values as Record<string, unknown>) || {},
      includeRelated,
      includeToc,
    );

    return c.json(response);
  })
  .get("/documents/:documentIdOrPropertyValue", async (c) => {
    const organizationId = c.get("organizationId");
    const identifier = c.req.param("documentIdOrPropertyValue");
    const includeRelated = c.req.query("include_related") === "true";
    const includeToc = c.req.query("include_toc") === "true";

    let documentResult = await db
      .select()
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.id, identifier),
          eq(documentsTable.organizationId, organizationId),
          sql`${documentsTable.deletedAt} IS NULL`,
          eq(documentsTable.published, true),
        ),
      )
      .limit(1);

    if (documentResult.length === 0) {
      const collections = await db
        .select({ id: collectionsTable.id, properties: collectionsTable.properties })
        .from(collectionsTable)
        .where(eq(collectionsTable.organizationId, organizationId));

      const uniquePropertyMatchWhere = buildUniquePropertyMatchWhere(collections, identifier);

      if (uniquePropertyMatchWhere) {
        const documentsByUniqueProperty = await db
          .select({ document: documentsTable })
          .from(collectionFieldsTable)
          .innerJoin(documentsTable, eq(collectionFieldsTable.documentId, documentsTable.id))
          .where(
            and(
              uniquePropertyMatchWhere,
              eq(documentsTable.organizationId, organizationId),
              sql`${documentsTable.deletedAt} IS NULL`,
              eq(documentsTable.published, true),
            ),
          )
          .limit(1);

        documentResult = documentsByUniqueProperty.map((result) => result.document);
      }
    }

    const document = documentResult[0];
    if (!document) {
      throw new HTTPException(404, { message: "Document not found" });
    }

    const fieldValuesResult = document.collectionId
      ? await db
          .select({ values: collectionFieldsTable.values })
          .from(collectionFieldsTable)
          .where(
            and(
              eq(collectionFieldsTable.documentId, document.id),
              eq(collectionFieldsTable.collectionId, document.collectionId),
            ),
          )
          .limit(1)
      : [];

    const response = await transformToDocumentResponse(
      document,
      (fieldValuesResult[0]?.values as Record<string, unknown>) || {},
      includeRelated,
      includeToc,
    );

    return c.json(response);
  });
