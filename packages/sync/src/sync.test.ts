import { afterEach, describe, expect, test } from "bun:test";

import type { Store } from "@lydie/store";

import { createFakeCore } from "../test/fake-core.ts";
import { closeTestStores, createDoc, openTestStore } from "../test/store.ts";
import { waitFor } from "../test/wait.ts";
import { createApiClient } from "./http.ts";
import type { SessionState } from "./session.ts";
import { createHostedSync, deriveStatus, toBackendStatus } from "./sync.ts";
import { createObservable } from "./types.ts";

const stops: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop();
  await closeTestStores();
});

const storeStatus = {
  sync: "synced" as const,
  pendingOperations: 0,
  pendingUploads: 0,
  conflicts: 0,
  lastSyncedAt: "2026-11-13T00:00:00.000Z",
  error: null,
};
const facts = {
  session: "signed-in" as const,
  store: storeStatus,
  uploadError: null,
  retryAt: null,
  uploading: {},
  rejected: 0,
  started: true,
  openedAt: Date.parse("2026-11-12T23:00:00.000Z"),
};

describe("status model", () => {
  test("derives one state from session, PowerSync and the upload queue", () => {
    expect(deriveStatus(facts).state).toBe("synced");
    expect(
      deriveStatus({ ...facts, store: { ...storeStatus, pendingOperations: 3 } }),
    ).toMatchObject({ state: "syncing", pendingOperations: 3 });
    expect(deriveStatus({ ...facts, session: "expired" }).state).toBe("auth-expired");
    expect(deriveStatus({ ...facts, session: "signed-out" }).state).toBe("signed-out");
    expect(
      deriveStatus({ ...facts, uploadError: { message: "fetch failed", offline: true } }).state,
    ).toBe("offline");
    expect(
      deriveStatus({ ...facts, uploadError: { message: "502", offline: false } }),
    ).toMatchObject({ state: "error", error: "502" });
    expect(deriveStatus({ ...facts, store: { ...storeStatus, sync: "connecting" } }).state).toBe(
      "connecting",
    );
  });

  test("maps onto the plugin API's BackendStatus", () => {
    expect(toBackendStatus(deriveStatus({ ...facts, session: "expired" }))).toEqual({
      sync: "error",
      pendingOperations: 0,
      pendingUploads: 0,
      conflicts: 0,
      lastSyncedAt: "2026-11-13T00:00:00.000Z",
      error: "auth-expired",
      awaitingFirstSync: false,
    });
    expect(toBackendStatus(deriveStatus(facts)).sync).toBe("synced");
  });

  test("awaits the first sync until PowerSync completes one after the engine opened", () => {
    const opened = { ...facts, openedAt: Date.parse("2026-11-13T00:00:00.400Z") };
    const before = { ...storeStatus, lastSyncedAt: "2026-11-12T22:00:00.000Z" };
    expect(deriveStatus({ ...opened, store: { ...before, sync: "connecting" } })).toMatchObject({
      awaitingFirstSync: true,
    });
    // An earlier session's sync reads as "synced" until the first checkpoint: still waiting.
    expect(deriveStatus({ ...opened, store: before }).awaitingFirstSync).toBe(true);
    expect(
      deriveStatus({ ...opened, started: false, store: { ...storeStatus, lastSyncedAt: null } }),
    ).toMatchObject({ state: "offline", awaitingFirstSync: true });
    // Whole-second timestamps: a sync in the same second as the engine opened counts.
    expect(deriveStatus(opened).awaitingFirstSync).toBe(false);
    // Not reaching the server, or nobody signed in: nothing is on its way.
    expect(
      deriveStatus({ ...opened, store: { ...before, sync: "error", error: "fetch failed" } })
        .awaitingFirstSync,
    ).toBe(false);
    expect(
      deriveStatus({ ...opened, store: before, session: "signed-out" }).awaitingFirstSync,
    ).toBe(false);
  });
});

// `existing`: the database of an earlier engine, as after a restart.
async function engine(existing?: Store) {
  const store = existing ?? (await openTestStore()).store;
  const core = createFakeCore();
  const session = createObservable<SessionState>({
    status: "signed-in",
    user: { id: "user-1", email: "", name: "", image: null },
    token: "token-1",
  });
  const api = createApiClient({
    baseUrl: "http://core.test",
    token: () => "token-1",
    fetch: core.fetch,
    onUnauthorized: () => {
      const current = session.get();
      if (current.status === "signed-in") session.set({ status: "expired", user: current.user });
    },
  });
  const sync = createHostedSync({
    store,
    api,
    session,
    backoff: { baseMs: 5, maxMs: 20, jitter: false },
    // No PowerSync Service here; the PowerSync side is covered by connector.test.ts and the live suite.
    powersync: false,
  });
  stops.push(() => sync.stop());
  return { store, core, session, sync };
}

