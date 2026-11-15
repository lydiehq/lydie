import { afterEach, describe, expect, test } from "bun:test";

import { createFakeCore } from "../test/fake-core.ts";
import { closeTestStores, createDoc, crudCount, openTestStore, renameDoc } from "../test/store.ts";
import { createConnector } from "./connector.ts";
import { createApiClient } from "./http.ts";
import { createUploader } from "./upload.ts";
import type { OplogPort } from "./upload.ts";

afterEach(() => closeTestStores());

function connectorFor(
  store: Awaited<ReturnType<typeof openTestStore>>["store"],
  oplog?: OplogPort,
) {
  const core = createFakeCore();
  const api = createApiClient({
    baseUrl: "http://core.test",
    token: () => "token-1",
    fetch: core.fetch,
  });
  const log = oplog ?? store.oplog;
  const uploader = createUploader({ api, oplog: log, backoff: { baseMs: 1, jitter: false } });
  const connector = createConnector({ api, uploader, oplog: log });
  return { core, connector };
}

describe("PowerSync connector", () => {
  test("fetchCredentials returns the sync token, fresh each time", async () => {
    const { store } = await openTestStore();
    const { core, connector } = connectorFor(store);
    const first = await connector.fetchCredentials();
    const second = await connector.fetchCredentials();
    expect(first).toMatchObject({ endpoint: "http://127.0.0.1:9", token: "ps-1" });
    expect(first!.expiresAt).toBeInstanceOf(Date);
    expect(second!.token).toBe("ps-2");
    expect(core.tokenCount.sync).toBe(2);
  });

  test("uploadData sends the operation log, not row diffs, then completes PowerSync's queue", async () => {
    const { store } = await openTestStore();
    const a = await createDoc(store, { workspaceId: "ws-1", title: "A" });
    await renameDoc(store, a.id, "A2");
    expect(await crudCount(store)).toBeGreaterThan(0);
    const { core, connector } = connectorFor(store);
    await connector.uploadData(store.db);
    expect(core.applied.map((e) => e.operation)).toEqual(["doc.create", "doc.rename"]);
    expect(await store.oplog.list()).toEqual([]);
    expect(await crudCount(store)).toBe(0);
  });

  test("crash after the upload but before queue completion: the next run only completes", async () => {
    const { store } = await openTestStore();
    await createDoc(store, { workspaceId: "ws-1", title: "A" });
    const { core, connector } = connectorFor(store);
    // The log drains (ops reach the server), then the process dies before uploadData finishes.
    await connector.drain();
    expect(await store.oplog.list()).toEqual([]);
    expect(await crudCount(store)).toBeGreaterThan(0);
    await connector.uploadData(store.db);
    expect(core.uploads).toHaveLength(1);
    expect(await crudCount(store)).toBe(0);
  });

  test("never completes CRUD entries whose operation is still queued", async () => {
    const { store } = await openTestStore();
    await createDoc(store, { workspaceId: "ws-1", title: "A" });
    // Every time the connector checks the log is empty, record whether the queue still holds
    // entries of operations that have not been uploaded. A user edit lands mid-upload.
    let injected = false;
    const checks: boolean[] = [];
    const oplog: OplogPort = {
      list: async (options) => {
        const entries = await store.oplog.list(options);
        if (options?.limit === 1) checks.push(entries.length === 0);
        return entries;
      },
      remove: (ids) => store.oplog.remove(ids),
    };
    const { core, connector } = connectorFor(store, oplog);
    core.hook = async ({ path }) => {
      if (path === "/v1/sync/upload" && !injected) {
        injected = true;
        await createDoc(store, { workspaceId: "ws-1", title: "Typed during upload" });
      }
      return undefined;
    };
    await connector.uploadData(store.db);
    expect(core.applied.map((e) => (e.input as { title: string }).title)).toEqual([
      "A",
      "Typed during upload",
    ]);
    expect(await crudCount(store)).toBe(0);
    expect(await store.oplog.list()).toEqual([]);
    // The connector only completed after an empty check.
    expect(checks.at(-1)).toBe(true);
  });

  test("uploadData rethrows server errors so PowerSync retries, and keeps everything queued", async () => {
    const { store } = await openTestStore();
    await createDoc(store, { workspaceId: "ws-1", title: "A" });
    const { core, connector } = connectorFor(store);
    core.hook = ({ path }) => (path === "/v1/sync/upload" ? "network" : undefined);
    const error = await connector.uploadData(store.db).then(
      () => null,
      (e: Error) => e,
    );
    expect(error?.message).toContain("connection refused");
    expect(await store.oplog.list()).toHaveLength(1);
    expect(await crudCount(store)).toBeGreaterThan(0);
    core.hook = null;
    await connector.uploadData(store.db);
    expect(await crudCount(store)).toBe(0);
  });
});
