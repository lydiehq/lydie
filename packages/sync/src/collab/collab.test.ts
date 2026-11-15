import { afterEach, describe, expect, test } from "bun:test";

import { startTestCollabServer } from "../../test/collab-server.ts";
import { waitFor } from "../../test/wait.ts";
import { createCollab } from "./collab.ts";
import type { Collab, CollabDocument } from "./collab.ts";
import { createMemoryYjsPersistence } from "./persistence.ts";
import type { YjsPersistence } from "./persistence.ts";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});

async function server() {
  const s = await startTestCollabServer();
  cleanups.push(() => s.stop());
  return s;
}

function client(
  s: { url: string },
  user: string,
  persistence: YjsPersistence = createMemoryYjsPersistence(),
  tokens?: () => string,
  gate?: (docId: string, signal: AbortSignal) => Promise<void>,
): Collab {
  let n = 0;
  const collab = createCollab({
    ...(gate ? { gate } : {}),
    token: async () => ({
      url: s.url,
      token: tokens ? tokens() : `${user}#${n++}`,
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    }),
    persistence,
    user: { name: user, color: "#0090ff" },
    reconnect: { delayMs: 50, maxDelayMs: 200 },
    idleDisconnectMs: 0,
  });
  cleanups.push(() => collab.close());
  return collab;
}

const text = (doc: CollabDocument) => doc.ydoc.getText("body").toJSON();
const status = (doc: CollabDocument) => doc.state.get().status;

