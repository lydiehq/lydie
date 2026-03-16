import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const selectQueue: Array<unknown[]> = [];

  const selectMock = vi.fn(() => {
    const where = vi.fn(() => {
      const rows = selectQueue.shift() ?? [];
      const promise = Promise.resolve(rows);
      return {
        limit: async () => rows,
        then: promise.then.bind(promise),
        catch: promise.catch.bind(promise),
        finally: promise.finally.bind(promise),
      };
    });

    return {
      from: () => ({
        where,
        leftJoin: () => ({ where }),
      }),
    };
  });

  const insertValues = vi.fn(async () => []);
  const insertMock = vi.fn(() => ({ values: insertValues }));

  const updateWhere = vi.fn(async () => []);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const updateMock = vi.fn(() => ({ set: updateSet }));

  const executeMock = vi.fn(async () => []);

  return {
    selectQueue,
    selectMock,
    insertMock,
    insertValues,
    updateMock,
    updateSet,
    updateWhere,
    executeMock,
  };
});

vi.mock("@lydie/database", () => ({
  db: {
    select: mocks.selectMock,
    insert: mocks.insertMock,
    update: mocks.updateMock,
    execute: mocks.executeMock,
  },
  apiKeysTable: { id: "id" },
  collectionsTable: {
    id: "id",
    handle: "handle",
    organizationId: "organization_id",
    deletedAt: "deleted_at",
  },
  documentsTable: {
    id: "id",
    organizationId: "organization_id",
    collectionId: "collection_id",
    parentId: "parent_id",
    deletedAt: "deleted_at",
    published: "published",
  },
  collectionFieldsTable: {
    documentId: "document_id",
    collectionId: "collection_id",
    values: "values",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ type: "and", args }),
  eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
  inArray: (left: unknown, right: unknown) => ({ type: "in", left, right }),
  isNull: (value: unknown) => ({ type: "isNull", value }),
  sql: Object.assign(
    (parts: unknown, ...args: unknown[]) => ({ type: "sql", parts, args }),
    { raw: (value: string) => ({ type: "raw", value }) },
  ),
}));

vi.mock("@lydie/core/embedding/search", () => ({
  findRelatedDocuments: vi.fn(async () => []),
}));

vi.mock("@lydie/core/utils", () => ({
  slugify: (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, ""),
}));

vi.mock("@lydie/core/yjs-to-json", () => ({
  convertYjsToJson: vi.fn(() => ({ type: "doc", content: [] })),
  convertJsonToYjs: vi.fn((value: unknown) => (value === "INVALID" ? null : "yjs-state")),
}));

vi.mock("../../utils/toc", () => ({
  extractTableOfContents: vi.fn(() => []),
}));

vi.mock("../utils/link-transformer", () => ({
  transformDocumentLinksToInternalLinkMarks: vi.fn(async (value: unknown) => value),
}));

import type { MiddlewareHandler } from "hono";

import { createCollectionsApi } from "./collections";

const testMiddleware: MiddlewareHandler = async (c, next) => {
  c.set("organizationId", "org_1");
  c.set("apiKeyId", "key_1");
  await next();
};

function queueSelectRows(rows: unknown[]) {
  mocks.selectQueue.push(rows);
}

function makeDocRow(params: { id: string; title: string; parentId?: string | null; slug?: string }) {
  return {
    document: {
      id: params.id,
      title: params.title,
      collectionId: "blog",
      parentId: params.parentId ?? null,
      createdAt: new Date("2025-01-01T00:00:00Z"),
      updatedAt: new Date("2025-01-02T00:00:00Z"),
      coverImage: null,
      yjsState: null,
      organizationId: "org_1",
    },
    values: {
      slug: params.slug ?? params.id,
    },
  };
}

