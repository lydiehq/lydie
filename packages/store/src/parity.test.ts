import { afterEach, describe, expect, it } from "bun:test";

import { createRuntime } from "@lydie/runtime";
import type { Runtime } from "@lydie/runtime";
import { createMemoryPorts } from "@lydie/runtime/memory";

import { closeTestStores, openTestStore } from "./test-utils.ts";

const WS = "ws1";
const user = { type: "user", id: "u1" } as const;
const agent = { type: "agent", id: "a1", app: "claude", onBehalfOf: "u1" } as const;

afterEach(closeTestStores);

// Deterministic ids and clock so both backends produce identical results.
function deterministic() {
  let tick = Date.parse("2026-11-12T10:00:00.000Z");
  let n = 0;
  const uuid = () => `0193a5e2-7c3b-7000-8000-${String(n++).padStart(12, "0")}`;
  return { clock: { now: () => new Date((tick += 1000)) }, ids: { uuid } };
}

// Exercises every operation and returns everything the queries say afterwards.
async function scenario(runtime: Runtime) {
  const { ops } = runtime;
  const projects = await ops.doc.create({ workspaceId: WS, title: "Projects" });
  const atlas = await ops.doc.create({
    workspaceId: WS,
    title: "Atlas",
    parentId: projects.id,
    properties: { status: "active", aliases: ["The map"] },
    markdown: "# Atlas\n\nGoals for the year. ^goals\n\nSee [[Roadmap]].",
  });
  const roadmap = await ops.doc.create({
    workspaceId: WS,
    title: "Roadmap",
    parentId: projects.id,
  });
  const notes = await ops.doc.create({
    workspaceId: WS,
    title: "Notes",
    markdown:
      "Atlas is on track. See [[Atlas#^goals]] and [[Atlas#Atlas|heading]] and [[Missing]].",
  });
  await ops.doc.create({
    workspaceId: WS,
    title: "Journal",
    markdown: "Talked about atlas and the map.",
  });
  await runtime.transaction("Reorganise", async (tx) => {
    await tx.doc.move({ id: roadmap.id, parentId: null, beforeId: projects.id });
    await tx.doc.rename({ id: notes.id, title: "Meeting notes" });
  });
  const session = runtime.as(agent, "*", { sessionId: "mcp-1" });
  const draft = await session.doc.create({ workspaceId: WS, title: "Agent draft", markdown: "x" });
  await session.doc.setProperties({ id: atlas.id, set: { owner: "agent" } });
  await session.attachment.create({
    workspaceId: WS,
    documentId: draft.id,
    filename: "chart.png",
    contentType: "image/png",
    size: 10,
    sha256: "c".repeat(64),
  });
  const file = await ops.attachment.create({
    workspaceId: WS,
    filename: "scan.pdf",
    contentType: "application/pdf",
    size: 20,
    sha256: "d".repeat(64),
  });
  await ops.attachment.delete({ id: file.id });
  await ops.doc.delete({ id: projects.id });
  await ops.doc.restore({ id: projects.id });
  const tmp = await ops.doc.create({ workspaceId: WS, title: "Tmp", parentId: roadmap.id });
  await ops.doc.delete({ id: tmp.id });
  await runtime.history.undo();
  await runtime.history.redo();
  const undone = await ops.history.undoSession({ sessionId: "mcp-1" });

  return {
    undone,
    tree: (await ops.doc.listTree({ workspaceId: WS, includeDeleted: true })).entries,
    top: (await ops.doc.listChildren({ workspaceId: WS })).entries,
    trash: (await ops.trash.list({ workspaceId: WS })).items,
    backlinks: (await ops.doc.backlinks({ id: atlas.id })).backlinks,
    blockBacklinks: (await ops.doc.blockBacklinks({ id: atlas.id, blockId: "goals" })).backlinks,
    unresolved: (await ops.doc.unresolvedLinks({ workspaceId: WS })).links,
    mentions: (await ops.doc.unlinkedMentions({ id: atlas.id })).mentions.map((m) => m.source),
    attachments: (await ops.attachment.list({ workspaceId: WS, includeDeleted: true })).attachments,
    sessions: (await ops.history.listSessions({})).sessions,
    sessionLog: (await ops.history.listBySession({ sessionId: "mcp-1" })).entries,
    atlas: await ops.doc.get({ id: atlas.id }),
    emptied: (await ops.trash.empty({ workspaceId: WS })).purgedIds.sort(),
    after: (await ops.doc.listTree({ workspaceId: WS, includeDeleted: true })).entries.length,
    activity: await allActivity(runtime),
    filtered: (
      await ops.activity.list({
        workspaceId: WS,
        actors: ["agent:claude:a1:u1"],
        types: ["doc.created", "doc.propertiesChanged"],
        search: "DRAFT",
      })
    ).items,
  };
}

