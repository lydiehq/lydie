import {
  buildCollectionRoutes,
  normalizeCollectionRoute,
  toCollectionRouteSegment,
} from "@lydie/core/collection-routes";
import { findRelatedDocuments } from "@lydie/core/embedding/search";
import { convertYjsToJson } from "@lydie/core/yjs-to-json";
import { collectionFieldsTable, collectionsTable, db, documentsTable } from "@lydie/database";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { extractTableOfContents } from "../../utils/toc";
import { transformDocumentLinksToInternalLinkMarks } from "../utils/link-transformer";
import { apiKeyAuth, externalRateLimit } from "./middleware";

type CollectionDocumentRow = {
  document: typeof documentsTable.$inferSelect;
  fieldValues: Record<string, unknown>;
};

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

function buildRouteMap(rows: CollectionDocumentRow[]): Map<string, string> {
  return buildCollectionRoutes(
    rows.map((row) => ({
      id: row.document.id,
      parentId: row.document.parentId,
      title: row.document.title || "",
      slug: row.document.slug,
      route:
        typeof row.fieldValues.route === "string" && row.fieldValues.route.trim().length > 0
          ? row.fieldValues.route
          : null,
    })),
  );
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

async function listCollectionDocumentRows(
  organizationId: string,
  collectionId: string,
): Promise<CollectionDocumentRow[]> {
  const rows = await db
    .select({
      document: documentsTable,
      fieldValues: collectionFieldsTable.values,
    })
    .from(documentsTable)
    .leftJoin(
      collectionFieldsTable,
      and(
        eq(collectionFieldsTable.documentId, documentsTable.id),
        eq(collectionFieldsTable.collectionId, collectionId),
      ),
    )
    .where(
      and(
        eq(documentsTable.organizationId, organizationId),
        eq(documentsTable.collectionId, collectionId),
        sql`${documentsTable.deletedAt} IS NULL`,
        eq(documentsTable.published, true),
      ),
    );

  return rows.map((row) => ({
    document: row.document,
    fieldValues: (row.fieldValues as Record<string, unknown>) || {},
  }));
}

async function transformToDocumentResponse(
  doc: typeof documentsTable.$inferSelect,
  fieldValues: Record<string, unknown>,
  includeRelated: boolean,
  includeToc: boolean,
  fullPath?: string | null,
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
  const computedPath =
    fullPath === null
      ? "/"
      : typeof fullPath === "string"
        ? normalizeCollectionRoute(fullPath)
        : `/${toCollectionRouteSegment(doc.slug || doc.title || doc.id)}`;

  return {
    ...docWithoutYjs,
    fields: fieldValues,
    jsonContent,
    path: computedPath,
    fullPath: computedPath,
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
    const allRows = await listCollectionDocumentRows(organizationId, collection.id);
    const routeMap = buildRouteMap(allRows);

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
          routeMap.get(doc.document.id) ?? null,
        ),
      ),
    );

    return c.json({ documents: response });
  })
  .get("/:handle/routes", async (c) => {
    const organizationId = c.get("organizationId");
    const handle = c.req.param("handle");
    const includeRelated = c.req.query("include_related") === "true";
    const includeToc = c.req.query("include_toc") === "true";
    const targetRoute = "/";

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

    const rows = await listCollectionDocumentRows(organizationId, collection.id);
    const routeMap = buildRouteMap(rows);

    const row = rows.find((entry) => routeMap.get(entry.document.id) === targetRoute);
    if (!row) {
      throw new HTTPException(404, { message: "Route not found" });
    }

    const response = await transformToDocumentResponse(
      row.document,
      row.fieldValues,
      includeRelated,
      includeToc,
      routeMap.get(row.document.id) ?? null,
    );

    return c.json(response);
  })
  .get("/:handle/routes/*", async (c) => {
    const organizationId = c.get("organizationId");
    const handle = c.req.param("handle");
    const includeRelated = c.req.query("include_related") === "true";
    const includeToc = c.req.query("include_toc") === "true";
    const wildcard = c.req.param("*");
    const targetRoute = normalizeCollectionRoute(wildcard);

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

    const rows = await listCollectionDocumentRows(organizationId, collection.id);
    const routeMap = buildRouteMap(rows);

    const row = rows.find((entry) => routeMap.get(entry.document.id) === targetRoute);
    if (!row) {
      throw new HTTPException(404, { message: "Route not found" });
    }

    const response = await transformToDocumentResponse(
      row.document,
      row.fieldValues,
      includeRelated,
      includeToc,
      routeMap.get(row.document.id) ?? null,
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

    const routeMap = document.collectionId
      ? buildRouteMap(await listCollectionDocumentRows(organizationId, document.collectionId))
      : new Map<string, string>();

    const response = await transformToDocumentResponse(
      document,
      (fieldValuesResult[0]?.values as Record<string, unknown>) || {},
      includeRelated,
      includeToc,
      routeMap.get(document.id) ?? null,
    );

    return c.json(response);
  });
