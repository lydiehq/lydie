import { afterEach, describe, expect, test } from "bun:test";

import { createFakeCore, testUuid } from "../test/fake-core.ts";
import { closeTestStores, createDoc, openTestStore } from "../test/store.ts";
import { createAttachmentSync, sha256Hex } from "./attachments.ts";
import { createApiClient } from "./http.ts";
import type { BlobPort } from "./types.ts";

afterEach(() => closeTestStores());

function memoryBlob(): BlobPort & { data: Map<string, Uint8Array> } {
  const data = new Map<string, Uint8Array>();
  return {
    data,
    put: async (key, value) => void data.set(key, value),
    get: async (key) => data.get(key) ?? null,
    delete: async (key) => void data.delete(key),
    has: async (key) => data.has(key),
  };
}

async function addAttachment(
  store: Awaited<ReturnType<typeof openTestStore>>["store"],
  blob: BlobPort,
  documentId: string,
  bytes: string,
  contentType = "text/plain",
) {
  const data = new TextEncoder().encode(bytes);
  const sha256 = await sha256Hex(data);
  await blob.put(sha256, data);
  const id = testUuid();
  const now = new Date().toISOString();
  await store.ports.db.write(async (tx) => {
    await tx.attachments!.insert({
      id,
      workspaceId: "ws-1",
      documentId,
      filename: "a.txt",
      contentType,
      size: data.byteLength,
      sha256,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      createdBy: "user-1",
      updatedBy: "user-1",
    });
  });
  return { id, sha256, data };
}

async function setup() {
  const { store } = await openTestStore();
  const core = createFakeCore();
  const blob = memoryBlob();
  const api = createApiClient({
    baseUrl: "http://core.test",
    token: () => "token-1",
    fetch: core.fetch,
  });
  const sync = createAttachmentSync({ api, store, blob, fetch: core.fetch });
  const doc = await createDoc(store, { workspaceId: "ws-1", title: "Doc" });
  return { store, core, blob, sync, doc };
}

describe("attachment uploads", () => {
  test("prepareUpload → PUT → uploaded, with progress; identical bytes are sent once", async () => {
    const { store, core, blob, sync, doc } = await setup();
    const first = await addAttachment(store, blob, doc.id, "hello");
    const second = await addAttachment(store, blob, doc.id, "hello");
    const seen: number[] = [];
    sync.progress.subscribe((p) => seen.push(Object.keys(p).length));
    expect(await sync.run()).toEqual({ uploaded: 2, waiting: 0, failed: 0 });
    expect(core.blobs.get(first.sha256)).toEqual(first.data);
    expect(core.requests.filter((r) => r.method === "PUT")).toHaveLength(1);
    expect((await store.uploads.get(second.id))?.state).toBe("uploaded");
    expect(seen).toContain(1);
    expect(sync.progress.get()).toEqual({});
  });

  test("waits while the document is not on the server yet", async () => {
    const { store, core, blob, sync, doc } = await setup();
    const a = await addAttachment(store, blob, doc.id, "x");
    core.knownDocuments = new Set();
    expect(await sync.run()).toEqual({ uploaded: 0, waiting: 1, failed: 0 });
    expect((await store.uploads.get(a.id))?.state).toBe("local");
    core.knownDocuments = null;
    expect((await sync.run()).uploaded).toBe(1);
  });

  test("resumes after a crash mid-upload (state left at 'uploading')", async () => {
    const { store, core, blob, sync, doc } = await setup();
    const a = await addAttachment(store, blob, doc.id, "resume me");
    let drop = true;
    core.hook = ({ method }) => (method === "PUT" && drop ? "network" : undefined);
    const error = await sync.run().catch((e: Error) => e);
    expect((error as Error).message).toContain("connection refused");
    expect((await store.uploads.get(a.id))?.state).toBe("failed");
    drop = false;
    // A new instance (after a restart) picks it up from the table.
    const api = createApiClient({
      baseUrl: "http://core.test",
      token: () => "token-1",
      fetch: core.fetch,
    });
    const restarted = createAttachmentSync({ api, store, blob, fetch: core.fetch });
    expect((await restarted.run()).uploaded).toBe(1);
    expect((await store.uploads.get(a.id))?.attempts).toBe(2);
  });

  test("a refused file is failed for good and skipped afterwards", async () => {
    const { store, core, blob, sync, doc } = await setup();
    const a = await addAttachment(store, blob, doc.id, "MZ", "application/x-msdownload");
    expect(await sync.run()).toEqual({ uploaded: 0, waiting: 1, failed: 1 });
    expect((await store.uploads.get(a.id))?.error).toStartWith("rejected: ");
    const before = core.requests.length;
    await sync.run();
    expect(core.requests.length).toBe(before);
  });

  test("download URLs are cached until shortly before they expire", async () => {
    const { sync, core } = await setup();
    const one = await sync.downloadUrl("att-1");
    expect(await sync.downloadUrl("att-1")).toBe(one);
    expect(core.requests.filter((r) => r.path.endsWith("/download-url"))).toHaveLength(1);
  });
});
