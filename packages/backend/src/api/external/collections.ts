import { findRelatedDocuments } from "@lydie/core/embedding/search";
import { createId } from "@lydie/core/id";
import { convertYjsToJson } from "@lydie/core/yjs-to-json";
import { collectionFieldsTable, collectionsTable, db, documentsTable } from "@lydie/database";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { describeRoute, resolver, validator } from "hono-openapi";
import { Hono, type MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import * as v from "valibot";

import { extractTableOfContents } from "../../utils/toc";
import { transformDocumentLinksToInternalLinkMarks } from "../utils/link-transformer";
import { apiKeyAuth, externalRateLimit } from "./middleware";

type FieldValue = string | number | boolean | string[] | null;
type RowDocument = {
  id: string;
  title: string;
  collectionId: string | null;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  coverImage: string | null;
  yjsState: string | null;
  organizationId: string;
};

type ApiDocument = {
  id: string;
  collectionId: string;
  parentId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  coverImage: string | null;
  fields: Record<string, FieldValue | unknown>;
  related?: string[];
  children?: ApiDocument[];
  jsonContent?: ReturnType<typeof convertYjsToJson>;
  toc?: Array<{ id: string; level: number; text: string }>;
};

type FilterOp = "$eq" | "$in" | "$gt" | "$lt" | "$like" | "$null";
type Filter = { field: string; op: FilterOp; rawValue: string };

const SAFE_FIELD_RE = /^[a-z_][a-z0-9_]*$/;
const collectionParamsSchema = v.object({
  collectionId: v.string(),
});
const documentLookupParamsSchema = v.object({
  collectionId: v.string(),
  value: v.string(),
});
const documentIdParamsSchema = v.object({
  collectionId: v.string(),
  docId: v.string(),
});
const documentBodySchema = v.object({
  title: v.optional(v.string()),
  parentId: v.optional(v.nullable(v.string())),
  fields: v.optional(v.record(v.string(), v.any())),
  published: v.optional(v.boolean()),
});
const collectionSettingsBodySchema = v.object({
  lookupKey: v.optional(v.nullable(v.string())),
  indexedFields: v.optional(v.array(v.string())),
});
const defaultEnvelopeSchema = v.object({
  data: v.optional(v.any()),
  meta: v.optional(v.any()),
  error: v.optional(v.any()),
});

function parseLimit(value: string | undefined, defaultValue: number, maxValue: number): number {
  const parsed = value ? Number(value) : defaultValue;
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.max(1, Math.min(maxValue, Math.trunc(parsed)));
}

function parseDepth(value: string | undefined): number {
  if (!value) return 1;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.trunc(parsed);
}

function parseIncludes(value: string | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

function parseFields(value: string | undefined): Set<string> | null {
  if (!value) return null;
  const values = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return values.length > 0 ? new Set(values) : null;
}

function decodeCursor(cursor: string | undefined): { lastValue: string; lastId: string } | null {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as { lastValue?: unknown; lastId?: unknown };
    if (typeof parsed.lastValue !== "string" || typeof parsed.lastId !== "string") {
      throw new Error("Invalid cursor");
    }
    return { lastValue: parsed.lastValue, lastId: parsed.lastId };
  } catch {
    throw new HTTPException(400, {
      message: JSON.stringify({
        error: {
          code: "INVALID_CURSOR",
          message: "Cursor is malformed or expired",
        },
      }),
    });
  }
}

function encodeCursor(value: string, id: string): string {
  return Buffer.from(JSON.stringify({ lastValue: value, lastId: id }), "utf8").toString("base64");
}

function parseFilters(url: URL): Filter[] {
  const filters: Filter[] = [];
  for (const [key, value] of url.searchParams.entries()) {
    if (!key.startsWith("filter[")) continue;
    const opMatch = key.match(/^filter\[([^\]]+)\](?:\[(\$eq|\$in|\$gt|\$lt|\$like|\$null)\])?$/);
    if (!opMatch) {
      throw new HTTPException(400, {
        message: JSON.stringify({
          error: {
            code: "INVALID_FILTER_OPERATOR",
            message: `Unknown filter syntax '${key}'`,
          },
        }),
      });
    }

    const [, field, op] = opMatch;
    if (!field) continue;
    filters.push({ field, op: (op as FilterOp | undefined) ?? "$eq", rawValue: value });
  }
  return filters;
}

