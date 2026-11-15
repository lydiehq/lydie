import { afterEach, describe, expect, it } from "bun:test";

import { ACTIVITY_WINDOW_MS, createGettingStarted, createRuntime } from "@lydie/runtime";

import { openNodeStore } from "./node.ts";
import { closeTestStores, openTestStore } from "./test-utils.ts";

const WS = "ws1";
const user = { type: "user", id: "u1" } as const;
const agent = { type: "agent", id: "a1", app: "claude", onBehalfOf: "u1" } as const;

afterEach(closeTestStores);

async function setup() {
  const test = await openTestStore();
  let now = Date.now();
  const runtime = createRuntime({
    ...test.store.ports,
    actor: user,
    clock: { now: () => new Date(now) },
  });
  return { ...test, runtime, ops: runtime.ops, advance: (ms: number) => void (now += ms) };
}

describe("activity log on SQLite", () => {
  it("coalesces body saves within the window and starts a new row after it", async () => {
    const { ops, runtime, advance } = await setup();
    const doc = await ops.doc.create({ workspaceId: WS, title: "Note" });
    for (let i = 0; i < 4; i++) {
      advance(1000);
      await runtime.execute(
        "doc.updateBody",
        { id: doc.id, markdown: `v${i}` },
        { history: false },
      );
    }
    advance(1000);
    await runtime.as(agent, "*", { sessionId: "s1" }).doc.updateBody({ id: doc.id, markdown: "a" });
    advance(ACTIVITY_WINDOW_MS);
    await ops.doc.updateBody({ id: doc.id, markdown: "later" });
    const { items } = await ops.activity.list({ workspaceId: WS, types: ["doc.bodyUpdated"] });
    expect(items.map((a) => [a.actor.id, a.sessionId, a.count])).toEqual([
      ["u1", null, 1],
      ["a1", "s1", 1],
      ["u1", null, 4],
    ]);
  });

  it("merges rename, move and property data", async () => {
    const { ops, advance } = await setup();
    const folder = await ops.doc.create({ workspaceId: WS, title: "Folder" });
    const doc = await ops.doc.create({ workspaceId: WS, title: "A", properties: { x: 1 } });
    for (const title of ["B", "C"]) {
      advance(1000);
      await ops.doc.rename({ id: doc.id, title });
    }
    advance(1000);
    await ops.doc.move({ id: doc.id, parentId: folder.id });
    advance(1000);
    await ops.doc.move({ id: doc.id, parentId: null });
    advance(1000);
    await ops.doc.setProperties({ id: doc.id, set: { x: 2 } });
    advance(1000);
    await ops.doc.setProperties({ id: doc.id, set: { y: "z" } });
    const { items } = await ops.activity.list({ workspaceId: WS, targetId: doc.id });
    expect(items.map((a) => [a.type, a.count, a.targetTitle, a.data])).toEqual([
      ["doc.propertiesChanged", 2, "C", { keys: ["x", "y"] }],
      ["doc.moved", 2, "C", { previousParentId: null, parentId: null }],
      ["doc.renamed", 2, "C", { previousTitle: "A", title: "C" }],
      ["doc.created", 1, "A", { parentId: null }],
    ]);
  });

  it("records a schema rewrite as one row about the database, and setup not at all", async () => {
    const { runtime, ops, advance } = await setup();
    await runtime.transaction(
      "Getting started",
      (tx) => createGettingStarted(tx, { workspaceId: WS, mode: "folder" }),
      { history: false, activity: false },
    );
    expect((await ops.activity.list({ workspaceId: WS })).items).toEqual([]);

    const tasks = await ops.database.create({ workspaceId: WS, title: "Tasks" });
    const databaseId = tasks.database.id;
    const status = await ops.database.addProperty({ databaseId, name: "Status", type: "select" });
    for (const title of ["Bug 1", "Bug 2", "Bug 3"]) {
      await ops.database.createRow({ databaseId, title, values: { [status.id]: "Open" } });
    }
    const open = (await ops.database.get({ id: databaseId })).properties.find(
      (p) => p.id === status.id,
    )!.config.options![0]!;
    const since = (await ops.activity.list({ workspaceId: WS, limit: 1 })).items[0]!.lastAt;
    advance(ACTIVITY_WINDOW_MS);
    await ops.database.updateOption({ propertyId: status.id, optionId: open.id, name: "Todo" });
    advance(1000);
    await runtime.history.undo();
    const { items } = await ops.activity.list({ workspaceId: WS });
    expect(
      items.filter((a) => a.lastAt > since).map((a) => [a.type, a.targetTitle, a.count]),
    ).toEqual([["database.changed", "Tasks", 2]]);
  });

  it("prunes rows older than the retention at open", async () => {
    const { ops, store, path } = await setup();
    await ops.doc.create({ workspaceId: WS, title: "Recent" });
    await store.db.execute(
      `INSERT INTO activity (id, workspace_id, actor, actor_ref, session_id, type, target_id,
         target_title, data, count, first_at, last_at)
       VALUES ('016f5e66-e800-0000-0000-000000000000', ?, '{"type":"user","id":"u1"}', 'u1', NULL,
         'doc.created', '016f5e66-e800-0000-0000-000000000001', 'Old', '{}', 1,
         '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z')`,
      [WS],
    );
    await store.close();
    const reopened = await openNodeStore({ path });
    try {
      const rows = await reopened.db.getAll<{ target_title: string }>(
        "SELECT target_title FROM activity",
      );
      expect(rows).toEqual([{ target_title: "Recent" }]);
    } finally {
      await reopened.close();
    }
  });
});