describe("CollectionsApi", () => {
  const app = createCollectionsApi({
    authMiddleware: testMiddleware,
    rateLimitMiddleware: testMiddleware,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectQueue.length = 0;
  });

  it("returns 404 when collection does not exist", async () => {
    queueSelectRows([]);

    const res = await app.request("/collections/blog/documents");
    expect(res.status).toBe(404);
    const payload = (await res.json()) as { error?: { code?: string } };
    expect(payload.error?.code).toBe("COLLECTION_NOT_FOUND");
  });

  it("lists collection documents with envelope metadata", async () => {
    queueSelectRows([{ id: "blog", name: "Blog", properties: [] }]);
    queueSelectRows([makeDocRow({ id: "doc_1", title: "Doc One" })]);

    const res = await app.request("/collections/blog/documents?limit=1");
    expect(res.status).toBe(200);

    const payload = (await res.json()) as {
      data: Array<{ id: string; title: string }>;
      meta: { limit: number; total: number };
    };

    expect(payload.data).toHaveLength(1);
    expect(payload.data[0]?.id).toBe("doc_1");
    expect(payload.meta.limit).toBe(1);
    expect(payload.meta.total).toBe(1);
  });

  it("creates a collection document", async () => {
    queueSelectRows([{ id: "blog", name: "Blog", properties: [] }]);
    queueSelectRows([makeDocRow({ id: "doc_new", title: "New Entry" })]);

    const res = await app.request("/collections/blog/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Entry", fields: { slug: "new-entry" } }),
    });

    expect(res.status).toBe(201);
    expect(mocks.insertMock).toHaveBeenCalledTimes(2);
    const payload = (await res.json()) as { data: { title: string } };
    expect(payload.data.title).toBe("New Entry");
  });

  it("creates a collection", async () => {
    queueSelectRows([]);

    const res = await app.request("/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Blog",
        properties: [{ name: "slug", type: "text", required: false, unique: true }],
      }),
    });

    expect(res.status).toBe(201);
    expect(mocks.insertMock).toHaveBeenCalledTimes(1);
    expect(mocks.executeMock).toHaveBeenCalled();
    const payload = (await res.json()) as {
      data: { name: string; handle: string; properties: Array<{ name: string }> };
    };
    expect(payload.data.name).toBe("Blog");
    expect(payload.data.handle).toBe("blog");
    expect(payload.data.properties[0]?.name).toBe("slug");
  });

  it("adds collection properties", async () => {
    queueSelectRows([{ id: "blog", name: "Blog", handle: "blog", properties: [] }]);

    const res = await app.request("/collections/blog/properties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        properties: [
          { name: "slug", type: "text", required: false, unique: true },
          { name: "draft", type: "boolean", required: false, unique: false },
        ],
      }),
    });

    expect(res.status).toBe(201);
    expect(mocks.updateMock).toHaveBeenCalledTimes(1);
    const payload = (await res.json()) as { data: { totalProperties: number } };
    expect(payload.data.totalProperties).toBe(2);
  });

  it("returns 409 when adding an existing property", async () => {
    queueSelectRows([
      {
        id: "blog",
        name: "Blog",
        handle: "blog",
        properties: [{ name: "slug", type: "text", required: false, unique: true }],
      },
    ]);

    const res = await app.request("/collections/blog/properties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        properties: [{ name: "slug", type: "text", required: false, unique: true }],
      }),
    });

    expect(res.status).toBe(409);
    const payload = (await res.json()) as { error?: { code?: string } };
    expect(payload.error?.code).toBe("PROPERTY_ALREADY_EXISTS");
  });

  it("returns 400 when creating document with invalid jsonContent", async () => {
    queueSelectRows([{ id: "blog", name: "Blog", properties: [] }]);

    const res = await app.request("/collections/blog/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Bad Content", jsonContent: "INVALID" }),
    });

    expect(res.status).toBe(400);
    const payload = (await res.json()) as { error?: { code?: string } };
    expect(payload.error?.code).toBe("INVALID_CONTENT");
  });

  it("updates an existing document", async () => {
    queueSelectRows([{ id: "blog", name: "Blog", properties: [] }]);
    queueSelectRows([makeDocRow({ id: "doc_1", title: "Before" })]);
    queueSelectRows([makeDocRow({ id: "doc_1", title: "After" })]);

    const res = await app.request("/collections/blog/documents/doc_1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "After", fields: { slug: "after" } }),
    });

    expect(res.status).toBe(200);
    expect(mocks.updateMock).toHaveBeenCalledTimes(2);
    const payload = (await res.json()) as { data: { title: string } };
    expect(payload.data.title).toBe("After");
  });

  it("deletes an existing document", async () => {
    queueSelectRows([{ id: "blog", name: "Blog", properties: [] }]);
    queueSelectRows([makeDocRow({ id: "doc_1", title: "Entry" })]);

    const res = await app.request("/collections/blog/documents/doc_1", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    const payload = (await res.json()) as { data: { id: string; deleted: boolean } };
    expect(payload.data.id).toBe("doc_1");
    expect(payload.data.deleted).toBe(true);
  });

  it("returns 400 when children depth exceeds max", async () => {
    const res = await app.request("/collections/blog/documents/doc_1/children?depth=6");

    expect(res.status).toBe(400);
    const payload = (await res.json()) as { error?: { code?: string } };
    expect(payload.error?.code).toBe("DEPTH_LIMIT_EXCEEDED");
  });

  it("returns 400 when lookup key is not an existing property", async () => {
    queueSelectRows([
      {
        id: "blog",
        name: "Blog",
        properties: [{ name: "slug", type: "text", unique: true }],
      },
    ]);

    const res = await app.request("/collections/blog", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lookupKey: "missing_field", indexedFields: ["slug"] }),
    });

    expect(res.status).toBe(400);
    const payload = (await res.json()) as { error?: { code?: string } };
    expect(payload.error?.code).toBe("FIELD_NOT_INDEXED");
  });

  it("rejects single-document lookup with non-configured by field", async () => {
    queueSelectRows([
      {
        id: "blog",
        name: "Blog",
        properties: [{ name: "slug", type: "text", unique: true }],
      },
    ]);

    const res = await app.request("/collections/blog/documents/hello-world?by=sku");
    expect(res.status).toBe(400);
    const payload = (await res.json()) as { error?: { code?: string } };
    expect(payload.error?.code).toBe("FIELD_NOT_INDEXED");
  });

  it("returns 404 when updating a missing document", async () => {
    queueSelectRows([{ id: "blog", name: "Blog", properties: [] }]);
    queueSelectRows([]);

    const res = await app.request("/collections/blog/documents/missing-doc", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Nope" }),
    });

    expect(res.status).toBe(404);
    const payload = (await res.json()) as { error?: { code?: string } };
    expect(payload.error?.code).toBe("DOCUMENT_NOT_FOUND");
  });

  it("returns 404 when deleting a missing document", async () => {
    queueSelectRows([{ id: "blog", name: "Blog", properties: [] }]);
    queueSelectRows([]);

    const res = await app.request("/collections/blog/documents/missing-doc", {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
    const payload = (await res.json()) as { error?: { code?: string } };
    expect(payload.error?.code).toBe("DOCUMENT_NOT_FOUND");
  });

  it("updates collection lookup settings and executes index sync", async () => {
    queueSelectRows([
      {
        id: "blog",
        name: "Blog",
        properties: [
          { name: "slug", type: "text", unique: true },
          { name: "status", type: "text", unique: false },
        ],
      },
    ]);

    const res = await app.request("/collections/blog", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lookupKey: "slug", indexedFields: ["status"] }),
    });

    expect(res.status).toBe(200);
    expect(mocks.executeMock).toHaveBeenCalled();
    const payload = (await res.json()) as { data: { lookupKey: string; indexedFields: string[] } };
    expect(payload.data.lookupKey).toBe("slug");
    expect(payload.data.indexedFields).toEqual(["status"]);
  });
});
