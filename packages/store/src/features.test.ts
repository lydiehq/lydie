import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Properties } from "@lydie/contract";
import { addAttachment, createRuntime, extract } from "@lydie/runtime";
import { activeGroup, openLayoutController } from "@lydie/runtime/layout";

import { createDirectoryBlob, openNodeStore } from "./node.ts";
import { queries } from "./queries.ts";
import { syncStateOf } from "./status.ts";
import type { StoreStatus } from "./status.ts";
import { closeTestStores, nextLive, openTestStore } from "./test-utils.ts";

const WS = "ws1";
const dirs: string[] = [];

afterEach(async () => {
  await closeTestStores();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("status", () => {
  it("reports local-only with sync off, and counts conflicts", async () => {
    const { store, runtime } = await openTestStore();
    expect(store.status.get()).toMatchObject({ sync: "local-only", pendingOperations: 0 });
    const seen: StoreStatus[] = [];
    const off = store.status.subscribe((s) => seen.push(s));
    const doc = await runtime.ops.doc.create({ workspaceId: WS, title: "A" });
    await store.conflicts.set({
      id: doc.id,
      workspaceId: WS,
      kind: "file",
      details: { path: "A.md" },
    });
    for (let i = 0; i < 50 && store.status.get().conflicts === 0; i++) await Bun.sleep(5);
    expect(store.status.get()).toMatchObject({
      sync: "local-only",
      conflicts: 1,
      pendingOperations: 0,
    });
    expect(seen.at(-1)?.conflicts).toBe(1);
    expect(await store.conflicts.list(WS)).toEqual([
      expect.objectContaining({ id: doc.id, kind: "file", details: { path: "A.md" } }),
    ]);
    await store.conflicts.clear(doc.id);
    off();
  });

  it("counts pending operations and uploads in synced mode", async () => {
    const { store, runtime } = await openTestStore("synced");
    const off = store.status.subscribe(() => {});
    expect(store.status.get().sync).toBe("offline");
    await runtime.ops.doc.create({ workspaceId: WS, title: "A" });
    await runtime.ops.attachment.create({
      workspaceId: WS,
      filename: "a.png",
      contentType: "image/png",
      size: 1,
      sha256: "e".repeat(64),
    });
    for (let i = 0; i < 50 && store.status.get().pendingUploads === 0; i++) await Bun.sleep(5);
    expect(store.status.get()).toMatchObject({ pendingOperations: 2, pendingUploads: 1 });
    off();
  });

  it("maps PowerSync's status", () => {
    const base = { connected: false, connecting: false, hasSynced: false, dataFlowStatus: {} };
    const s = (over: object) => ({ ...base, ...over }) as never;
    expect(syncStateOf("local", s({ connected: true }))).toBe("local-only");
    expect(syncStateOf("synced", s({}))).toBe("offline");
    expect(syncStateOf("synced", s({ connecting: true }))).toBe("connecting");
    expect(
      syncStateOf("synced", s({ connected: true, dataFlowStatus: { downloading: true } })),
    ).toBe("syncing");
    expect(syncStateOf("synced", s({ connected: true, hasSynced: true }))).toBe("synced");
    expect(syncStateOf("synced", s({ dataFlowStatus: { uploadError: new Error("x") } }))).toBe(
      "error",
    );
  });
});

describe("live queries", () => {
  it("expose { data, isLoading, error } and keep unchanged rows", async () => {
    const { store, runtime } = await openTestStore();
    const a = await runtime.ops.doc.create({ workspaceId: WS, title: "A" });
    const live = store.live(queries.children(WS, null));
    try {
      expect(live.state).toEqual({ data: [], isLoading: true, error: undefined });
      let calls = 0;
      live.subscribe(() => calls++);
      await nextLive(live, (rows) => rows.length === 1);
      const first = live.state.data[0];
      await runtime.ops.doc.create({ workspaceId: WS, title: "B" });
      await nextLive(live, (rows) => rows.length === 2);
      expect(live.state.data[0]).toBe(first);
      expect(live.state.isLoading).toBe(false);
      expect(calls).toBeGreaterThan(0);
      expect(a.id).toBe(first!.id);
    } finally {
      await live.close();
    }
    const broken = store.live({ ...queries.children(WS, null), sql: "SELECT * FROM nope" });
    try {
      for (let i = 0; i < 50 && !broken.state.error; i++) await Bun.sleep(5);
      expect(broken.state.error).toBeInstanceOf(Error);
    } finally {
      await broken.close();
    }
  });
});

describe("tree loading", () => {
  it("lists children with counts and a tree limited to expanded folders", async () => {
    const { store, runtime } = await openTestStore();
    const { ops } = runtime;
    const a = await ops.doc.create({ workspaceId: WS, title: "A" });
    const a1 = await ops.doc.create({ workspaceId: WS, title: "A1", parentId: a.id });
    await ops.doc.create({ workspaceId: WS, title: "A11", parentId: a1.id });
    const b = await ops.doc.create({ workspaceId: WS, title: "B" });
    await ops.doc.create({ workspaceId: WS, title: "B1", parentId: b.id });
    const top = await store.query(queries.children(WS, null));
    expect(top.map((e) => [e.title, e.childCount])).toEqual([
      ["A", 1],
      ["B", 1],
    ]);
    const visible = await store.listTree(WS, { expanded: [a.id] });
    expect(visible.map((e) => `${"  ".repeat(e.depth)}${e.title}`)).toEqual(["A", "  A1", "B"]);
    expect((await ops.doc.listChildren({ workspaceId: WS, parentId: a.id })).entries).toEqual([
      expect.objectContaining({ title: "A1", childCount: 1 }),
    ]);
  });
});

describe("database rows", () => {
  it("filter and sort children by typed properties", async () => {
    const { store, runtime } = await openTestStore();
    const db = await runtime.ops.doc.create({ workspaceId: WS, title: "Tasks" });
    const rows: { title: string; properties: Properties }[] = [
      { title: "Write", properties: { status: "todo", priority: 2, tags: ["work"], done: false } },
      {
        title: "Ship",
        properties: { status: "done", priority: 1, tags: ["work", "launch"], done: true },
      },
      { title: "Rest", properties: { status: "todo", priority: 3, tags: ["home"], done: false } },
      { title: "Plan", properties: { status: "todo", tags: [], done: false } },
    ];
    await runtime.transaction("Seed", async (ops) => {
      for (const row of rows) await ops.doc.create({ workspaceId: WS, parentId: db.id, ...row });
    });
    const titles = async (options: Parameters<typeof queries.rows>[2]) =>
      (await store.query(queries.rows(WS, db.id, options))).map((r) => r.title);
    expect(
      await titles({
        filters: [{ key: "status", op: "eq", value: "todo" }],
        sorts: [{ key: "priority" }],
      }),
    ).toEqual(["Write", "Rest", "Plan"]);
    expect(await titles({ sorts: [{ key: "priority", direction: "desc" }] })).toEqual([
      "Rest",
      "Write",
      "Ship",
      "Plan",
    ]);
    expect(await titles({ filters: [{ key: "tags", op: "contains", value: "work" }] })).toEqual([
      "Write",
      "Ship",
    ]);
    expect(await titles({ filters: [{ key: "done", op: "eq", value: true }] })).toEqual(["Ship"]);
    expect(await titles({ filters: [{ key: "priority", op: "gte", value: 2 }] })).toEqual([
      "Write",
      "Rest",
    ]);
    expect(await titles({ filters: [{ key: "priority", op: "isEmpty" }] })).toEqual(["Plan"]);
    expect(await titles({ filters: [{ key: 'we"ird', op: "isNotEmpty" }] })).toEqual([]);
    expect(await titles({ sorts: [{ key: "priority" }], limit: 2, offset: 1 })).toEqual([
      "Write",
      "Rest",
    ]);
  });
});

describe("attachments and uploads", () => {
  it("stores bytes in a directory blob and tracks upload state", async () => {
    const { store, runtime } = await openTestStore();
    const dir = mkdtempSync(join(tmpdir(), "lydie-blob-"));
    dirs.push(dir);
    const blob = createDirectoryBlob(dir);
    const data = new TextEncoder().encode("bytes");
    const a = await addAttachment(runtime, blob, {
      workspaceId: WS,
      filename: "b.txt",
      contentType: "text/plain",
      data,
    });
    expect(await blob.get(a.sha256)).toEqual(data);
    expect(await blob.has!(a.sha256)).toBe(true);
    expect(await store.uploads.get(a.id)).toMatchObject({ state: "local", attempts: 0 });
    await store.uploads.set(a.id, "uploading");
    await store.uploads.set(a.id, "failed", "network");
    await store.uploads.set(a.id, "uploading");
    expect(await store.uploads.get(a.id)).toMatchObject({
      state: "uploading",
      attempts: 2,
      error: null,
    });
    await store.uploads.set(a.id, "uploaded");
    expect(await store.uploads.list({ state: "uploaded" })).toHaveLength(1);
    expect((await store.query(queries.attachments(WS))).map((x) => x.filename)).toEqual(["b.txt"]);
    await blob.delete(a.sha256);
    expect(await blob.get(a.sha256)).toBeNull();
  });
});

describe("layouts", () => {
  it("persist per device through the store and restore on start", async () => {
    const { store } = await openTestStore();
    const persist = {
      load: () => store.layouts.load("main"),
      save: (layout: unknown) => store.layouts.save("main", layout),
    };
    const controller = await openLayoutController({ persist, debounceMs: 5 });
    controller.dispatch({ type: "open", path: "/trash" });
    const tabId = activeGroup(controller.getState()).tabs[0]!.id;
    controller.dispatch({ type: "setTabState", tabId, state: { scrollTop: 300 } });
    await controller.close();
    const restored = await openLayoutController({ persist });
    expect(restored.getTab(tabId)).toMatchObject({
      path: "/trash",
      state: { scrollTop: 300 },
    });
    // Layouts are device state: never in the operation log or the upload queue.
    expect(await store.oplog.list()).toEqual([]);
    expect(await store.db.getAll("SELECT * FROM ps_crud")).toEqual([]);
    await store.layouts.remove("main");
    expect(await store.layouts.load("main")).toBeNull();
  });
});

describe("history retention", () => {
  it("prunes old and excess journal entries after open", async () => {
    const { store, runtime, path } = await openTestStore();
    for (let i = 0; i < 5; i++) await runtime.ops.doc.create({ workspaceId: WS, title: `D${i}` });
    // An entry from 2020 (an id minted in 2020).
    await store.db.execute(
      `INSERT INTO op_history (id, operation, input, inverse, touches, actor, group_id, created_at)
       VALUES ('016f5e66-e800-0000-0000-000000000000', 'doc.rename', '{}', NULL, '[]', '{}', 'g', '2020-01-01T00:00:00.000Z')`,
    );
    await store.close();
    const reopened = await openNodeStore({
      path,
      historyRetention: { maxEntries: 3 },
      maintenanceDelayMs: 0,
    });
    try {
      await reopened.maintenance;
      const ids = await reopened.db.getAll<{ id: string }>("SELECT id FROM op_history ORDER BY id");
      expect(ids).toHaveLength(3);
      expect(ids.some((r) => r.id.startsWith("01DXF"))).toBe(false);
    } finally {
      await reopened.close();
    }
  });
});

describe("meta", () => {
  it("keeps values with the database, apart from the store's own", async () => {
    const { store, path } = await openTestStore();
    expect(await store.meta.get("extract_version")).toBeNull();
    await store.meta.set("extract_version", "m1");
    // The store's own key of the same name is untouched, so the next open does not rebuild.
    await store.meta.set("derived_version", "nonsense");
    await store.close();
    const again = await openNodeStore({ path, mode: "local" });
    try {
      expect(await again.meta.get("extract_version")).toBe("m1");
      expect(await again.meta.get("derived_version")).toBe("nonsense");
      const own = await again.db.getOptional<{ value: string }>(
        "SELECT value FROM lydie_meta WHERE key = 'derived_version'",
      );
      expect(own?.value).not.toBe("nonsense");
    } finally {
      await again.close();
    }
  });
});

describe("reindexing bodies", () => {
  it("rewrites links and blocks through the store's ports", async () => {
    const { store } = await openTestStore();
    const old = createRuntime({
      ...store.ports,
      actor: { type: "user", id: "u1" },
      extract: (markdown) => ({ ...extract(markdown), links: [], blocks: [] }),
    });
    const target = await old.ops.doc.create({ workspaceId: WS, title: "Target" });
    const source = await old.ops.doc.create({
      workspaceId: WS,
      title: "Source",
      markdown: "See [[Target]]\n\nQuote ^q1\n",
    });
    expect(await store.backlinks(target.id)).toHaveLength(0);
    const pending = (await store.oplog.list()).length;

    const current = createRuntime({ ...store.ports, actor: { type: "user", id: "u1" } });
    expect(await current.reindexBodies(WS)).toEqual({ documents: 1 });
    expect((await store.backlinks(target.id)).map((b) => b.source.id)).toEqual([source.id]);
    expect(await store.oplog.list()).toHaveLength(pending);
  });
});