describe("collab provider", () => {
  test("a gated document is edited and kept locally, and connects once the gate opens", async () => {
    const s = await server();
    const persistence = createMemoryYjsPersistence();
    let open!: () => void;
    const gated = new Promise<void>((resolve) => (open = resolve));
    const a = client(s, "alice", persistence, undefined, () => gated).open("new-doc");
    await a.loaded;
    a.ydoc.getText("body").insert(0, "typed before the server knew");
    await new Promise((r) => setTimeout(r, 150));
    expect(status(a)).toBe("offline");
    expect(s.sockets()).toBe(0);
    expect(await persistence.dirty()).toEqual(["new-doc"]);
    expect((await persistence.load("new-doc")).length).toBeGreaterThan(0);
    open();
    await a.whenSynced();
    const b = client(s, "bob").open("new-doc");
    await b.whenSynced();
    expect(text(b)).toBe("typed before the server knew");
  });

  test("releasing a gated document stops waiting and keeps its edits", async () => {
    const s = await server();
    const persistence = createMemoryYjsPersistence();
    let aborted = false;
    const collab = client(s, "alice", persistence, undefined, (_id, signal) => {
      return new Promise<void>((_, reject) =>
        signal.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("aborted"));
        }),
      );
    });
    const doc = collab.open("offline-doc");
    await doc.loaded;
    doc.ydoc.getText("body").insert(0, "kept");
    doc.release();
    await waitFor(() => aborted, { what: "the gate to be aborted" });
    expect(await persistence.dirty()).toEqual(["offline-doc"]);
  });

  test("two clients converge, with presence", async () => {
    const s = await server();
    const a = client(s, "alice").open("doc-1");
    const b = client(s, "bob").open("doc-1");
    await a.whenSynced();
    await b.whenSynced();
    a.ydoc.getText("body").insert(0, "Hello");
    await waitFor(() => text(b) === "Hello", { what: "A's edit on B" });
    b.ydoc.getText("body").insert(5, " world");
    await waitFor(() => text(a) === "Hello world", { what: "B's edit on A" });
    await waitFor(
      () =>
        [...a.awareness.getStates().values()].some(
          (state) => (state as { user?: { name: string } }).user?.name === "bob",
        ),
      { what: "B's presence on A" },
    );
    expect(status(a)).toBe("synced");
  });

  test("multiplexes every document over one socket", async () => {
    const s = await server();
    const collab = client(s, "alice");
    const docs = ["d1", "d2", "d3"].map((id) => collab.open(id));
    await Promise.all(docs.map((d) => d.whenSynced()));
    expect(s.sockets()).toBe(1);
    expect(collab.status.get().connection).toBe("connected");
    expect(Object.keys(collab.status.get().documents).sort()).toEqual(["d1", "d2", "d3"]);
  });

  test("an edit made offline survives a restart and syncs when the server is back", async () => {
    const s = await server();
    const persistence = createMemoryYjsPersistence();
    // Seed the document on the server, then go offline.
    const first = client(s, "alice", persistence);
    const doc = first.open("doc-2");
    await doc.whenSynced();
    doc.ydoc.getText("body").insert(0, "online.");
    await doc.whenSynced();
    await s.stop();
    await waitFor(() => status(doc) === "offline" || status(doc) === "connecting", {
      what: "offline status",
    });
    doc.ydoc.getText("body").insert(7, " offline edit.");
    expect(doc.state.get().unsyncedChanges).toBeGreaterThan(0);
    // "Restart": the app closes; nothing reached the server.
    await first.close();
    expect(await persistence.dirty()).toEqual(["doc-2"]);

    await s.restart();
    const second = client(s, "alice", persistence);
    // Not even opened by the user: pushPending connects the dirty document.
    const pushed = await second.pushPending(10_000);
    expect(pushed).toEqual({ pushed: ["doc-2"], pending: [] });
    expect(await s.text("doc-2")).toBe("online. offline edit.");
    expect(await persistence.dirty()).toEqual([]);
  });

  test("reconnects with backoff after the server goes away", async () => {
    const s = await server();
    const doc = client(s, "alice").open("doc-3");
    const peer = client(s, "bob").open("doc-3");
    await doc.whenSynced();
    await s.stop();
    await waitFor(() => status(doc) !== "synced", { what: "disconnect" });
    doc.ydoc.getText("body").insert(0, "while away");
    await s.restart();
    await waitFor(() => text(peer) === "while away", { timeoutMs: 10_000, what: "convergence" });
    await doc.whenSynced();
  });

  test("starts read-only for view access and flips with lydie.access", async () => {
    const s = await server();
    s.setAccess("bob", "doc-4", "view");
    const doc = client(s, "bob").open("doc-4");
    await doc.whenSynced();
    expect(doc.state.get().readOnly).toBe(true);
    s.setAccess("bob", "doc-4", "edit");
    s.recheck();
    await waitFor(() => doc.state.get().readOnly === false, { what: "upgrade" });
    expect(doc.state.get().level).toBe("edit");
    s.setAccess("bob", "doc-4", "comment");
    s.recheck();
    await waitFor(() => doc.state.get().readOnly === true, { what: "downgrade" });
    expect(doc.state.get().level).toBe("comment");
  });

  test("revoked access (4403) makes the document unavailable and forgets the local copy", async () => {
    const s = await server();
    const persistence = createMemoryYjsPersistence();
    const doc = client(s, "bob", persistence).open("doc-5");
    await doc.whenSynced();
    doc.ydoc.getText("body").insert(0, "secret");
    await doc.whenSynced();
    expect(persistence.docs.get("doc-5")?.length).toBeGreaterThan(0);
    s.setAccess("bob", "doc-5", "none");
    s.recheck();
    await waitFor(() => status(doc) === "unavailable", { what: "unavailable" });
    expect(doc.state.get()).toMatchObject({ reason: "forbidden", readOnly: true });
    await waitFor(() => !persistence.docs.has("doc-5"), { what: "local copy dropped" });
    // It stays unavailable: no reconnect loop.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(status(doc)).toBe("unavailable");
    let rejected = false;
    await doc.whenSynced(500).catch(() => (rejected = true));
    expect(rejected).toBe(true);
  });

  test("a document never accessible is unavailable at once", async () => {
    const s = await server();
    s.setAccess("eve", "doc-6", "none");
    const doc = client(s, "eve").open("doc-6");
    await waitFor(() => status(doc) === "unavailable", { what: "refusal" });
    expect(doc.state.get().reason).toBe("forbidden");
  });

  test("refreshes a stale token and connects", async () => {
    const s = await server();
    s.staleTokens.add("alice#stale");
    let calls = 0;
    const doc = client(s, "alice", undefined, () =>
      calls++ === 0 ? "alice#stale" : "alice#fresh",
    ).open("doc-7");
    await doc.whenSynced(10_000);
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  test("handles share one Y.Doc; the connection closes after the last release", async () => {
    const s = await server();
    const collab = client(s, "alice");
    const one = collab.open("doc-8");
    const two = collab.open("doc-8");
    expect(one.ydoc).toBe(two.ydoc);
    await one.whenSynced();
    one.release();
    expect(collab.status.get().documents["doc-8"]).toBeDefined();
    two.release();
    await waitFor(() => !collab.status.get().documents["doc-8"], { what: "dispose" });
  });
});
