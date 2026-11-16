import { describe, expect, test } from "bun:test";

import { createFakeCore, makeOp, memoryOplog } from "../test/fake-core.ts";
import { createApiClient, isApiError } from "./http.ts";
import type { ApiError } from "./http.ts";
import { createUploader } from "./upload.ts";
import type { RejectedChange, UploadWarning } from "./upload.ts";

const fast = { baseMs: 1, maxMs: 2, jitter: false };

function setup(count: number, token: { value: string | null } = { value: "token-1" }) {
  const core = createFakeCore();
  let unauthorized = 0;
  const api = createApiClient({
    baseUrl: "http://core.test",
    token: () => token.value,
    fetch: core.fetch,
    onUnauthorized: () => unauthorized++,
  });
  const oplog = memoryOplog(
    Array.from({ length: count }, (_, i) => makeOp("doc.rename", { id: `d${i}`, title: `T${i}` })),
  );
  const rejected: RejectedChange[] = [];
  const warnings: UploadWarning[] = [];
  const uploader = createUploader({
    api,
    oplog,
    backoff: fast,
    onRejected: (r) => rejected.push(...r),
    onWarnings: (w) => warnings.push(...w),
  });
  return { core, api, oplog, uploader, rejected, warnings, unauthorized: () => unauthorized };
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (isApiError(error)) return error;
    throw error;
  }
  throw new Error("expected a failure");
}

