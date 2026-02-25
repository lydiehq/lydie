import { findRelatedDocuments } from "@lydie/core/embedding/search";
import { convertYjsToJson } from "@lydie/core/yjs-to-json";
import { collectionFieldsTable, collectionsTable, db, documentsTable } from "@lydie/database";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { extractTableOfContents } from "../../utils/toc";
import { transformDocumentLinksToInternalLinkMarks } from "../utils/link-transformer";
import { apiKeyAuth, externalRateLimit } from "./middleware";

type SortBy = "created_at" | "updated_at" | "title";
type SortOrder = "asc" | "desc";
type RelatedScope = "any" | "same_collection" | "collection_handle";

type RelatedQueryOptions = {
  limit: number;
  collectionId?: string;
};

type FieldFilter =
  | {
      field: string;
      operator: "equals";
      value: string;
    }
  | {
      field: string;
      operator: "contains";
      value: string;
    };

type PopulateSelection = "all" | Set<string>;

type RelationPropertyConfig = {
  many: boolean;
  targetCollectionId: string;
};

function parseSortBy(value: string | undefined): SortBy {
  if (value === "updated_at" || value === "title") {
    return value;
  }

  return "created_at";
}

function parseSortOrder(value: string | undefined): SortOrder {
  return value === "asc" ? "asc" : "desc";
}

function parseRelatedScope(value: string | undefined): RelatedScope {
  if (value === "same_collection" || value === "collection_handle") {
    return value;
  }

  return "any";
}

function parseRelatedLimit(value: string | undefined): number {
  if (!value) {
    return 5;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 5;
  }

  return Math.max(1, Math.min(10, Math.trunc(parsed)));
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

function parseFieldFilters(query: Record<string, string>): FieldFilter[] {
  const filters: FieldFilter[] = [];

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "") {
      continue;
    }

    const legacyMatch = key.match(/^filter\[(.+)\]$/);
    if (legacyMatch) {
      filters.push({
        field: legacyMatch[1],
        operator: "equals",
        value,
      });
      continue;
    }

    const whereContainsMatch = key.match(/^where\[(.+)\]\[contains\]$/);
    if (whereContainsMatch) {
      filters.push({
        field: whereContainsMatch[1],
        operator: "contains",
        value,
      });
      continue;
    }

    const whereEqualsMatch = key.match(/^where\[(.+)\](?:\[equals\])?$/);
    if (whereEqualsMatch) {
      filters.push({
        field: whereEqualsMatch[1],
        operator: "equals",
        value,
      });
    }
  }

  return filters;
}

function parsePopulateSelection(value: string | undefined): PopulateSelection | null {
  if (!value) {
    return null;
  }

  if (value === "*") {
    return "all";
  }

  const fields = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (fields.length === 0) {
    return null;
  }

  return new Set(fields);
}

function getRelationPropertyConfigs(
  properties: unknown,
  currentCollectionId: string,
): Map<string, RelationPropertyConfig> {
  const relationProperties = new Map<string, RelationPropertyConfig>();

  if (!Array.isArray(properties)) {
    return relationProperties;
  }

  for (const property of properties) {
    if (typeof property !== "object" || property === null) {
      continue;
    }

    const relationProperty = property as {
      name?: unknown;
      type?: unknown;
      relation?: { targetCollectionId?: unknown; many?: unknown } | null;
    };

    if (relationProperty.type !== "relation" || typeof relationProperty.name !== "string") {
      continue;
    }

    const targetCollectionId =
      relationProperty.relation?.targetCollectionId === "self" ||
      relationProperty.relation?.targetCollectionId === undefined
        ? currentCollectionId
        : typeof relationProperty.relation?.targetCollectionId === "string"
          ? relationProperty.relation.targetCollectionId
          : currentCollectionId;

    relationProperties.set(relationProperty.name, {
      many: relationProperty.relation?.many === true,
      targetCollectionId,
    });
  }

  return relationProperties;
}

function shouldPopulateField(populate: PopulateSelection | null, fieldName: string): boolean {
  if (!populate) {
    return false;
  }

  if (populate === "all") {
    return true;
  }

  return populate.has(fieldName);
}