// Every activity row, page by page (3 at a time, to exercise the cursor).
async function allActivity(runtime: Runtime) {
  const items = [];
  let cursor: string | undefined;
  do {
    const page = await runtime.ops.activity.list({
      workspaceId: WS,
      limit: 3,
      ...(cursor ? { cursor } : {}),
    });
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

describe("SQLite and memory ports agree", () => {
  it("on every operation and query", async () => {
    const { store } = await openTestStore();
    const sqlite = createRuntime({ ...store.ports, actor: user, ...deterministic() });
    const memory = createRuntime({ ...createMemoryPorts(), actor: user, ...deterministic() });
    const fromSqlite = await scenario(sqlite);
    const fromMemory = await scenario(memory);
    expect(fromSqlite).toEqual(fromMemory);

    // And the results are what the scenario intends.
    expect(fromSqlite.undone.skipped).toEqual([]);
    expect(fromSqlite.undone.undoneIds).toHaveLength(3);
    expect(
      fromSqlite.tree.map(
        (e) => `${"  ".repeat(e.depth)}${e.title}${e.deletedAt ? " (trash)" : ""}`,
      ),
    ).toEqual([
      "Roadmap",
      "  Tmp (trash)",
      "Projects",
      "  Atlas",
      "Meeting notes",
      "Journal",
      "Agent draft (trash)",
    ]);
    expect(fromSqlite.top.map((e) => [e.title, e.childCount])).toEqual([
      ["Roadmap", 0],
      ["Projects", 1],
      ["Meeting notes", 0],
      ["Journal", 0],
    ]);
    expect(fromSqlite.trash.map((i) => i.title)).toEqual([
      "Agent draft",
      "chart.png",
      "Tmp",
      "scan.pdf",
    ]);
    expect(fromSqlite.blockBacklinks.map((b) => b.source.title)).toEqual(["Meeting notes"]);
    expect(fromSqlite.backlinks.map((b) => [b.targetHeading, b.targetBlockId])).toEqual([
      [null, "goals"],
      ["Atlas", null],
    ]);
    expect(fromSqlite.unresolved.map((l) => l.targetRef)).toEqual(["Missing"]);
    expect(fromSqlite.mentions.map((m) => m.title)).toEqual(["Journal"]);
    expect(fromSqlite.atlas.document.properties).toEqual({
      status: "active",
      aliases: ["The map"],
    });
    expect(fromSqlite.sessions).toEqual([
      expect.objectContaining({ sessionId: "mcp-1", actor: agent, count: 3, undoneCount: 3 }),
    ]);
    expect(fromSqlite.after).toBe(5);
    expect(fromSqlite.filtered.map((a) => [a.type, a.targetTitle, a.sessionId])).toEqual([
      ["doc.created", "Agent draft", "mcp-1"],
    ]);
    // The trash emptied last: purges keep the titles of what is gone.
    expect(
      fromSqlite.activity.filter((a) => a.type === "doc.purged").map((a) => a.targetTitle),
    ).toEqual(expect.arrayContaining(["Agent draft", "Tmp"]));
  });
});

describe("SQLite specifics", () => {
  it("skips a failing step of a session undo with a savepoint, keeping the others", async () => {
    const { store, runtime } = await openTestStore();
    const session = runtime.as(agent, "*", { sessionId: "s" });
    const a = await session.doc.create({ workspaceId: WS, title: "A" });
    const b = await session.doc.create({ workspaceId: WS, title: "B" });
    await session.doc.move({ id: b.id, parentId: a.id });
    // Make the move's inverse invalid without recording a conflicting change: tamper with the
    // journal so the inverse targets a parent that does not exist.
    await store.db.execute(
      "UPDATE op_history SET inverse = json_set(inverse, '$[0].input.parentId', '01933e6f-2284-b878-270f-04d17c6d9e48') WHERE operation = 'doc.move'",
    );
    const result = await runtime.ops.history.undoSession({ sessionId: "s" });
    expect(result.skipped.map((s) => [s.operation, s.reason])).toEqual([
      ["doc.move", "failed"],
      ["doc.create", "conflict"],
      // A still holds B (whose move could not be undone): trashing A would take B with it.
      ["doc.create", "conflict"],
    ]);
    // The failed move rolled back to its savepoint; nothing else changed.
    expect(result.undoneIds).toHaveLength(0);
    expect((await store.getDoc(b.id))?.document.parentId).toBe(a.id);
    expect((await store.getDoc(a.id))?.document.deletedAt).toBeNull();
    expect((await runtime.ops.trash.list({ workspaceId: WS })).items).toEqual([]);
  });

  it("commits a transaction once and rolls all of it back on failure", async () => {
    const { store, runtime } = await openTestStore("synced");
    await runtime.transaction("Two docs", async (ops) => {
      const a = await ops.doc.create({ workspaceId: WS, title: "A" });
      await ops.doc.create({ workspaceId: WS, title: "A1", parentId: a.id });
    });
    const failed = await runtime
      .transaction("Broken", async (ops) => {
        await ops.doc.create({ workspaceId: WS, title: "Half" });
        throw new Error("boom");
      })
      .catch((e: unknown) => e);
    expect(failed).toBeInstanceOf(Error);
    expect((await store.listTree(WS)).map((e) => e.title)).toEqual(["A", "A1"]);
    expect(await store.oplog.list()).toHaveLength(2);
    const groups = await store.db.getAll<{ g: string }>(
      "SELECT DISTINCT group_id AS g FROM op_history",
    );
    expect(groups).toHaveLength(1);
  });
});
