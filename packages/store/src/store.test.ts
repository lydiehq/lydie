import { afterEach, describe, expect, it } from "bun:test";

import { createRuntime } from "@lydie/runtime";
import type { Runtime } from "@lydie/runtime";
import { createMemoryPorts } from "@lydie/runtime/memory";

import { openNodeStore } from "./node.ts";
import { queries } from "./queries.ts";
import { closeTestStores, nextData, openTestStore, rejection } from "./test-utils.ts";

const WS = "ws1";

afterEach(closeTestStores);

async function outline(runtime: Runtime, rootId?: string) {
  const { entries } = await runtime.ops.doc.listTree({
    workspaceId: WS,
    ...(rootId ? { rootId } : {}),
  });
  return entries.map((e) => `${"  ".repeat(e.depth)}${e.title}`);
}

// One scripted session, run against both the SQLite store and the in-memory ports.
async function script(runtime: Runtime) {
  const { ops } = runtime;
  const a = await ops.doc.create({ workspaceId: WS, title: "A" });
  const c = await ops.doc.create({ workspaceId: WS, title: "C" });
  const b = await ops.doc.create({ workspaceId: WS, title: "B", afterId: a.id });
  await ops.doc.create({ workspaceId: WS, title: "Zero", beforeId: a.id });
  const a1 = await ops.doc.create({ workspaceId: WS, title: "A1", parentId: a.id });
  for (let i = 0; i < 12; i++) {
    // Always insert right after A1: keys get longer, order must hold.
    await ops.doc.create({
      workspaceId: WS,
      title: `A1.${12 - i}`,
      parentId: a.id,
      afterId: a1.id,
    });
  }
  await ops.doc.move({ id: c.id, parentId: b.id });
  await ops.doc.move({ id: b.id, parentId: null, beforeId: a.id });
  await ops.doc.rename({ id: a1.id, title: "A-one" });
  await ops.doc.setProperties({ id: a.id, set: { tags: ["x", "y"], rating: 3, done: false } });
  await ops.doc.updateBody({ id: a.id, markdown: "# A\n\nLinks to [[B]] and [[Missing]]." });
  await ops.doc.delete({ id: c.id });
  return { a, b, c, a1 };
}