function normalizeRelationIds(value: unknown): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  return [];
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
  relationPropertyConfigs: Map<string, RelationPropertyConfig>,
  populate: PopulateSelection | null,
  relatedQueryOptions: RelatedQueryOptions | null,
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
  if (relatedQueryOptions && doc.id) {
    try {
      related = await findRelatedDocuments(doc.id, doc.organizationId, relatedQueryOptions.limit, {
        collectionId: relatedQueryOptions.collectionId,
      });

      const relatedDocumentIds = related
        .map((relatedDocument) => relatedDocument.id)
        .filter((id): id is string => typeof id === "string");

      if (relatedDocumentIds.length > 0) {
        const relatedFieldValues = await db
          .select({
            documentId: collectionFieldsTable.documentId,
            values: collectionFieldsTable.values,
          })
          .from(collectionFieldsTable)
          .where(inArray(collectionFieldsTable.documentId, relatedDocumentIds));

        const fieldsByDocumentId = new Map<string, Record<string, unknown>>(
          relatedFieldValues.map((entry) => [
            entry.documentId,
            (entry.values as Record<string, unknown>) || {},
          ]),
        );

        related = related.map((relatedDocument) => ({
          ...relatedDocument,
          fields: fieldsByDocumentId.get(relatedDocument.id) || {},
        }));
      }
    } catch (error) {
      console.error("Error fetching related documents:", error);
    }
  }

  const { yjsState: _, ...docWithoutYjs } = doc;

  const responseFieldValues = { ...fieldValues };

  if (populate) {
    for (const [fieldName, relationConfig] of relationPropertyConfigs.entries()) {
      if (!shouldPopulateField(populate, fieldName)) {
        continue;
      }

      const relationIds = normalizeRelationIds(responseFieldValues[fieldName]);
      if (relationIds.length === 0) {
        responseFieldValues[fieldName] = relationConfig.many ? [] : null;
        continue;
      }

      const relatedDocuments = await db
        .select({
          document: documentsTable,
          fieldValues: collectionFieldsTable.values,
        })
        .from(documentsTable)
        .leftJoin(
          collectionFieldsTable,
          and(
            eq(collectionFieldsTable.documentId, documentsTable.id),
            eq(collectionFieldsTable.collectionId, documentsTable.collectionId),
          ),
        )
        .where(
          and(
            inArray(documentsTable.id, relationIds),
            eq(documentsTable.organizationId, doc.organizationId),
            eq(documentsTable.collectionId, relationConfig.targetCollectionId),
            sql`${documentsTable.deletedAt} IS NULL`,
            eq(documentsTable.published, true),
          ),
        );

      const relatedById = new Map(
        relatedDocuments.map((entry) => {
          const { yjsState: __, ...relatedDocWithoutYjs } = entry.document;
          return [
            entry.document.id,
            {
              ...relatedDocWithoutYjs,
              fields: (entry.fieldValues as Record<string, unknown>) || {},
            },
          ];
        }),
      );

      const populatedValue = relationIds
        .map((relationId) => relatedById.get(relationId))
        .filter(Boolean) as Array<Record<string, unknown>>;

      responseFieldValues[fieldName] = relationConfig.many ? populatedValue : populatedValue[0] ?? null;
    }
  }

  return {
    ...docWithoutYjs,
    fields: responseFieldValues,
    jsonContent,
    ...(relatedQueryOptions && { related }),
    ...(includeToc && { toc }),
  };
}

async function resolveCollectionIdByHandle(
  organizationId: string,
  handle: string,
): Promise<string | null> {
  const collectionResult = await db
    .select({ id: collectionsTable.id })
    .from(collectionsTable)
    .where(
      and(eq(collectionsTable.organizationId, organizationId), eq(collectionsTable.handle, handle)),
    )
    .limit(1);

  return collectionResult[0]?.id ?? null;
}

async function resolveRelatedQueryOptions(params: {
  includeRelated: boolean;
  organizationId: string;
  relatedScope: RelatedScope;
  relatedCollectionHandle?: string;
  relatedLimit: number;
  currentCollectionId?: string | null;
}): Promise<RelatedQueryOptions | null> {
  const {
    includeRelated,
    organizationId,
    relatedScope,
    relatedCollectionHandle,
    relatedLimit,
    currentCollectionId,
  } = params;

  if (!includeRelated) {
    return null;
  }

  if (relatedScope === "same_collection") {
    return {
      limit: relatedLimit,
      collectionId: currentCollectionId || undefined,
    };
  }

  if (relatedScope === "collection_handle") {
    if (!relatedCollectionHandle) {
      throw new HTTPException(400, { message: "related_collection_handle is required" });
    }

    const relatedCollectionId = await resolveCollectionIdByHandle(
      organizationId,
      relatedCollectionHandle,
    );

    if (!relatedCollectionId) {
      throw new HTTPException(404, {
        message: "Related collection not found",
      });
    }

    return {
      limit: relatedLimit,
      collectionId: relatedCollectionId,
    };
  }

  return { limit: relatedLimit };
}