function getLookupConfig(properties: unknown): { lookupKey: string | null; indexedFields: string[] } {
  if (!Array.isArray(properties)) return { lookupKey: null, indexedFields: [] };

  let lookupKey: string | null = null;
  const indexedFields: string[] = [];

  for (const raw of properties) {
    if (typeof raw !== "object" || raw === null) continue;
    const property = raw as { name?: unknown; unique?: unknown; indexed?: unknown };
    if (typeof property.name !== "string") continue;

    if (property.unique === true && lookupKey === null) {
      lookupKey = property.name;
    }

    if (property.indexed === true) {
      indexedFields.push(property.name);
    }
  }

  return { lookupKey, indexedFields };
}

function sanitizeIndexToken(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/^_+/, "")
    .slice(0, 20);
  return normalized.length > 0 ? normalized : "collection";
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function getLookupIndexName(collectionId: string): string {
  return `idx_cf_l_${sanitizeIndexToken(collectionId)}`;
}

function getFilterIndexName(collectionId: string, field: string): string {
  return `idx_cf_f_${sanitizeIndexToken(collectionId)}_${sanitizeIndexToken(field)}`;
}

async function syncCollectionFieldIndexes(params: {
  collectionId: string;
  previousLookupKey: string | null;
  previousIndexedFields: string[];
  lookupKey: string | null;
  indexedFields: string[];
}) {
  const { collectionId, previousLookupKey, previousIndexedFields, lookupKey, indexedFields } = params;

  const dropIndexNames = new Set<string>();
  if (previousLookupKey || lookupKey) {
    dropIndexNames.add(getLookupIndexName(collectionId));
  }

  for (const field of new Set([...previousIndexedFields, ...indexedFields])) {
    dropIndexNames.add(getFilterIndexName(collectionId, field));
  }

  for (const indexName of dropIndexNames) {
    await db.execute(sql.raw(`DROP INDEX IF EXISTS ${quoteIdentifier(indexName)}`));
  }

  if (lookupKey) {
    await db.execute(
      sql.raw(
        `CREATE UNIQUE INDEX ${quoteIdentifier(getLookupIndexName(collectionId))} ON collection_fields ((values->>'${lookupKey}'), collection_id)`,
      ),
    );
  }

  for (const field of indexedFields) {
    await db.execute(
      sql.raw(
        `CREATE INDEX ${quoteIdentifier(getFilterIndexName(collectionId, field))} ON collection_fields ((values->>'${field}'), collection_id)`,
      ),
    );
  }
}

function getSortableValue(document: ApiDocument, sortField: string): string {
  if (sortField === "created_at") return document.createdAt;
  if (sortField === "updated_at") return document.updatedAt;
  const value = document.fields[sortField];
  return value === null || value === undefined ? "" : String(value);
}

function applyFilters(documents: ApiDocument[], filters: Filter[]): ApiDocument[] {
  return documents.filter((document) => {
    return filters.every((filter) => {
      const value = document.fields[filter.field];
      const stringValue = value === null || value === undefined ? "" : String(value);

      if (filter.op === "$eq") return stringValue === filter.rawValue;
      if (filter.op === "$in") {
        const values = filter.rawValue
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
        return values.includes(stringValue);
      }
      if (filter.op === "$gt") return stringValue > filter.rawValue;
      if (filter.op === "$lt") return stringValue < filter.rawValue;
      if (filter.op === "$like") return stringValue.toLowerCase().includes(filter.rawValue.toLowerCase());
      if (filter.op === "$null") {
        const shouldBeNull = filter.rawValue === "true";
        const isNull = value === null || value === undefined;
        return shouldBeNull ? isNull : !isNull;
      }
      return false;
    });
  });
}

function applySparseFields(document: ApiDocument, fields: Set<string> | null): ApiDocument {
  if (!fields) return document;
  const next: ApiDocument = {
    id: document.id,
    collectionId: document.collectionId,
    parentId: document.parentId,
    title: document.title,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    coverImage: document.coverImage,
    fields: {},
  };

  for (const field of fields) {
    if (field === "id" || field === "collectionId" || field === "parentId" || field === "createdAt" || field === "updatedAt" || field === "title" || field === "coverImage") {
      (next as Record<string, unknown>)[field] = (document as Record<string, unknown>)[field];
      continue;
    }

    if (field.startsWith("fields.")) {
      const key = field.slice("fields.".length);
      next.fields[key] = document.fields[key];
    }
  }

  return next;
}