describe("runtime + store end to end", () => {
  it("runs every core operation against SQLite like the in-memory ports", async () => {
    const { runtime, store } = await openTestStore();
    const memory = createRuntime({ ...createMemoryPorts(), actor: { type: "user", id: "u1" } });
    const { a, b, c } = await script(runtime);
    await script(memory);

    expect(await outline(runtime)).toEqual(await outline(memory));
    expect(await outline(runtime)).toEqual([
      "Zero",
      "B",
      "A",
      "  A-one",
      ...Array.from({ length: 12 }, (_, i) => `  A1.${i + 1}`),
    ]);

    const got = await runtime.ops.doc.get({ id: a.id });
    expect(got.document.properties).toEqual({ tags: ["x", "y"], rating: 3, done: false });
    expect(got.body?.markdown).toContain("[[B]]");
    expect((await runtime.ops.doc.backlinks({ id: b.id })).backlinks).toEqual([
      {
        source: { id: a.id, title: "A", parentId: null, workspaceId: WS },
        kind: "link",
        syntax: "wikilink",
        targetRef: "B",
        sourceBlockId: null,
        targetHeading: null,
        targetBlockId: null,
        sourceProperty: null,
      },
    ]);

    // A late "Missing" resolves the dangling link.
    const missing = await runtime.ops.doc.create({ workspaceId: WS, title: "missing" });
    expect((await runtime.ops.doc.backlinks({ id: missing.id })).backlinks).toHaveLength(1);

    await runtime.ops.doc.restore({ id: c.id });
    expect(await outline(runtime, b.id)).toEqual(["C"]);
    expect((await store.getDoc(c.id, { includeBody: false }))?.body).toBeNull();
  });

  it("keeps no upload queue without a sync peer (local mode)", async () => {
    const { runtime, store } = await openTestStore();
    await runtime.ops.doc.create({ workspaceId: WS, title: "A", markdown: "x" });
    expect(await store.oplog.list()).toEqual([]);
    // The history journal still records it (session undo, audit).
    expect(await store.db.getAll("SELECT id FROM op_history")).toHaveLength(1);
  });

  it("logs each mutation in the same transaction", async () => {
    const { runtime, store } = await openTestStore("synced");
    expect(await store.oplog.isEmpty()).toBe(true);
    const doc = await runtime.ops.doc.create({ workspaceId: WS, title: "A", markdown: "x" });
    expect(await store.oplog.isEmpty()).toBe(false);
    await runtime.ops.doc.get({ id: doc.id });
    await runtime.ops.doc.rename({ id: doc.id, title: "B" });
    const log = await store.oplog.list();
    expect(log.map((e) => e.operation)).toEqual(["doc.create", "doc.rename"]);
    expect(log[0]).toMatchObject({
      workspaceId: WS,
      actor: { type: "user", id: "u1" },
      input: { id: doc.id, sortKey: doc.sortKey, markdown: "x" },
    });
    await store.oplog.remove([log[0]!.id]);
    expect(await store.oplog.list()).toHaveLength(1);
  });

  it("rolls back the rows and the log entry of a failed operation", async () => {
    const { store } = await openTestStore("synced");
    const runtime = createRuntime({
      ...store.ports,
      actor: { type: "user", id: "u1" },
      handlers: {
        async "doc.rename"(ctx, input) {
          await ctx.tx.docs.update(input.id, { title: "half-applied" });
          throw new Error("boom");
        },
      },
    });
    const doc = await runtime.ops.doc.create({ workspaceId: WS, title: "A" });
    expect(String(await rejection(runtime.ops.doc.rename({ id: doc.id, title: "B" })))).toContain(
      "boom",
    );
    expect((await store.getDoc(doc.id))?.document.title).toBe("A");
    expect(await store.oplog.list()).toHaveLength(1);
  });

  it("keeps local-mode writes out of PowerSync's upload queue", async () => {
    const local = await openTestStore("local");
    const synced = await openTestStore("synced");
    for (const { runtime } of [local, synced]) {
      await runtime.ops.doc.create({ workspaceId: WS, title: "A", markdown: "body" });
    }
    const count = (s: typeof local) =>
      s.store.db.get<{ n: number }>("SELECT count(*) AS n FROM ps_crud").then((r) => r.n);
    expect(await count(local)).toBe(0);
    // documents + links rows; bodies and the operation log are local-only in both modes.
    expect(await count(synced)).toBe(1);
  });

  it("persists across reopen", async () => {
    const { store, runtime, path } = await openTestStore();
    const doc = await runtime.ops.doc.create({
      workspaceId: WS,
      title: "Persistent",
      markdown: "hello world",
    });
    await store.close();
    const reopened = await openNodeStore({ path });
    try {
      expect((await reopened.getDoc(doc.id))?.body?.markdown).toBe("hello world");
      expect((await reopened.search(WS, "hello")).map((h) => h.id)).toEqual([doc.id]);
    } finally {
      await reopened.close();
    }
  });
});

describe("search", () => {
  it("matches prefixes in titles and bodies, ranks titles first, skips deleted", async () => {
    const { runtime, store } = await openTestStore();
    const { ops } = runtime;
    const garden = await ops.doc.create({
      workspaceId: WS,
      title: "Tomato garden",
      markdown: "Sun and water.",
    });
    const soup = await ops.doc.create({
      workspaceId: WS,
      title: "Soup",
      markdown: "Use ripe tomatoes. Café crème.",
    });
    await ops.doc.create({ workspaceId: "other", title: "Tomato elsewhere" });

    const hits = await store.search(WS, "tomat");
    expect(hits.map((h) => h.id)).toEqual([garden.id, soup.id]);
    expect(hits[1]?.snippet).toContain("<mark>tomatoes</mark>");
    expect((await store.search(WS, "cafe")).map((h) => h.id)).toEqual([soup.id]);
    expect(await store.search(WS, "tomato water")).toHaveLength(1);
    expect(await store.search(WS, '"); DROP TABLE documents; --')).toEqual([]);
    expect(await store.search(WS, "   ")).toEqual([]);

    await ops.doc.updateBody({ id: soup.id, markdown: "Now about onions." });
    expect((await store.search(WS, "onion")).map((h) => h.id)).toEqual([soup.id]);
    expect(await store.search(WS, "ripe")).toEqual([]);

    await ops.doc.rename({ id: garden.id, title: "Vegetable patch" });
    expect((await ops.doc.search({ workspaceId: WS, query: "vegetable" })).hits).toHaveLength(1);

    await ops.doc.delete({ id: soup.id });
    expect(await store.search(WS, "onion")).toEqual([]);
  });

  it("rebuilds the derived tables from the rows", async () => {
    const { runtime, store } = await openTestStore();
    const doc = await runtime.ops.doc.create({ workspaceId: WS, title: "Alpha", markdown: "beta" });
    await store.db.execute("DELETE FROM search_fts");
    expect(await store.search(WS, "beta")).toEqual([]);
    await store.rebuild();
    expect((await store.search(WS, "beta")).map((h) => h.id)).toEqual([doc.id]);

    await store.rebuild({ scope: "index" });
    expect(await store.listTree(WS)).toEqual([]);
    expect(await store.search(WS, "beta")).toEqual([]);
    // The history journal is not part of the index.
    expect(await store.db.getAll("SELECT id FROM op_history")).toHaveLength(1);
  });

  it("refuses to clear synced tables", async () => {
    const { store } = await openTestStore("synced");
    expect(String(await rejection(store.rebuild({ scope: "index" })))).toMatch(/local mode/);
  });
});

