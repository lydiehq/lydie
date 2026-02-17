import { convertYjsToJson } from "@lydie/core/yjs-to-json";
import { db, collectionSchemasTable, documentFieldValuesTable, documentsTable } from "@lydie/database";
import { desc, eq, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { extractTableOfContents } from "../../utils/toc";
import { transformDocumentLinksToInternalLinkMarks } from "../utils/link-transformer";
import { apiKeyAuth, externalRateLimit } from "./middleware";

// Default and max limits for pagination
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// Type for document list response (no content body)
type DocumentListItem = {
  id: string;
  title: string | null;
  fields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

// Type for paginated response
type PaginatedDocumentsResponse = {
  data: DocumentListItem[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
  };
};

// Type for document select (without yjsState for list queries)
type DocumentSelect = {
  id: string;
  title: string | null;
  fieldValues: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

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

/**
 * Build cursor condition for pagination
 * Cursor is a base64-encoded JSON object with id and createdAt
 */
function buildCursorCondition(
  cursor: string | undefined,
): SQL | undefined {
  if (!cursor) return undefined;

  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64").toString());
    if (decoded.id && decoded.createdAt) {
      return sql`(${documentsTable.createdAt}, ${documentsTable.id}) < (${decoded.createdAt}, ${decoded.id})`;
    }
  } catch {
    // Invalid cursor format, ignore it
  }

  return undefined;
}

/**
 * Encode cursor for next page
 */
function encodeCursor(item: DocumentSelect): string {
  const cursorData = {
    id: item.id,
    createdAt: item.createdAt.toISOString(),
  };
  return Buffer.from(JSON.stringify(cursorData)).toString("base64");
}

/**
 * Transform document to list item (no content body)
 */
function transformToDocumentListItem(doc: DocumentSelect): DocumentListItem {
  return {
    id: doc.id,
    title: doc.title,
    fields: doc.fieldValues || {},
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
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
  ];

  // Apply property filters on field values
  for (const [fieldName, value] of Object.entries(filters)) {
    conditions.push(
      sql`${documentFieldValuesTable.values}->>${fieldName} = ${value}`,
    );
  }

  // Combine all conditions with AND
  return conditions.reduce((acc, condition) => sql`${acc} AND ${condition}`);
}

/**
 * Collections API - External API for querying collection documents
 * Uses API key authentication
 */
export const CollectionsApi = new Hono()
  .use(apiKeyAuth)
  .use(externalRateLimit)
  /**
   * List documents in a collection
   * GET /v1/:idOrSlug/collections/:collectionId/documents
   *
   * Query params:
   * - limit: number (default 20, max 100)
   * - cursor: string (base64-encoded pagination cursor)
   * - filter[fieldName]: string (filter by field value)
   *
   * Response excludes content body (yjsState)
   */
  .get("/collections/:collectionId/documents", async (c) => {
    const organizationId = c.get("organizationId");
    const collectionId = c.req.param("collectionId");

    // Parse query parameters
    const query = c.req.query();
    const limit = Math.min(
      Math.max(
        Number.parseInt(query.limit || String(DEFAULT_LIMIT), 10),
        1,
      ),
      MAX_LIMIT,
    );
    const cursor = query.cursor;
    const filters = parseFilters(query);

    // Build where conditions
    let whereConditions = buildDocumentWhereConditions(
      organizationId,
      collectionId,
      filters,
    );

    // Add cursor condition if provided
    const cursorCondition = buildCursorCondition(cursor);
    if (cursorCondition) {
      whereConditions = sql`${whereConditions} AND ${cursorCondition}`;
    }

    // Fetch documents with their field values
    // Join with document_field_values to get all documents belonging to this collection
    const documents = await db
      .select({
        id: documentsTable.id,
        title: documentsTable.title,
        fieldValues: documentFieldValuesTable.values,
        createdAt: documentsTable.createdAt,
        updatedAt: documentsTable.updatedAt,
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
      .where(
        sql`${whereConditions} AND ${collectionSchemasTable.documentId} = ${collectionId}`,
      )
      .orderBy(desc(documentsTable.createdAt), desc(documentsTable.id))
      .limit(limit + 1);

    // Determine if there's a next page
    const hasMore = documents.length > limit;
    const data = documents.slice(0, limit);

    // Generate next cursor if there are more results
    const nextCursor = hasMore && data.length > 0
      ? encodeCursor(data[data.length - 1] as DocumentSelect)
      : null;

    // Transform to response format
    const response: PaginatedDocumentsResponse = {
      data: data.map((doc) => transformToDocumentListItem(doc as DocumentSelect)),
      pagination: {
        nextCursor,
        hasMore,
      },
    };

    return c.json(response);
  })
  /**
   * Fetch single document by ID
   * GET /v1/:idOrSlug/documents/:documentId
   *
   * Response includes content body (yjsState converted to JSON)
   */
  .get("/documents/:documentId", async (c) => {
    const organizationId = c.get("organizationId");
    const documentId = c.req.param("documentId");
    const includeToc = c.req.query("include_toc") === "true";

    // Fetch the document
    const documentResult = await db
      .select()
      .from(documentsTable)
      .where(
        sql`${documentsTable.id} = ${documentId} AND ${documentsTable.organizationId} = ${organizationId} AND ${documentsTable.deletedAt} IS NULL`,
      )
      .limit(1);
    
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
        sql`${documentFieldValuesTable.documentId} = ${documentId} AND ${collectionSchemasTable.documentId} = ${document.nearestCollectionId}`,
      )
      .limit(1);

    const fieldValues = fieldValuesResult[0]?.values || {};

    // Convert YJS state to JSON content
    let jsonContent: ReturnType<typeof convertYjsToJson> = null;
    if (document.yjsState) {
      const rawContent = convertYjsToJson(document.yjsState);
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

    // Build response
    const response = {
      id: document.id,
      title: document.title,
      fields: fieldValues as Record<string, unknown>,
      content: jsonContent,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
      ...(includeToc && { toc }),
    };

    return c.json(response);
  });