async function toApiDocument(
  row: RowDocument,
  values: Record<string, FieldValue>,
  includeToc: boolean,
): Promise<ApiDocument> {
  let jsonContent: ReturnType<typeof convertYjsToJson> = null;
  if (row.yjsState) {
    jsonContent = await transformDocumentLinksToInternalLinkMarks(convertYjsToJson(row.yjsState));
  }

  let toc: Array<{ id: string; level: number; text: string }> | undefined;
  if (includeToc && jsonContent) {
    toc = extractTableOfContents(jsonContent);
  }

  return {
    id: row.id,
    collectionId: row.collectionId ?? "",
    parentId: row.parentId,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    coverImage: row.coverImage,
    fields: values,
    ...(jsonContent ? { jsonContent } : {}),
    ...(toc ? { toc } : {}),
  };
}

async function getCollectionByIdentifier(organizationId: string, collectionId: string) {
  const rows = await db
    .select()
    .from(collectionsTable)
    .where(
      and(
        eq(collectionsTable.organizationId, organizationId),
        sql`${collectionsTable.deletedAt} IS NULL`,
        sql`(${collectionsTable.id} = ${collectionId} OR ${collectionsTable.handle} = ${collectionId})`,
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

async function getCollectionDocuments(organizationId: string, collectionId: string, parentId?: string | null) {
  const rows = await db
    .select({
      document: documentsTable,
      values: collectionFieldsTable.values,
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
        parentId === undefined
          ? sql`TRUE`
          : parentId === null
            ? isNull(documentsTable.parentId)
            : eq(documentsTable.parentId, parentId),
      ),
    );

  return rows.map((row) => ({
    document: row.document as RowDocument,
    values: (row.values as Record<string, FieldValue> | null) ?? {},
  }));
}

async function getCollectionDocumentById(organizationId: string, collectionId: string, documentId: string) {
  const rows = await db
    .select({
      document: documentsTable,
      values: collectionFieldsTable.values,
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
        eq(documentsTable.id, documentId),
        eq(documentsTable.organizationId, organizationId),
        eq(documentsTable.collectionId, collectionId),
        sql`${documentsTable.deletedAt} IS NULL`,
      ),
    )
    .limit(1);

  if (!rows[0]) return null;
  return {
    document: rows[0].document as RowDocument,
    values: (rows[0].values as Record<string, FieldValue> | null) ?? {},
  };
}

async function appendRelated(document: ApiDocument, organizationId: string, includeRelated: boolean) {
  if (!includeRelated) return document;
  const related = await findRelatedDocuments(document.id, organizationId, 10);
  return { ...document, related: related.map((entry) => entry.id) };
}

async function buildChildrenTree(
  organizationId: string,
  collectionId: string,
  parentId: string,
  depth: number,
): Promise<ApiDocument[]> {
  const directChildren = await getCollectionDocuments(organizationId, collectionId, parentId);
  const mapped = await Promise.all(
    directChildren.map(async (entry) => toApiDocument(entry.document, entry.values, false)),
  );

  if (depth <= 1) {
    return mapped.map((doc) => ({ ...doc, children: [] }));
  }

  return Promise.all(
    mapped.map(async (doc) => ({
      ...doc,
      children: await buildChildrenTree(organizationId, collectionId, doc.id, depth - 1),
    })),
  );
}

function documentError(code: string, message: string, hint?: string) {
  return { error: { code, message, ...(hint ? { hint } : {}) } };
}

type CollectionsApiOptions = {
  authMiddleware?: MiddlewareHandler;
  rateLimitMiddleware?: MiddlewareHandler;
};

export function createCollectionsApi(options?: CollectionsApiOptions) {
  const authMiddleware = options?.authMiddleware ?? apiKeyAuth;
  const rateLimitMiddleware = options?.rateLimitMiddleware ?? externalRateLimit;

  return new Hono()
  .use(authMiddleware)
  .use(rateLimitMiddleware)
  .get(
    "/collections/:collectionId/documents",
    describeRoute({
      summary: "List collection documents",
      description: "Returns collection documents with filtering, sorting, and cursor pagination.",
      responses: {
        200: {
          description: "Documents listed",
          content: { "application/json": { schema: resolver(defaultEnvelopeSchema) } },
        },
      },
    }),
    validator("param", collectionParamsSchema),
    async (c) => {
    const organizationId = c.get("organizationId");
    const { collectionId: collectionIdentifier } = c.req.valid("param");

    const collection = await getCollectionByIdentifier(organizationId, collectionIdentifier);
    if (!collection) {
      return c.json(documentError("COLLECTION_NOT_FOUND", "Collection does not exist or is not accessible"), 404);
    }

    const url = new URL(c.req.url);
    const filters = parseFilters(url);
    const sortRaw = c.req.query("sort") ?? "-created_at";
    const descending = sortRaw.startsWith("-");
    const sortField = descending ? sortRaw.slice(1) : sortRaw;
    const limit = parseLimit(c.req.query("limit"), 100, 100);
    const cursor = decodeCursor(c.req.query("cursor"));
    const include = parseIncludes(c.req.query("include"));
    const sparseFields = parseFields(c.req.query("fields"));
    const includeToc = c.req.query("include_toc") === "true";

    const lookup = getLookupConfig(collection.properties);
    const unindexedFilterWarnings = filters
      .filter((filter) => !lookup.indexedFields.includes(filter.field))
      .map((filter) => ({
        code: "UNINDEXED_FILTER",
        message: `Filter on '${filter.field}' is not indexed and may be slow on large collections. Declare it as an indexed field in collection settings.`,
      }));

    const rows = await getCollectionDocuments(organizationId, collection.id, undefined);
    let documents = await Promise.all(rows.map((row) => toApiDocument(row.document, row.values, includeToc)));
    documents = applyFilters(documents, filters);

    documents.sort((a, b) => {
      const aValue = getSortableValue(a, sortField);
      const bValue = getSortableValue(b, sortField);
      if (aValue === bValue) {
        return descending ? b.id.localeCompare(a.id) : a.id.localeCompare(b.id);
      }
      return descending ? bValue.localeCompare(aValue) : aValue.localeCompare(bValue);
    });

    if (cursor) {
      documents = documents.filter((doc) => {
        const value = getSortableValue(doc, sortField);
        if (descending) {
          return value < cursor.lastValue || (value === cursor.lastValue && doc.id < cursor.lastId);
        }
        return value > cursor.lastValue || (value === cursor.lastValue && doc.id > cursor.lastId);
      });
    }

    const paginated = documents.slice(0, limit + 1);
    const hasNext = paginated.length > limit;
    const result = hasNext ? paginated.slice(0, limit) : paginated;

    const withIncludes = await Promise.all(
      result.map(async (doc) => {
        let next = doc;
        if (include.has("related")) {
          next = await appendRelated(next, organizationId, true);
        }
        if (include.has("children")) {
          next = { ...next, children: await buildChildrenTree(organizationId, collection.id, doc.id, 1) };
        }
        return applySparseFields(next, sparseFields);
      }),
    );

    const last = withIncludes[withIncludes.length - 1];
    const nextCursor = hasNext && last ? encodeCursor(getSortableValue(last, sortField), last.id) : null;

    return c.json({
      data: withIncludes,
      meta: {
        total: documents.length,
        limit,
        nextCursor,
        warnings: [
          ...unindexedFilterWarnings,
          ...(!lookup.indexedFields.includes(sortField) && !["created_at", "updated_at"].includes(sortField)
            ? [
                {
                  code: "SORT_FIELD_NOT_INDEXED",
                  message: `Sort on '${sortField}' is not indexed and may be slow on large collections.`,
                },
              ]
            : []),
        ],
      },
    });
  },
  )
  .get(
    "/collections/:collectionId/documents/:value",
    describeRoute({
      summary: "Get a single collection document",
      description: "Finds a document by id or by configured lookup key via ?by=field.",
      responses: {
        200: {
          description: "Document found",
          content: { "application/json": { schema: resolver(defaultEnvelopeSchema) } },
        },
      },
    }),
    validator("param", documentLookupParamsSchema),
    async (c) => {
    const organizationId = c.get("organizationId");
    const { collectionId: collectionIdentifier, value } = c.req.valid("param");
    const by = c.req.query("by") ?? "id";

    const collection = await getCollectionByIdentifier(organizationId, collectionIdentifier);
    if (!collection) {
      return c.json(documentError("COLLECTION_NOT_FOUND", "Collection does not exist or is not accessible"), 404);
    }

    const lookup = getLookupConfig(collection.properties);
    if (by !== "id" && by !== lookup.lookupKey) {
      return c.json(
        documentError(
          "FIELD_NOT_INDEXED",
          `Field '${by}' is not declared as the lookup key for this collection. Declare it in collection settings to enable lookups.`,
          `Current lookup key: '${lookup.lookupKey ?? "none"}'`,
        ),
        400,
      );
    }

    const rows = await getCollectionDocuments(organizationId, collection.id, undefined);
    const docs = await Promise.all(rows.map((row) => toApiDocument(row.document, row.values, c.req.query("include_toc") === "true")));

    const document = docs.find((doc) => {
      if (by === "id") return doc.id === value;
      return String(doc.fields[by] ?? "") === value;
    });

    if (!document) {
      return c.json(documentError("DOCUMENT_NOT_FOUND", "No document matches the given value/field"), 404);
    }

    let next = document;
    const include = parseIncludes(c.req.query("include"));
    if (include.has("related")) next = await appendRelated(next, organizationId, true);
    if (include.has("children")) {
      next = { ...next, children: await buildChildrenTree(organizationId, collection.id, document.id, 1) };
    }

    return c.json({ data: next });
  },
  )
  .get(
    "/collections/:collectionId/documents/:docId/children",
    describeRoute({
      summary: "Get document children",
      description: "Returns child documents with optional recursive depth.",
      responses: {
        200: {
          description: "Children listed",
          content: { "application/json": { schema: resolver(defaultEnvelopeSchema) } },
        },
      },
    }),
    validator("param", documentIdParamsSchema),
    async (c) => {
    const organizationId = c.get("organizationId");
    const { collectionId: collectionIdentifier, docId } = c.req.valid("param");
    const depth = parseDepth(c.req.query("depth"));

    if (depth > 5) {
      return c.json(documentError("DEPTH_LIMIT_EXCEEDED", "depth parameter exceeds maximum of 5"), 400);
    }

    const collection = await getCollectionByIdentifier(organizationId, collectionIdentifier);
    if (!collection) {
      return c.json(documentError("COLLECTION_NOT_FOUND", "Collection does not exist or is not accessible"), 404);
    }

    const children = await buildChildrenTree(organizationId, collection.id, docId, Math.max(1, depth));
    return c.json({
      data: children,
      meta: {
        limit: children.length,
        nextCursor: null,
      },
    });
  },
  )
  .get(
    "/collections/:collectionId/documents/:docId/related",
    describeRoute({
      summary: "Get related documents",
      description: "Returns related documents for a given collection document.",
      responses: {
        200: {
          description: "Related listed",
          content: { "application/json": { schema: resolver(defaultEnvelopeSchema) } },
        },
      },
    }),
    validator("param", documentIdParamsSchema),
    async (c) => {
    const organizationId = c.get("organizationId");
    const { collectionId: collectionIdentifier, docId } = c.req.valid("param");
    const limit = parseLimit(c.req.query("limit"), 5, 20);

    const collection = await getCollectionByIdentifier(organizationId, collectionIdentifier);
    if (!collection) {
      return c.json(documentError("COLLECTION_NOT_FOUND", "Collection does not exist or is not accessible"), 404);
    }

    const related = await findRelatedDocuments(docId, organizationId, limit, { collectionId: collection.id });
    const relatedIds = related.map((entry) => entry.id).filter((id): id is string => typeof id === "string");

    if (relatedIds.length === 0) {
      return c.json({ data: [] });
    }

    const rows = await db
      .select({
        document: documentsTable,
        values: collectionFieldsTable.values,
      })
      .from(documentsTable)
      .leftJoin(
        collectionFieldsTable,
        and(
          eq(collectionFieldsTable.documentId, documentsTable.id),
          eq(collectionFieldsTable.collectionId, collection.id),
        ),
      )
      .where(
        and(
          inArray(documentsTable.id, relatedIds),
          eq(documentsTable.organizationId, organizationId),
          eq(documentsTable.collectionId, collection.id),
          sql`${documentsTable.deletedAt} IS NULL`,
          eq(documentsTable.published, true),
        ),
      );

    const mapped = await Promise.all(
      rows.map((row) =>
        toApiDocument(
          row.document as RowDocument,
          (row.values as Record<string, FieldValue> | null) ?? {},
          false,
        ),
      ),
    );

    return c.json({ data: mapped });
  },
  )
  .post(
    "/collections/:collectionId/documents",
    describeRoute({
      summary: "Create collection document",
      description: "Creates a new collection document.",
      responses: {
        201: {
          description: "Document created",
          content: { "application/json": { schema: resolver(defaultEnvelopeSchema) } },
        },
      },
    }),
    validator("param", collectionParamsSchema),
    validator("json", documentBodySchema),
    async (c) => {
    const organizationId = c.get("organizationId");
    const { collectionId: collectionIdentifier } = c.req.valid("param");
    const collection = await getCollectionByIdentifier(organizationId, collectionIdentifier);
    if (!collection) {
      return c.json(documentError("COLLECTION_NOT_FOUND", "Collection does not exist or is not accessible"), 404);
    }

    const body = c.req.valid("json");

    const now = new Date();
    const id = createId();
    const title = body.title?.trim() || "Untitled";
    const parentId = body.parentId ?? null;
    const fields = body.fields ?? {};
    const published = body.published ?? true;

    await db.insert(documentsTable).values({
      id,
      title,
      parentId,
      collectionId: collection.id,
      organizationId,
      published,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(collectionFieldsTable).values({
      id: createId(),
      documentId: id,
      collectionId: collection.id,
      values: fields,
      orphanedValues: {},
      createdAt: now,
      updatedAt: now,
    });

    const created = await getCollectionDocumentById(organizationId, collection.id, id);
    if (!created) {
      return c.json(documentError("DOCUMENT_NOT_FOUND", "No document matches the given value/field"), 404);
    }

    return c.json({ data: await toApiDocument(created.document, created.values, false) }, 201);
  },
  )
  .patch(
    "/collections/:collectionId/documents/:docId",
    describeRoute({
      summary: "Update collection document",
      description: "Updates an existing collection document and field values.",
      responses: {
        200: {
          description: "Document updated",
          content: { "application/json": { schema: resolver(defaultEnvelopeSchema) } },
        },
      },
    }),
    validator("param", documentIdParamsSchema),
    validator("json", documentBodySchema),
    async (c) => {
    const organizationId = c.get("organizationId");
    const { collectionId: collectionIdentifier, docId } = c.req.valid("param");
    const collection = await getCollectionByIdentifier(organizationId, collectionIdentifier);
    if (!collection) {
      return c.json(documentError("COLLECTION_NOT_FOUND", "Collection does not exist or is not accessible"), 404);
    }

    const existing = await getCollectionDocumentById(organizationId, collection.id, docId);
    if (!existing) {
      return c.json(documentError("DOCUMENT_NOT_FOUND", "No document matches the given value/field"), 404);
    }

    const body = c.req.valid("json");

    const now = new Date();
    await db
      .update(documentsTable)
      .set({
        ...(body.title !== undefined ? { title: body.title.trim() || "Untitled" } : {}),
        ...(body.parentId !== undefined ? { parentId: body.parentId } : {}),
        ...(body.published !== undefined ? { published: body.published } : {}),
        updatedAt: now,
      })
      .where(
        and(
          eq(documentsTable.id, docId),
          eq(documentsTable.organizationId, organizationId),
          eq(documentsTable.collectionId, collection.id),
        ),
      );

    if (body.fields) {
      await db
        .update(collectionFieldsTable)
        .set({
          values: {
            ...existing.values,
            ...body.fields,
          },
          updatedAt: now,
        })
        .where(
          and(
            eq(collectionFieldsTable.documentId, docId),
            eq(collectionFieldsTable.collectionId, collection.id),
          ),
        );
    }

    const updated = await getCollectionDocumentById(organizationId, collection.id, docId);
    if (!updated) {
      return c.json(documentError("DOCUMENT_NOT_FOUND", "No document matches the given value/field"), 404);
    }

    return c.json({ data: await toApiDocument(updated.document, updated.values, false) });
  },
  )
  .delete(
    "/collections/:collectionId/documents/:docId",
    describeRoute({
      summary: "Delete collection document",
      description: "Soft-deletes a collection document.",
      responses: {
        200: {
          description: "Document deleted",
          content: { "application/json": { schema: resolver(defaultEnvelopeSchema) } },
        },
      },
    }),
    validator("param", documentIdParamsSchema),
    async (c) => {
    const organizationId = c.get("organizationId");
    const { collectionId: collectionIdentifier, docId } = c.req.valid("param");
    const collection = await getCollectionByIdentifier(organizationId, collectionIdentifier);
    if (!collection) {
      return c.json(documentError("COLLECTION_NOT_FOUND", "Collection does not exist or is not accessible"), 404);
    }

    const existing = await getCollectionDocumentById(organizationId, collection.id, docId);
    if (!existing) {
      return c.json(documentError("DOCUMENT_NOT_FOUND", "No document matches the given value/field"), 404);
    }

    await db
      .update(documentsTable)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(documentsTable.id, docId),
          eq(documentsTable.organizationId, organizationId),
          eq(documentsTable.collectionId, collection.id),
        ),
      );

    return c.json({ data: { id: docId, deleted: true } });
  },
  )
  .patch(
    "/collections/:collectionId",
    describeRoute({
      summary: "Update collection API settings",
      description: "Updates lookup key and indexed fields for collection external API behavior.",
      responses: {
        200: {
          description: "Collection settings updated",
          content: { "application/json": { schema: resolver(defaultEnvelopeSchema) } },
        },
      },
    }),
    validator("param", collectionParamsSchema),
    validator("json", collectionSettingsBodySchema),
    async (c) => {
    const organizationId = c.get("organizationId");
    const { collectionId: collectionIdentifier } = c.req.valid("param");

    const collection = await getCollectionByIdentifier(organizationId, collectionIdentifier);
    if (!collection) {
      return c.json(documentError("COLLECTION_NOT_FOUND", "Collection does not exist or is not accessible"), 404);
    }

    const body = c.req.valid("json");

    const lookupKey = body.lookupKey ?? null;
    const indexedFields = body.indexedFields ?? [];

    if (lookupKey !== null && (!SAFE_FIELD_RE.test(lookupKey) || lookupKey.length > 64)) {
      return c.json(documentError("FIELD_NOT_INDEXED", "lookupKey is invalid"), 400);
    }

    if (indexedFields.length > 3) {
      return c.json(documentError("FIELD_NOT_INDEXED", "indexedFields supports up to 3 values"), 400);
    }

    for (const field of indexedFields) {
      if (!SAFE_FIELD_RE.test(field) || field.length > 64) {
        return c.json(documentError("FIELD_NOT_INDEXED", `Indexed field '${field}' is invalid`), 400);
      }
    }

    const existingProperties = Array.isArray(collection.properties)
      ? (collection.properties as Array<Record<string, unknown>>)
      : [];
    const previousLookupConfig = getLookupConfig(collection.properties);
    const existingPropertyNames = new Set(
      existingProperties
        .map((property) => (typeof property.name === "string" ? property.name : null))
        .filter((name): name is string => name !== null),
    );

    if (lookupKey !== null && !existingPropertyNames.has(lookupKey)) {
      return c.json(documentError("FIELD_NOT_INDEXED", `Lookup field '${lookupKey}' does not exist`), 400);
    }

    for (const field of indexedFields) {
      if (!existingPropertyNames.has(field)) {
        return c.json(documentError("FIELD_NOT_INDEXED", `Indexed field '${field}' does not exist`), 400);
      }
    }

    const nextProperties = existingProperties.map((property) => {
      if (typeof property.name !== "string") return property;
      return {
        ...property,
        unique: lookupKey !== null ? property.name === lookupKey : false,
        indexed: indexedFields.includes(property.name),
      };
    });

    await syncCollectionFieldIndexes({
      collectionId: collection.id,
      previousLookupKey: previousLookupConfig.lookupKey,
      previousIndexedFields: previousLookupConfig.indexedFields,
      lookupKey,
      indexedFields,
    });

    await db
      .update(collectionsTable)
      .set({
        properties: nextProperties,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(collectionsTable.id, collection.id),
          eq(collectionsTable.organizationId, organizationId),
        ),
      );

    return c.json({
      data: {
        id: collection.id,
        name: collection.name,
        lookupKey,
        indexedFields,
        updatedAt: new Date().toISOString(),
      },
    });
  },
  );
}

export const CollectionsApi = createCollectionsApi();