describe("uploader", () => {
  test("drains the log oldest first in batches of at most 500", async () => {
    const { core, oplog, uploader } = setup(1203);
    const ids = (await oplog.list()).map((e) => e.id);
    const result = await uploader.drain();
    expect(result).toEqual({ uploaded: 1203, rejected: 0, batches: 3 });
    expect(core.uploads.map((batch) => batch.length)).toEqual([500, 500, 203]);
    expect(core.applied.map((e) => e.id)).toEqual(ids);
    expect(oplog.entries).toHaveLength(0);
  });

  test("keeps each request under the size cap, a larger entry going alone", async () => {
    const core = createFakeCore();
    const api = createApiClient({
      baseUrl: "http://core.test",
      token: () => "token-1",
      fetch: core.fetch,
    });
    const body = (n: number) => "x".repeat(n);
    const oplog = memoryOplog([
      makeOp("doc.updateBody", { id: "a", markdown: body(400) }),
      makeOp("doc.updateBody", { id: "b", markdown: body(400) }),
      makeOp("doc.updateBody", { id: "c", markdown: body(3000) }),
      makeOp("doc.rename", { id: "d", title: "D" }),
      makeOp("doc.rename", { id: "e", title: "E" }),
    ]);
    const ids = (await oplog.list()).map((e) => e.id);
    const uploader = createUploader({ api, oplog, backoff: fast, batchBytes: 1500 });
    expect(await uploader.drain()).toEqual({ uploaded: 5, rejected: 0, batches: 3 });
    expect(core.uploads).toEqual([ids.slice(0, 2), ids.slice(2, 3), ids.slice(3)]);
    expect(core.applied.map((e) => e.id)).toEqual(ids);
    expect(oplog.entries).toHaveLength(0);
  });

  test("drops rejected entries, surfaces them with the reason, and keeps going", async () => {
    const { core, oplog, uploader, rejected, warnings } = setup(5);
    const entries = await oplog.list();
    core.decide = (entry) =>
      entry.id === entries[1]!.id || entry.id === entries[3]!.id
        ? { status: "rejected", error: { code: "forbidden", message: "No edit access" } }
        : entry.id === entries[4]!.id
          ? { status: "applied", warnings: ["body not stored: edit through collab"] }
          : { status: "applied" };
    expect(await uploader.drain()).toEqual({ uploaded: 3, rejected: 2, batches: 1 });
    expect(oplog.entries).toHaveLength(0);
    expect(rejected.map((r) => [r.operationId, r.reason.code])).toEqual([
      [entries[1]!.id, "forbidden"],
      [entries[3]!.id, "forbidden"],
    ]);
    expect(rejected[0]).toMatchObject({
      operation: "doc.rename",
      input: { id: "d1", title: "T1" },
    });
    expect(warnings).toEqual([
      expect.objectContaining({ operationId: entries[4]!.id, warnings: [expect.any(String)] }),
    ]);
  });

  test("treats duplicate replies as done (a retry after the server already applied them)", async () => {
    const { core, oplog, uploader } = setup(3);
    const entries = await oplog.list();
    core.ledger.set(entries[0]!.id, { status: "applied", entry: entries[0]! });
    core.ledger.set(entries[1]!.id, {
      status: "rejected",
      error: { code: "conflict", message: "x" },
      entry: entries[1]!,
    });
    const result = await uploader.drain();
    expect(result).toEqual({ uploaded: 2, rejected: 1, batches: 1 });
    expect(core.applied.map((e) => e.id)).toEqual([entries[2]!.id]);
  });

  test("survives a crash between the server applying a batch and the log removal", async () => {
    const { core, oplog, uploader } = setup(4);
    let drops = 1;
    core.hook = ({ path }) =>
      path === "/v1/sync/upload" && drops-- > 0 ? "drop-response" : undefined;
    // The response is lost after the server committed; the retry gets `duplicate` answers.
    const result = await uploader.drain();
    expect(result.uploaded).toBe(4);
    expect(core.uploads).toHaveLength(2);
    expect(core.applied).toHaveLength(4);
    expect(oplog.entries).toHaveLength(0);
  });

  test("simulated process crash: entries stay queued and are applied exactly once", async () => {
    const { core, oplog, api } = setup(3);
    // First process: the server applies the batch, then the process dies before `remove`.
    const crashing = createUploader({
      api,
      backoff: fast,
      oplog: {
        list: (options) => oplog.list(options),
        remove: () => Promise.reject(new Error("killed")),
      },
    });
    expect((await crashing.drain().catch((e: Error) => e)) as Error).toBeInstanceOf(Error);
    expect(oplog.entries).toHaveLength(3);
    // Second process: same log, same ids.
    const restarted = createUploader({ api, oplog, backoff: fast });
    expect(await restarted.drain()).toEqual({ uploaded: 3, rejected: 0, batches: 1 });
    expect(core.applied).toHaveLength(3);
  });

  test("retries 5xx storms and network errors with backoff, then gives up keeping the log", async () => {
    const { core, oplog, uploader } = setup(2);
    let failures = 3;
    core.hook = ({ path }) => {
      if (path !== "/v1/sync/upload" || failures-- <= 0) return undefined;
      return failures % 2 === 0
        ? "network"
        : new Response(JSON.stringify({ error: { code: "internal", message: "db down" } }), {
            status: 503,
          });
    };
    expect((await uploader.drain()).uploaded).toBe(2);
    expect(core.uploads).toHaveLength(1);

    // A storm longer than the retry budget: the drain fails, nothing is lost.
    oplog.entries.push(makeOp("doc.rename", { id: "x", title: "y" }));
    core.hook = ({ path }) =>
      path === "/v1/sync/upload" ? new Response("{}", { status: 502 }) : undefined;
    const error = await failure(uploader.drain());
    expect([error.kind, error.status, error.retryable]).toEqual(["server", 502, true]);
    expect(oplog.entries).toHaveLength(1);
  });

  test("stops at a 401 mid-upload and continues after signing in again", async () => {
    const token = { value: "token-1" as string | null };
    const { core, oplog, uploader, unauthorized } = setup(700, token);
    let calls = 0;
    core.hook = ({ path }) => {
      if (path !== "/v1/sync/upload") return undefined;
      // The session expires after the first batch.
      if (++calls === 2) core.sessions.delete("token-1");
      return undefined;
    };
    const error = await failure(uploader.drain());
    expect([error.kind, error.retryable]).toEqual(["auth", false]);
    expect(unauthorized()).toBe(1);
    expect(oplog.entries).toHaveLength(200);
    // New sign-in, new token.
    core.sessions.set("token-2", "user-1");
    token.value = "token-2";
    expect((await uploader.drain()).uploaded).toBe(200);
    expect(core.applied).toHaveLength(700);
    expect(new Set(core.applied.map((e) => e.id)).size).toBe(700);
  });

  test("never spins when the server answers fewer entries than sent", async () => {
    const { core, oplog, uploader } = setup(3);
    core.hook = ({ path, body }) => {
      if (path !== "/v1/sync/upload") return undefined;
      const [first] = (body as { operations: Array<{ id: string; operation: string }> }).operations;
      return new Response(
        JSON.stringify({
          results: [{ id: first!.id, operation: first!.operation, status: "applied" }],
        }),
      );
    };
    const error = await failure(uploader.drain());
    expect(error.message).toContain("1 of 3");
    expect(oplog.entries).toHaveLength(2);
  });

  test("sends doc.create's teamspaceId as the runtime recorded it", async () => {
    const core = createFakeCore();
    const api = createApiClient({
      baseUrl: "http://core.test",
      token: () => "token-1",
      fetch: core.fetch,
    });
    const oplog = memoryOplog([
      makeOp("doc.create", { workspaceId: "ws", id: "a", parentId: null, title: "Private" }),
      makeOp("doc.create", { workspaceId: "ws", id: "b", parentId: null, teamspaceId: "ts-1" }),
      makeOp("doc.create", { workspaceId: "ws", id: "c", parentId: null, teamspaceId: null }),
    ]);
    await createUploader({ api, oplog }).drain();
    expect(core.applied.map((e) => (e.input as { teamspaceId?: unknown }).teamspaceId)).toEqual([
      undefined,
      "ts-1",
      null,
    ]);
  });
});