export const CollectionsApi = new Hono()
  .use(apiKeyAuth)
  .use(externalRateLimit)
  .get("/:handle/documents", async (c) => {
    const organizationId = c.get("organizationId");
    const handle = c.req.param("handle");
    const includeRelated = c.req.query("include_related") === "true";
    const relatedScope = parseRelatedScope(c.req.query("related_scope"));
    const relatedCollectionHandle = c.req.query("related_collection_handle");
    const relatedLimit = parseRelatedLimit(c.req.query("related_limit"));
    const includeToc = c.req.query("include_toc") === "true";
    const sortBy = parseSortBy(c.req.query("sort_by"));
    const sortOrder = parseSortOrder(c.req.query("sort_order"));
    const populate = parsePopulateSelection(c.req.query("populate"));

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

    const filters = parseFieldFilters(c.req.query());
    const relationPropertyConfigs = getRelationPropertyConfigs(collection.properties, collection.id);

    const whereConditions: SQL[] = [
      eq(documentsTable.organizationId, organizationId),
      eq(documentsTable.collectionId, collection.id),
      sql`${documentsTable.deletedAt} IS NULL`,
      eq(documentsTable.published, true),
    ];

    for (const filter of filters) {
      if (filter.operator === "contains") {
        whereConditions.push(
          sql`${collectionFieldsTable.values}->${filter.field} @> ${JSON.stringify([filter.value])}::jsonb`,
        );
        continue;
      }

      whereConditions.push(sql`${collectionFieldsTable.values}->>${filter.field} = ${filter.value}`);
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

    const relatedQueryOptions = await resolveRelatedQueryOptions({
      includeRelated,
      organizationId,
      relatedScope,
      relatedCollectionHandle,
      relatedLimit,
      currentCollectionId: collection.id,
    });

    const response = await Promise.all(
      documents.map((doc) =>
        transformToDocumentResponse(
          doc.document,
          (doc.fieldValues as Record<string, unknown>) || {},
          relationPropertyConfigs,
          populate,
          relatedQueryOptions,
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
    const relatedScope = parseRelatedScope(c.req.query("related_scope"));
    const relatedCollectionHandle = c.req.query("related_collection_handle");
    const relatedLimit = parseRelatedLimit(c.req.query("related_limit"));
    const includeToc = c.req.query("include_toc") === "true";
    const populate = parsePopulateSelection(c.req.query("populate"));

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

    const document = await findCollectionDocumentByIdentifier(
      organizationId,
      collection,
      identifier,
    );

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

    const relatedQueryOptions = await resolveRelatedQueryOptions({
      includeRelated,
      organizationId,
      relatedScope,
      relatedCollectionHandle,
      relatedLimit,
      currentCollectionId: collection.id,
    });

    const relationPropertyConfigs = getRelationPropertyConfigs(collection.properties, collection.id);

    const response = await transformToDocumentResponse(
      document,
      (fieldValuesResult[0]?.values as Record<string, unknown>) || {},
      relationPropertyConfigs,
      populate,
      relatedQueryOptions,
      includeToc,
    );

    return c.json(response);
  })
  .get("/documents/:documentIdOrPropertyValue", async (c) => {
    const organizationId = c.get("organizationId");
    const identifier = c.req.param("documentIdOrPropertyValue");
    const includeRelated = c.req.query("include_related") === "true";
    const relatedScope = parseRelatedScope(c.req.query("related_scope"));
    const relatedCollectionHandle = c.req.query("related_collection_handle");
    const relatedLimit = parseRelatedLimit(c.req.query("related_limit"));
    const includeToc = c.req.query("include_toc") === "true";
    const populate = parsePopulateSelection(c.req.query("populate"));

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

    const [collection] = document.collectionId
      ? await db
          .select({ properties: collectionsTable.properties, id: collectionsTable.id })
          .from(collectionsTable)
          .where(
            and(
              eq(collectionsTable.id, document.collectionId),
              eq(collectionsTable.organizationId, organizationId),
            ),
          )
          .limit(1)
      : [];

    const relationPropertyConfigs =
      collection && document.collectionId
        ? getRelationPropertyConfigs(collection.properties, document.collectionId)
        : new Map<string, RelationPropertyConfig>();

    const response = await transformToDocumentResponse(
      document,
      (fieldValuesResult[0]?.values as Record<string, unknown>) || {},
      relationPropertyConfigs,
      populate,
      await resolveRelatedQueryOptions({
        includeRelated,
        organizationId,
        relatedScope,
        relatedCollectionHandle,
        relatedLimit,
        currentCollectionId: document.collectionId,
      }),
      includeToc,
    );

    return c.json(response);
  });
