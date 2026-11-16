// Port methods that answer several questions in one statement agree with their one-at-a-time
// versions (and the memory ports).
import { afterEach, expect, test } from "bun:test";

import type { Activity } from "@lydie/contract";
import { createRuntime, linkKey } from "@lydie/runtime";
import type { ActivityKey } from "@lydie/runtime";
import { createMemoryPorts } from "@lydie/runtime/memory";

import { closeTestStores, openTestStore } from "./test-utils.ts";

afterEach(closeTestStores);

const TITLES = [
  "Plan",
  "plan.md",
  "Café Plan",
  "Café plan",
  "日本語のメモ",
  "İstanbul",
  "Plan 🎉 party",
  "a🎉b",
  "Ωmega.md",
  "naïve_idea",
  "🎉🎉",
];

test("findAllByLinkKeys finds every title with a key, ASCII or not, in order", async () => {
  const { runtime, store } = await openTestStore();
  const memory = createMemoryPorts();
  const other = createRuntime({ ...memory, actor: { type: "user", id: "u1" } });
  for (const r of [runtime, other]) {
    for (const title of TITLES) await r.ops.doc.create({ workspaceId: "ws", title });
    const gone = await r.ops.doc.create({ workspaceId: "ws", title: "Café plan" });
    await r.ops.doc.delete({ id: gone.id });
    await r.ops.doc.create({ workspaceId: "elsewhere", title: "Plan" });
  }
  const keys = [...new Set([...TITLES.map(linkKey), "missing", "ünknown"])];
  const titlesOf = async (db: typeof store.ports.db) =>
    db.read(async (tx) => {
      const found = await tx.docs.findAllByLinkKeys!("ws", keys);
      const one = new Map<string, string[]>();
      for (const key of keys) {
        one.set(
          key,
          (await tx.docs.findAllByLinkKey!("ws", key)).map((d) => d.title),
        );
      }
      return {
        batch: Object.fromEntries(keys.map((k) => [k, (found.get(k) ?? []).map((d) => d.title)])),
        one: Object.fromEntries(one),
      };
    });
  const sqlite = await titlesOf(store.ports.db);
  const reference = await titlesOf(memory.db);
  expect(sqlite.batch).toEqual(sqlite.one);
  expect(sqlite.batch).toEqual(reference.batch);
  expect(sqlite.batch["café plan"]).toEqual(["Café Plan", "Café plan"]);
  expect(sqlite.batch["i̇stanbul"]).toEqual(["İstanbul"]);
  expect(sqlite.batch["🎉🎉"]).toEqual(["🎉🎉"]);
});

test("the activity log's batch methods match latest, insert and update", async () => {
  const { store } = await openTestStore();
  const row = (id: string, targetId: string, lastAt: string, sessionId: string | null = null) =>
    ({
      id,
      workspaceId: "ws",
      actor: { type: "user", id: "u1" },
      sessionId,
      type: "doc.bodyUpdated",
      targetId,
      targetTitle: "T",
      data: {},
      count: 1,
      firstAt: lastAt,
      lastAt,
    }) satisfies Activity;
  const key = (targetId: string, sessionId: string | null = null): ActivityKey => ({
    workspaceId: "ws",
    actor: "u1",
    sessionId,
    type: "doc.bodyUpdated",
    targetId,
  });
  await store.ports.db.write(async (tx) => {
    const log = tx.activity!;
    await log.insertMany!([
      row("a1", "d1", "2026-01-01T00:00:00.000Z"),
      row("a2", "d1", "2026-01-01T00:01:00.000Z"),
      row("a3", "d2", "2026-01-01T00:00:00.000Z", "s1"),
    ]);
    await log.insert(row("a4", "d3", "2026-01-01T00:00:00.000Z"));
    await log.updateMany!([
      {
        id: "a2",
        patch: { count: 5, lastAt: "2026-01-01T00:02:00.000Z", targetTitle: "U", data: {} },
      },
      {
        id: "a4",
        patch: { count: 2, lastAt: "2026-01-01T00:03:00.000Z", targetTitle: null, data: {} },
      },
    ]);
    const keys = [key("d1"), key("d2", "s1"), key("d2"), key("d3"), key("none")];
    const many = await log.latestMany!(keys);
    const one = (await Promise.all(keys.map((k) => log.latest(k)))).filter((r) => r !== null);
    const byId = (rows: Activity[]) => [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(byId(many)).toEqual(byId(one));
    expect(byId(many).map((r) => [r.id, r.count, r.targetTitle])).toEqual([
      ["a2", 5, "U"],
      ["a3", 1, "T"],
      ["a4", 2, null],
    ]);
  });
});

test("trash.list counts what went with each root and stops at the limit", async () => {
  const { runtime } = await openTestStore();
  const ops = runtime.ops;
  const ids: string[] = [];
  for (let i = 0; i < 4; i++) {
    const root = await ops.doc.create({ workspaceId: "ws", title: `Root ${i}` });
    const child = await ops.doc.create({ workspaceId: "ws", title: "Child", parentId: root.id });
    for (let j = 0; j < i; j++) {
      await ops.doc.create({ workspaceId: "ws", title: "Grandchild", parentId: child.id });
    }
    ids.push(root.id);
  }
  // Deleted on its own first: its own root in the trash, not counted with its parent's.
  const early = await ops.doc.create({ workspaceId: "ws", title: "Early", parentId: ids[3]! });
  await ops.doc.delete({ id: early.id });
  await new Promise((r) => setTimeout(r, 2));
  for (const id of ids) {
    await ops.doc.delete({ id });
    await new Promise((r) => setTimeout(r, 2));
  }
  const all = await ops.trash.list({ workspaceId: "ws" });
  expect(all.items.map((i) => [i.title, i.descendantCount])).toEqual([
    ["Root 3", 4],
    ["Root 2", 3],
    ["Root 1", 2],
    ["Root 0", 1],
    ["Early", 0],
  ]);
  const two = await ops.trash.list({ workspaceId: "ws", limit: 2 });
  expect(two.items.map((i) => i.title)).toEqual(["Root 3", "Root 2"]);
  const emptied = await ops.trash.empty({ workspaceId: "ws" });
  expect(emptied.purgedIds).toHaveLength(15);
  expect((await ops.trash.list({ workspaceId: "ws" })).items).toEqual([]);
});