describe("hosted sync engine", () => {
  test("uploads as soon as an operation is queued, and reports pending counts", async () => {
    const { store, core, sync } = await engine();
    await sync.start();
    await createDoc(store, { workspaceId: "ws-1", title: "Top", teamspaceId: "ts-1" });
    await waitFor(() => core.applied.length === 1, { what: "upload" });
    expect((core.applied[0]!.input as { teamspaceId?: string }).teamspaceId).toBe("ts-1");
    await waitFor(() => sync.status.get().pendingOperations === 0, { what: "count" });
  });

  test("surfaces rejected changes until dismissed", async () => {
    const { store, core, sync } = await engine();
    core.decide = () => ({
      status: "rejected",
      error: { code: "forbidden", message: "Read only" },
    });
    await createDoc(store, { workspaceId: "ws-1", title: "Nope" });
    await sync.flush();
    expect(sync.rejected.get()).toEqual([
      expect.objectContaining({
        operation: "doc.create",
        reason: expect.objectContaining({ code: "forbidden" }),
      }),
    ]);
    expect(sync.status.get().rejected).toBe(1);
    sync.dismissRejected();
    expect(sync.status.get().rejected).toBe(0);
  });

  test("keeps rejected changes across a restart until dismissed", async () => {
    const first = await engine();
    first.core.decide = () => ({
      status: "rejected",
      error: { code: "forbidden", message: "Read only" },
    });
    const { id } = await createDoc(first.store, { workspaceId: "ws-1", title: "Nope" });
    await first.sync.flush();
    await waitFor(async () => (await first.store.meta.get("sync_rejected"))?.includes(id), {
      what: "saved",
    });
    await first.sync.stop();

    const second = await engine(first.store);
    await waitFor(() => second.sync.rejected.get().length === 1, { what: "restored" });
    expect(second.sync.rejected.get()[0]).toMatchObject({
      operation: "doc.create",
      reason: { code: "forbidden" },
    });
    expect(second.sync.status.get().rejected).toBe(1);
    second.sync.dismissRejected();
    await waitFor(async () => (await first.store.meta.get("sync_rejected")) === "[]", {
      what: "dismissal saved",
    });
    await second.sync.stop();

    const third = await engine(first.store);
    await third.sync.flush();
    expect(third.sync.rejected.get()).toEqual([]);
  });

  test("a dismissal while the saved list loads applies to it", async () => {
    const { store } = await openTestStore();
    const change = {
      operationId: "op-1",
      operation: "doc.rename",
      input: {},
      workspaceId: "ws-1",
      createdAt: "2026-11-13T00:00:00.000Z",
      reason: { code: "forbidden", message: "Read only" },
      rejectedAt: "2026-11-13T00:00:01.000Z",
    };
    await store.meta.set("sync_rejected", JSON.stringify([change]));
    const { sync } = await engine(store);
    sync.dismissRejected(["op-1"]);
    await waitFor(async () => (await store.meta.get("sync_rejected")) === "[]", {
      what: "dismissal saved",
    });
    expect(sync.rejected.get()).toEqual([]);
  });

  test("ignores a saved list it cannot read", async () => {
    const { store } = await openTestStore();
    await store.meta.set("sync_rejected", "{not json");
    const { sync } = await engine(store);
    await sync.flush();
    expect(sync.rejected.get()).toEqual([]);
  });

  test("retries after a 5xx storm with backoff and shows the error meanwhile", async () => {
    const { store, core, sync } = await engine();
    let failures = 8;
    core.hook = ({ path }) =>
      path === "/v1/sync/upload" && failures-- > 0
        ? new Response("{}", { status: 503 })
        : undefined;
    await sync.start();
    await createDoc(store, { workspaceId: "ws-1", title: "Eventually" });
    await waitFor(() => sync.status.get().state === "error" && sync.status.get().retryAt, {
      what: "error state with a retry time",
    });
    await waitFor(() => core.applied.length === 1, { what: "eventual upload" });
    await waitFor(() => sync.status.get().error === null, { what: "error cleared" });
  });

  test("a 401 stops uploads (auth-expired); a new sign-in resumes them", async () => {
    const { store, core, session, sync } = await engine();
    await sync.start();
    core.sessions.clear();
    await createDoc(store, { workspaceId: "ws-1", title: "Queued" });
    await waitFor(() => sync.status.get().state === "auth-expired", { what: "auth-expired" });
    expect(core.applied).toHaveLength(0);
    core.sessions.set("token-1", "user-1");
    session.set({
      status: "signed-in",
      user: { id: "user-1", email: "", name: "", image: null },
      token: "token-1",
    });
    await waitFor(() => core.applied.length === 1, { what: "upload after sign-in" });
  });
});
