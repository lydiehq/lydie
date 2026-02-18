import { findRelatedDocuments } from "@lydie/core/embedding/search";
import { convertYjsToJson } from "@lydie/core/yjs-to-json";
import {
  db,
  collectionSchemasTable,
  documentFieldValuesTable,
  documentsTable,
} from "@lydie/database";
import { desc, eq, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { extractTableOfContents } from "../../utils/toc";
import { transformDocumentLinksToInternalLinkMarks } from "../utils/link-transformer";
import { apiKeyAuth, externalRateLimit } from "./middleware";

/**
 * Parse filter parameters from query string
 * Filters are in the format: filter[fieldName]=value
 */
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

type SchemaWithProperties = {
  id: string;
  documentId?: string;
  properties: unknown;
};

function getUniquePropertyNames(properties: unknown): string[] {
  if (!Array.isArray(properties)) {
    return [];
  }

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
  schemas: SchemaWithProperties[],
  identifier: string,
): SQL | null {
  const conditions: SQL[] = [];

  for (const schema of schemas) {
    const uniqueNames = getUniquePropertyNames(schema.properties);
    for (const propertyName of uniqueNames) {
      conditions.push(
        sql`(${documentFieldValuesTable.collectionSchemaId} = ${schema.id} AND ${documentFieldValuesTable.values}->>${propertyName} = ${identifier})`,
      );
    }
  }

  if (conditions.length === 0) {
    return null;
  }

  return conditions.reduce((acc, condition) => sql`${acc} OR ${condition}`);
}

/**
 * Resolve collection identifier (ID or unique property value) to collection ID
 * First tries to find by ID, then queries by unique properties defined in collection schemas
 */
async function resolveCollectionId(
  organizationId: string,
  identifier: string,
): Promise<string | null> {
  // First try to find by ID (fast path for UUIDs)
  const byId = await db
    .select({ id: documentsTable.id })
    .from(documentsTable)
    .innerJoin(collectionSchemasTable, eq(documentsTable.id, collectionSchemasTable.documentId))
    .where(
      sql`${documentsTable.id} = ${identifier} AND ${documentsTable.organizationId} = ${organizationId} AND ${documentsTable.deletedAt} IS NULL`,
    )
    .limit(1);

  if (byId.length > 0) {
    return byId[0].id;
  }

  // Get all collection schemas for this organization to find unique properties
  const schemas = await db
    .select({
      id: collectionSchemasTable.id,
      documentId: collectionSchemasTable.documentId,
      properties: collectionSchemasTable.properties,
    })
    .from(collectionSchemasTable)
    .innerJoin(documentsTable, eq(collectionSchemasTable.documentId, documentsTable.id))
    .where(
      sql`${documentsTable.organizationId} = ${organizationId} AND ${documentsTable.deletedAt} IS NULL`,
    );

  const uniquePropertyMatchWhere = buildUniquePropertyMatchWhere(schemas, identifier);
  if (!uniquePropertyMatchWhere) {
    return null;
  }

  const uniqueMatch = await db
    .select({ collectionId: collectionSchemasTable.documentId })
    .from(documentFieldValuesTable)
    .innerJoin(
      collectionSchemasTable,
      eq(documentFieldValuesTable.collectionSchemaId, collectionSchemasTable.id),
    )
    .where(uniquePropertyMatchWhere)
    .limit(1);

  if (uniqueMatch.length > 0) {
    return uniqueMatch[0].collectionId;
  }

  return null;
}

/**
 * Build where conditions for document queries
 */
function buildDocumentWhereConditions(
  organizationId: string,
  collectionId: string,
  filters: Record<string, string>,
): SQL {
  const conditions: SQL[] = [
    sql`${documentsTable.organizationId} = ${organizationId}`,
    sql`${documentsTable.nearestCollectionId} = ${collectionId}`,
    sql`${documentsTable.deletedAt} IS NULL`,
    sql`${documentsTable.published} = true`,
  ];

  // Apply property filters on field values
  for (const [fieldName, value] of Object.entries(filters)) {
    conditions.push(sql`${documentFieldValuesTable.values}->>${fieldName} = ${value}`);
  }

  // Combine all conditions with AND
  return conditions.reduce((acc, condition) => sql`${acc} AND ${condition}`);
}

/**
 * Transform document to response format with full content
 */
async function transformToDocumentResponse(
  doc: typeof documentsTable.$inferSelect,
  fieldValues: Record<string, unknown>,
  includeRelated: boolean,
  includeToc: boolean,
): Promise<Record<string, unknown>> {
  // Convert YJS state to JSON content
  let jsonContent: ReturnType<typeof convertYjsToJson> = null;
  if (doc.yjsState) {
    const rawContent = convertYjsToJson(doc.yjsState);
    jsonContent = await transformDocumentLinksToInternalLinkMarks(rawContent);
  }

  // Extract table of contents if requested
  let toc: Array<{ id: string; level: number; text: string }> = [];
  if (includeToc && jsonContent) {
    try {
      toc = extractTableOfContents(jsonContent);
    } catch (error) {
      console.error("Error extracting table of contents:", error);
    }
  }

  // Find related documents if requested
  let related: Awaited<ReturnType<typeof findRelatedDocuments>> = [];
  if (includeRelated && doc.id) {
    try {
      related = await findRelatedDocuments(doc.id, doc.organizationId, 5);
    } catch (error) {
      console.error("Error fetching related documents:", error);
    }
  }

  const { yjsState: _, ...docWithoutYjs } = doc;
  const resolvedSlug =
    typeof fieldValues.slug === "string" && fieldValues.slug.length > 0 ? fieldValues.slug : doc.id;

  return {
    ...docWithoutYjs,
    fields: fieldValues,
    jsonContent,
    path: "/",
    fullPath: `/${resolvedSlug}`,
    ...(includeRelated && { related }),
    ...(includeToc && { toc }),
  };
}

/**
 * Collections API - External API for querying collection documents
 * Uses API key authentication
 */
export const CollectionsApi = new Hono()
  .use(apiKeyAuth)
  .use(externalRateLimit)
  /**
   * List documents in a collection with full content
   * GET /v1/:idOrSlug/collections/:collectionId/documents
   *
   * Query params:
   * - filter[fieldName]: string (filter by field value)
   * - include_related: boolean (include related documents)
   * - include_toc: boolean (include table of contents)
   *
   * Response includes content body (yjsState converted to JSON)
   */
  .get("/collections/:collectionId/documents", async (c) => {
    const organizationId = c.get("organizationId");
    const collectionIdentifier = c.req.param("collectionId");
    const includeRelated = c.req.query("include_related") === "true";
    const includeToc = c.req.query("include_toc") === "true";

    // Resolve collection identifier (ID or slug) to actual collection ID
    const collectionId = await resolveCollectionId(organizationId, collectionIdentifier);

    if (!collectionId) {
      throw new HTTPException(404, {
        message: "Collection not found",
      });
    }

    // Parse query parameters
    const query = c.req.query();
    const filters = parseFilters(query);

    // Build where conditions
    const whereConditions = buildDocumentWhereConditions(organizationId, collectionId, filters);

    // Fetch all documents with their field values and full content
    const documents = await db
      .select({
        document: documentsTable,
        fieldValues: documentFieldValuesTable.values,
      })
      .from(documentsTable)
      .innerJoin(
        documentFieldValuesTable,
        eq(documentsTable.id, documentFieldValuesTable.documentId),
      )
      .innerJoin(
        collectionSchemasTable,
        eq(documentFieldValuesTable.collectionSchemaId, collectionSchemasTable.id),
      )
      .where(sql`${whereConditions} AND ${collectionSchemasTable.documentId} = ${collectionId}`)
      .orderBy(desc(documentsTable.createdAt), desc(documentsTable.id));

    // Transform to response format with full content
    const response = await Promise.all(
      documents.map((doc) =>
        transformToDocumentResponse(
          doc.document,
          doc.fieldValues || {},
          includeRelated,
          includeToc,
        ),
      ),
    );

    return c.json({ documents: response });
  })
  /**
   * Fetch single document by ID or unique property value
   * GET /v1/:idOrSlug/documents/:documentIdOrPropertyValue
   *
   * Response includes content body (yjsState converted to JSON)
   */
  .get("/documents/:documentIdOrPropertyValue", async (c) => {
    const organizationId = c.get("organizationId");
    const identifier = c.req.param("documentIdOrPropertyValue");
    const includeRelated = c.req.query("include_related") === "true";
    const includeToc = c.req.query("include_toc") === "true";

    // Try to fetch by ID first (fast path)
    let documentResult = await db
      .select()
      .from(documentsTable)
      .where(
        sql`${documentsTable.id} = ${identifier} AND ${documentsTable.organizationId} = ${organizationId} AND ${documentsTable.deletedAt} IS NULL AND ${documentsTable.published} = true`,
      )
      .limit(1);

    // If not found by ID, try by unique collection property values
    if (documentResult.length === 0) {
      // Get all collection schemas to find unique properties
      const schemas = await db
        .select({
          id: collectionSchemasTable.id,
          properties: collectionSchemasTable.properties,
        })
        .from(collectionSchemasTable)
        .innerJoin(documentsTable, eq(collectionSchemasTable.documentId, documentsTable.id))
        .where(
          sql`${documentsTable.organizationId} = ${organizationId} AND ${documentsTable.deletedAt} IS NULL`,
        );

      const uniquePropertyMatchWhere = buildUniquePropertyMatchWhere(schemas, identifier);

      if (uniquePropertyMatchWhere) {
        const documentsByUniqueProperty = await db
          .select({ document: documentsTable })
          .from(documentFieldValuesTable)
          .innerJoin(documentsTable, eq(documentFieldValuesTable.documentId, documentsTable.id))
          .where(
            sql`${uniquePropertyMatchWhere} AND ${documentsTable.organizationId} = ${organizationId} AND ${documentsTable.deletedAt} IS NULL AND ${documentsTable.published} = true`,
          )
          .limit(1);

        documentResult = documentsByUniqueProperty.map((result) => result.document);
      }
    }

    const document = documentResult[0];

    if (!document) {
      throw new HTTPException(404, {
        message: "Document not found",
      });
    }

    // Fetch field values for this document
    const fieldValuesResult = await db
      .select({
        values: documentFieldValuesTable.values,
      })
      .from(documentFieldValuesTable)
      .innerJoin(
        collectionSchemasTable,
        eq(documentFieldValuesTable.collectionSchemaId, collectionSchemasTable.id),
      )
      .where(
        sql`${documentFieldValuesTable.documentId} = ${document.id} AND ${collectionSchemasTable.documentId} = ${document.nearestCollectionId}`,
      )
      .limit(1);

    const fieldValues = fieldValuesResult[0]?.values || {};

    // Transform to response format with full content
    const response = await transformToDocumentResponse(
      document,
      fieldValues,
      includeRelated,
      includeToc,
    );

    return c.json(response);
  });