describe("watched queries", () => {
  it("fire on change and keep unchanged rows identical", async () => {
    const { runtime, store } = await openTestStore();
    const a = await runtime.ops.doc.create({ workspaceId: WS, title: "A" });
    const tree = store.watch(queries.listTree(WS));
    try {
      const first = await nextData(tree, (rows) => rows.length === 1);
      const pending = nextData(tree, (rows) => rows.length === 2);
      await runtime.ops.doc.create({ workspaceId: WS, title: "B" });
      const second = await pending;
      expect(second.map((r) => r.title)).toEqual(["A", "B"]);
      expect(second[0]).toBe(first[0]);

      const renamed = nextData(tree, (rows) => rows[0]?.title === "A!");
      await runtime.ops.doc.rename({ id: a.id, title: "A!" });
      expect((await renamed)[1]).toBe(second[1]);
    } finally {
      await tree.close();
    }
  });

  it("re-run search when only a body changes", async () => {
    const { runtime, store } = await openTestStore();
    const doc = await runtime.ops.doc.create({
      workspaceId: WS,
      title: "Note",
      markdown: "nothing",
    });
    const live = store.watch(queries.search(WS, "zebra"));
    try {
      await nextData(live, (rows) => rows.length === 0);
      const found = nextData(live, (rows) => rows.length === 1);
      // A body write without touching the documents row.
      await store.ports.db.write((tx) =>
        tx.bodies.put(doc.id, WS, { markdown: "a zebra", version: "v" }, doc.updatedAt),
      );
      expect((await found)[0]?.id).toBe(doc.id);
    } finally {
      await live.close();
    }
  });

  it("watch backlinks and a single document", async () => {
    const { runtime, store } = await openTestStore();
    const target = await runtime.ops.doc.create({ workspaceId: WS, title: "Target" });
    const links = store.watch(queries.backlinks(target.id));
    const doc = store.watch(queries.getDoc(target.id));
    try {
      await nextData(links, (rows) => rows.length === 0);
      await nextData(doc, (rows) => rows[0]?.body === null);
      const linked = nextData(links, (rows) => rows.length === 1);
      await runtime.ops.doc.create({ workspaceId: WS, title: "Source", markdown: "[[Target]]" });
      expect((await linked)[0]?.source.title).toBe("Source");
      const bodied = nextData(doc, (rows) => rows[0]?.body?.markdown === "hi");
      await runtime.ops.doc.updateBody({ id: target.id, markdown: "hi" });
      await bodied;
    } finally {
      await links.close();
      await doc.close();
    }
  });
});

describe("file index", () => {
  it("stores path ⇄ id bookkeeping", async () => {
    const { store } = await openTestStore();
    const entry = {
      id: "01933e6f-2284-b878-270f-04d17c6d9e48",
      workspaceId: WS,
      path: "Notes/Idea.md",
      mtime: 1_700_000_000_000,
      size: 42,
      hash: "abc",
      lca: "# Idea",
      indexedAt: "2026-11-12T10:00:00.000Z",
    };
    await store.fileIndex.put(entry);
    expect(await store.fileIndex.getByPath(WS, "Notes/Idea.md")).toEqual(entry);
    await store.fileIndex.put({ ...entry, path: "Idea.md", lca: null });
    expect(await store.fileIndex.list(WS)).toEqual([{ ...entry, path: "Idea.md", lca: null }]);
    await store.fileIndex.remove(entry.id);
    expect(await store.fileIndex.get(entry.id)).toBeNull();
  });
});
