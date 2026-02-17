import { convertYjsToJson } from "@lydie/core/yjs-to-json";
import { db, documentsTable } from "@lydie/database";
import { desc, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { extractTableOfContents } from "../../utils/toc";
import { transformDocumentLinksToInternalLinkMarks } from "../utils/link-transformer";
import { apiKeyAuth, externalRateLimit } from "../external/middleware";

// Default and max limits for pagination
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// Type for entry list response (no content body)
type EntryListItem = {
  id: string;
  title: string | null;
  fields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

// Type for paginated response
type PaginatedEntriesResponse = {
  data: EntryListItem[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
  };
};

// Type for entry select (without yjsState for list queries)
type EntrySelect = {
  id: string;
  title: string | null;
  properties: Record<string, string | number | boolean | null> | null;
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
function encodeCursor(item: EntrySelect): string {
  const cursorData = {
    id: item.id,
    createdAt: item.createdAt.toISOString(),
  };
  return Buffer.from(JSON.stringify(cursorData)).toString("base64");
}

/**
 * Transform document to entry list item (no content body)
 */
function transformToEntryListItem(doc: EntrySelect): EntryListItem {
  // Fields come from properties only - no special first-class fields
  const fields: Record<string, unknown> = {
    ...(doc.properties || {}),
  };

  return {
    id: doc.id,
    title: doc.title,
    fields,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/**
 * Build where conditions for entry queries
 * All filters are applied to the properties JSONB field
 */
function buildEntryWhereConditions(
  organizationId: string,
  collectionId: string,
  filters: Record<string, string>,
): SQL {
  const conditions: SQL[] = [
    sql`${documentsTable.organizationId} = ${organizationId}`,
    sql`${documentsTable.collectionId} = ${collectionId}`,
    sql`${documentsTable.deletedAt} IS NULL`,
  ];

  // Apply property filters - all fields are in properties JSONB
  for (const [fieldName, value] of Object.entries(filters)) {
    conditions.push(
      sql`${documentsTable.properties}->>${fieldName} = ${value}`,
    );
  }

  // Combine all conditions with AND
  return conditions.reduce((acc, condition) => sql`${acc} AND ${condition}`);
}

export const V1Api = new Hono()
  .use(apiKeyAuth)
  .use(externalRateLimit)
  /**
   * List entries in a collection
   * GET /v1/collections/:collectionId/entries
   *
   * Query params:
   * - limit: number (default 20, max 100)
   * - cursor: string (base64-encoded pagination cursor)
   * - filter[fieldName]: string (filter by field value)
   *
   * Response excludes content body (yjsState)
   */
  .get("/collections/:collectionId/entries", async (c) => {
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
    let whereConditions = buildEntryWhereConditions(
      organizationId,
      collectionId,
      filters,
    );

    // Add cursor condition if provided
    const cursorCondition = buildCursorCondition(cursor);
    if (cursorCondition) {
      whereConditions = sql`${whereConditions} AND ${cursorCondition}`;
    }

    // Fetch entries (limit + 1 to determine if there's a next page)
    const entries = await db
      .select({
        id: documentsTable.id,
        title: documentsTable.title,
        properties: documentsTable.properties,
        createdAt: documentsTable.createdAt,
        updatedAt: documentsTable.updatedAt,
      })
      .from(documentsTable)
      .where(whereConditions)
      .orderBy(desc(documentsTable.createdAt), desc(documentsTable.id))
      .limit(limit + 1);

    // Determine if there's a next page
    const hasMore = entries.length > limit;
    const data = entries.slice(0, limit);

    // Generate next cursor if there are more results
    const nextCursor = hasMore && data.length > 0
      ? encodeCursor(data[data.length - 1] as EntrySelect)
      : null;

    // Transform to response format
    const response: PaginatedEntriesResponse = {
      data: data.map((doc) => transformToEntryListItem(doc as EntrySelect)),
      pagination: {
        nextCursor,
        hasMore,
      },
    };

    return c.json(response);
  })
  /**
   * Fetch single entry by ID
   * GET /v1/entries/:entryId
   *
   * Response includes content body (yjsState converted to JSON)
   */
  .get("/entries/:entryId", async (c) => {
    const organizationId = c.get("organizationId");
    const entryId = c.req.param("entryId");
    const includeToc = c.req.query("include_toc") === "true";

    // Fetch the entry
    const entryResult = await db
      .select()
      .from(documentsTable)
      .where(
        sql`${documentsTable.id} = ${entryId} AND ${documentsTable.organizationId} = ${organizationId} AND ${documentsTable.deletedAt} IS NULL`,
      )
      .limit(1);
    
    const entry = entryResult[0];

    if (!entry) {
      throw new HTTPException(404, {
        message: "Entry not found",
      });
    }

    // Convert YJS state to JSON content
    let jsonContent: ReturnType<typeof convertYjsToJson> = null;
    if (entry.yjsState) {
      const rawContent = convertYjsToJson(entry.yjsState);
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

    // Build fields object from properties only
    const fields: Record<string, unknown> = {
      ...(entry.properties || {}),
    };

    // Build response
    const response = {
      id: entry.id,
      title: entry.title,
      fields,
      content: jsonContent,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
      ...(includeToc && { toc }),
    };

    return c.json(response);
  });
