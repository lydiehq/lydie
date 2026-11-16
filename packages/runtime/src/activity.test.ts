import { describe, expect, it } from "bun:test";

import { isLydieError } from "@lydie/contract";

import {
  ACTIVITY_KEYS_LIMIT,
  ACTIVITY_WINDOW_MS,
  coalesceActivity,
  decodeActivityCursor,
  encodeActivityCursor,
} from "./activity.ts";
import type { ActivityDraft } from "./activity.ts";
import { createGettingStarted } from "./getting-started.ts";
import { createMemoryPorts } from "./memory/index.ts";
import type { Db } from "./ports.ts";
import { createRuntime } from "./runtime.ts";

const WS = "ws1";
const user = { type: "user", id: "u1" } as const;
const other = { type: "user", id: "u2" } as const;
const agent = { type: "agent", id: "a1", app: "claude", onBehalfOf: "u1" } as const;
const bridge = { type: "system", id: "file-bridge" } as const;

function setup() {
  const ports = createMemoryPorts();
  let now = Date.parse("2026-11-12T10:00:00.000Z");
  const runtime = createRuntime({ ...ports, actor: user, clock: { now: () => new Date(now) } });
  const advance = (ms: number) => void (now += ms);
  // Every write is a second apart unless a test moves the clock further.
  const tick = () => advance(1000);
  const rows = () =>
    [...ports.state.activity].sort((a, b) =>
      a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0,
    );
  return { ports, runtime, ops: runtime.ops, advance, tick, rows };
}

describe("coalescing", () => {
  it("makes N body saves by one actor within the window one row with count N", async () => {
    const { ops, tick, rows } = setup();
    const doc = await ops.doc.create({ workspaceId: WS, title: "Note" });
    for (let i = 0; i < 5; i++) {
      tick();
      await ops.doc.updateBody({ id: doc.id, markdown: `v${i}` });
    }
    const saves = rows().filter((r) => r.type === "doc.bodyUpdated");
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({
      count: 5,
      targetId: doc.id,
      targetTitle: "Note",
      actor: user,
      sessionId: null,
      firstAt: "2026-11-12T10:00:01.000Z",
      lastAt: "2026-11-12T10:00:05.000Z",
      data: {},
    });
  });

  it("starts a new row for another actor, session, target or type", async () => {
    const { runtime, ops, tick, rows } = setup();
    const a = await ops.doc.create({ workspaceId: WS, title: "A" });
    const b = await ops.doc.create({ workspaceId: WS, title: "B" });
    const save = async (o: typeof ops, id: string, markdown: string) => {
      tick();
      await o.doc.updateBody({ id, markdown });
    };
    await save(ops, a.id, "1");
    await save(runtime.as(other), a.id, "2");
    await save(runtime.as(agent, "*", { sessionId: "s1" }), a.id, "3");
    await save(runtime.as(agent, "*", { sessionId: "s2" }), a.id, "4");
    await save(ops, b.id, "5");
    tick();
    await ops.doc.rename({ id: a.id, title: "A2" });
    // Same as the first: merges.
    await save(ops, a.id, "6");

    const saves = rows().filter((r) => r.type === "doc.bodyUpdated");
    expect(
      saves.map((r) => [r.targetId === a.id ? "A" : "B", r.actor.id, r.sessionId, r.count]),
    ).toEqual([
      ["A", "u1", null, 2],
      ["B", "u1", null, 1],
      ["A", "a1", "s2", 1],
      ["A", "a1", "s1", 1],
      ["A", "u2", null, 1],
    ]);
    expect(rows().filter((r) => r.type === "doc.renamed")).toHaveLength(1);
    // The merged row has the title at its latest change.
    expect(saves[0]!.targetTitle).toBe("A2");
  });

  it("starts a new row once the window has passed", async () => {
    const { ops, advance, rows } = setup();
    const doc = await ops.doc.create({ workspaceId: WS, title: "Note" });
    await ops.doc.updateBody({ id: doc.id, markdown: "1" });
    advance(ACTIVITY_WINDOW_MS - 1);
    await ops.doc.updateBody({ id: doc.id, markdown: "2" });
    // Measured from the row's last change, not its first.
    advance(ACTIVITY_WINDOW_MS - 1);
    await ops.doc.updateBody({ id: doc.id, markdown: "3" });
    advance(ACTIVITY_WINDOW_MS);
    await ops.doc.updateBody({ id: doc.id, markdown: "4" });
    const saves = rows().filter((r) => r.type === "doc.bodyUpdated");
    expect(saves.map((r) => r.count)).toEqual([1, 3]);
  });

  it("keeps the first previous title and the latest title of a rename chain", async () => {
    const { ops, tick, rows } = setup();
    const doc = await ops.doc.create({ workspaceId: WS, title: "Draft" });
    for (const title of ["Plan", "Plan 2", "Draft"]) {
      tick();
      await ops.doc.rename({ id: doc.id, title });
    }
    const renames = rows().filter((r) => r.type === "doc.renamed");
    expect(renames).toHaveLength(1);
    expect(renames[0]).toMatchObject({
      count: 3,
      targetTitle: "Draft",
      data: { previousTitle: "Draft", title: "Draft" },
    });
  });

  it("keeps the first previous parent and the latest parent of moves", async () => {
    const { ops, tick, rows } = setup();
    const a = await ops.doc.create({ workspaceId: WS, title: "A" });
    const b = await ops.doc.create({ workspaceId: WS, title: "B" });
    const doc = await ops.doc.create({ workspaceId: WS, title: "Doc", parentId: a.id });
    tick();
    await ops.doc.move({ id: doc.id, parentId: b.id });
    tick();
    await ops.doc.move({ id: doc.id, parentId: null });
    const moves = rows().filter((r) => r.type === "doc.moved");
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({
      count: 2,
      data: { previousParentId: a.id, parentId: null },
    });
  });

  it("unions the changed property keys", async () => {
    const { ops, tick, rows } = setup();
    const doc = await ops.doc.create({ workspaceId: WS, title: "Doc", properties: { a: 1 } });
    tick();
    await ops.doc.setProperties({ id: doc.id, set: { a: 2, b: "x" } });
    tick();
    await ops.doc.setProperties({ id: doc.id, set: { c: true }, unset: ["a"] });
    const changes = rows().filter((r) => r.type === "doc.propertiesChanged");
    expect(changes).toHaveLength(1);
    expect(changes[0]!.count).toBe(2);
    expect([...changes[0]!.data.keys!].sort()).toEqual(["a", "b", "c"]);
  });

  it("caps the property keys of one row", () => {
    const draft = (keys: string[], at: string): ActivityDraft => ({
      workspaceId: WS,
      actor: user,
      sessionId: null,
      type: "doc.propertiesChanged",
      targetId: "0193a5e2-7c3b-7000-8000-000000000001",
      targetTitle: "Doc",
      data: { keys },
      at,
    });
    const first = coalesceActivity(
      null,
      draft(
        Array.from({ length: 40 }, (_, i) => `k${i}`),
        "2026-11-12T10:00:00.000Z",
      ),
      () => "0193a5e2-7c3b-7000-8000-000000000002",
    );
    if (first.kind !== "insert") throw new Error("expected an insert");
    const row = first.row;
    const next = coalesceActivity(
      row,
      draft(
        Array.from({ length: 40 }, (_, i) => `n${i}`),
        "2026-11-12T10:01:00.000Z",
      ),
      () => "unused",
    );
    expect(next).toMatchObject({ kind: "update", id: row.id, patch: { count: 2 } });
    if (next.kind !== "update") throw new Error("expected an update");
    const keys = next.patch.data.keys!;
    expect(keys).toHaveLength(ACTIVITY_KEYS_LIMIT);
    expect(keys.slice(0, 2)).toEqual(["k0", "k1"]);
  });
});

describe("what is recorded", () => {
  it("records agent session rows with their session id", async () => {
    const { runtime, rows } = setup();
    const session = runtime.as(agent, "*", { sessionId: "mcp-1" });
    const doc = await session.doc.create({ workspaceId: WS, title: "Agent draft" });
    expect(rows()).toEqual([
      expect.objectContaining({
        type: "doc.created",
        actor: agent,
        sessionId: "mcp-1",
        targetId: doc.id,
        targetTitle: "Agent draft",
        data: { parentId: null },
      }),
    ]);
  });

  it("records each event of a composite operation once", async () => {
    const { ports, ops, rows } = setup();
    const tasks = await ops.database.create({ workspaceId: WS, title: "Tasks" });
    const status = await ops.database.addProperty({
      databaseId: tasks.database.id,
      name: "Status",
      type: "status",
    });
    ports.state.activity.length = 0;
    const before = ports.events.published.length;
    await ops.database.createRow({
      databaseId: tasks.database.id,
      title: "Write",
      values: { [status.id]: "In progress" },
    });
    await ops.inbox.capture({ workspaceId: WS, markdown: "Call Sam" });
    const events = ports.events.published.slice(before);
    expect(events.length).toBeGreaterThan(2);
    // Every event counts once, whether it got its own row or merged into one.
    expect(rows().reduce((n, r) => n + r.count, 0)).toBe(events.length);
    expect(
      rows()
        .filter((r) => r.type === "doc.created")
        .map((r) => r.targetTitle?.toLowerCase()),
    ).toEqual(expect.arrayContaining(["write", "inbox"]));
    const write = rows().find(
      (r) => r.targetTitle === "Write" && r.type === "doc.propertiesChanged",
    );
    expect(write?.count).toBe(1);
    expect(write?.data.keys?.length).toBe(1);
  });

  it("records operations kept off the undo stack, and system actors", async () => {
    const { runtime, ops, tick, rows } = setup();
    const doc = await ops.doc.create({ workspaceId: WS, title: "Note" });
    tick();
    await runtime.execute("doc.updateBody", { id: doc.id, markdown: "x" }, { history: false });
    tick();
    await runtime.as(bridge).doc.rename({ id: doc.id, title: "Renamed on disk" });
    expect(rows().map((r) => [r.type, r.actor.type])).toEqual([
      ["doc.renamed", "system"],
      ["doc.bodyUpdated", "user"],
      ["doc.created", "user"],
    ]);
  });

  it("records nothing for reindexing or for a transaction that fails", async () => {
    const { runtime, ops, rows } = setup();
    const doc = await ops.doc.create({ workspaceId: WS, title: "Note", markdown: "[[A]]" });
    const before = rows().length;
    await runtime.reindexBodies(WS);
    const failed = await runtime
      .transaction("Broken", async (tx) => {
        await tx.doc.rename({ id: doc.id, title: "Half" });
        throw new Error("boom");
      })
      .catch((e: unknown) => e);
    expect(failed).toBeInstanceOf(Error);
    expect(rows()).toHaveLength(before);
  });

  it("writes a transaction's rows together, as writing them one at a time would", async () => {
    const { ports, runtime, rows } = setup();
    const calls = { latest: 0, latestMany: 0, insert: 0, insertMany: 0 };
    const db: Db = {
      read: (fn) => ports.db.read(fn),
      write: (fn) =>
        ports.db.write((tx) => {
          const a = tx.activity!;
          return fn({
            ...tx,
            activity: {
              ...a,
              latest: (key) => (calls.latest++, a.latest(key)),
              latestMany: (keys) => (calls.latestMany++, a.latestMany!(keys)),
              insert: (row) => (calls.insert++, a.insert(row)),
              insertMany: (list) => (calls.insertMany++, a.insertMany!(list)),
            },
          });
        }),
    };
    const counted = createRuntime({ ...ports, db, actor: user });
    const doc = await runtime.ops.doc.create({ workspaceId: WS, title: "Note" });
    await counted.transaction("Edits", async (ops) => {
      await ops.doc.rename({ id: doc.id, title: "Draft" });
      await ops.doc.rename({ id: doc.id, title: "Final" });
      await ops.doc.setProperties({ id: doc.id, set: { status: "done" } });
      await ops.doc.setProperties({ id: doc.id, set: { tags: ["x"] } });
      await ops.doc.create({ workspaceId: WS, title: "Other" });
    });
    expect(calls).toEqual({ latest: 0, latestMany: 1, insert: 0, insertMany: 1 });
    expect(rows().find((r) => r.type === "doc.renamed")).toMatchObject({
      count: 2,
      targetTitle: "Final",
      data: { previousTitle: "Note", title: "Final" },
    });
    expect(rows().find((r) => r.type === "doc.propertiesChanged")).toMatchObject({
      count: 2,
      targetTitle: "Final",
      data: { keys: ["status", "tags"] },
    });
    expect(rows().filter((r) => r.type === "doc.created")).toHaveLength(2);
  });

  it("leaves out the activity of a step whose savepoint rolled back", async () => {
    const ports = createMemoryPorts();
    // A composite that tries one rename in a savepoint (which fails after it) and does another.
    const runtime = createRuntime({
      ...ports,
      actor: user,
      handlers: {
        async "inbox.capture"(ctx, input) {
          const id = input.markdown;
          await ctx.tx.savepoint!(async () => {
            await ctx.exec("doc.rename", { id, title: "Rolled back" });
            throw new Error("undo this step");
          }).catch(() => {});
          await ctx.exec("doc.rename", { id, title: "Kept" });
          return { inboxId: id, documentId: id, created: false };
        },
      },
    });
    const doc = await runtime.ops.doc.create({ workspaceId: WS, title: "Note" });
    await runtime.ops.inbox.capture({ workspaceId: WS, markdown: doc.id });
    const renames = ports.state.activity.filter((r) => r.type === "doc.renamed");
    expect(renames).toHaveLength(1);
    expect(renames[0]).toMatchObject({ count: 1, data: { previousTitle: "Note", title: "Kept" } });
  });

  it("keeps the title of what was purged, and counts the subtree", async () => {
    const { ops, tick, rows } = setup();
    const doc = await ops.doc.create({ workspaceId: WS, title: "Old" });
    await ops.doc.create({ workspaceId: WS, title: "Child", parentId: doc.id });
    tick();
    await ops.doc.delete({ id: doc.id });
    tick();
    await ops.doc.purge({ id: doc.id });
    expect(rows().slice(0, 2)).toEqual([
      expect.objectContaining({ type: "doc.purged", targetTitle: "Old", data: { count: 2 } }),
      expect.objectContaining({ type: "doc.deleted", targetTitle: "Old", data: { count: 2 } }),
    ]);
  });

  it("records nothing without the port, and activity.list says it is not supported", async () => {
    const ports = createMemoryPorts();
    const db: Db = {
      read: (fn) => ports.db.read((tx) => fn({ ...tx, activity: undefined })),
      write: (fn) => ports.db.write((tx) => fn({ ...tx, activity: undefined })),
    };
    const runtime = createRuntime({ ...ports, db, actor: user });
    await runtime.ops.doc.create({ workspaceId: WS, title: "Note" });
    expect(ports.state.activity).toEqual([]);
    const error = await runtime.ops.activity.list({ workspaceId: WS }).catch((e: unknown) => e);
    expect(isLydieError(error) && error.code).toBe("internal");
  });
});

describe("schema rewrites and setup (LYD-410)", () => {
  async function tasksWithRows(n: number) {
    const s = setup();
    const tasks = await s.ops.database.create({ workspaceId: WS, title: "Tasks" });
    const databaseId = tasks.database.id;
    const status = await s.ops.database.addProperty({ databaseId, name: "Status", type: "select" });
    const points = await s.ops.database.addProperty({ databaseId, name: "Points", type: "number" });
    const rowIds: string[] = [];
    for (let i = 0; i < n; i++) {
      const row = await s.ops.database.createRow({
        databaseId,
        title: `Bug ${i}`,
        values: { [status.id]: "Open", [points.id]: i },
      });
      rowIds.push(row.id);
    }
    const open = (await s.ops.database.get({ id: databaseId })).properties
      .find((p) => p.id === status.id)!
      .config.options!.find((o) => o.name === "Open")!;
    s.ports.state.activity.length = 0;
    // Later changes are recorded as new rows, not merged into setup's.
    s.advance(ACTIVITY_WINDOW_MS);
    return { ...s, databaseId, status, points, open, rowIds };
  }

  // Every row of the log is about the database, and there is exactly one.
  function expectOneDatabaseRow(s: Awaited<ReturnType<typeof tasksWithRows>>, published: number) {
    expect(s.rows().map((r) => [r.type, r.targetId, r.targetTitle])).toEqual([
      ["database.changed", s.databaseId, "Tasks"],
    ]);
    // The row events are still published (the file bridge writes frontmatter on them).
    const rowEvents = s.ports.events.published
      .slice(published)
      .filter((e) => e.type === "doc.propertiesChanged");
    expect(rowEvents.length).toBeGreaterThanOrEqual(s.rowIds.length);
  }

  async function roundTrip(
    s: Awaited<ReturnType<typeof tasksWithRows>>,
    change: () => Promise<unknown>,
  ) {
    let published = s.ports.events.published.length;
    await change();
    expectOneDatabaseRow(s, published);
    for (const step of ["undo", "redo"] as const) {
      s.tick();
      published = s.ports.events.published.length;
      expect(await s.runtime.history[step]()).toBe(true);
      expectOneDatabaseRow(s, published);
    }
  }

  it("records an option rename as one row about the database, through undo and redo", async () => {
    const s = await tasksWithRows(5);
    await roundTrip(s, () =>
      s.ops.database.updateOption({ propertyId: s.status.id, optionId: s.open.id, name: "Todo" }),
    );
  });

  it("records an option delete as one row about the database", async () => {
    const s = await tasksWithRows(5);
    await roundTrip(s, () =>
      s.ops.database.deleteOption({ propertyId: s.status.id, optionId: s.open.id }),
    );
  });

  it("records a key change as one row about the database", async () => {
    const s = await tasksWithRows(5);
    await roundTrip(s, () => s.ops.database.updateProperty({ id: s.points.id, key: "estimate" }));
  });

  it("records a type change as one row about the database", async () => {
    const s = await tasksWithRows(5);
    await roundTrip(s, () =>
      s.ops.database.changePropertyType({ id: s.points.id, type: "text", convert: true }),
    );
  });

  it("leaves out the previous row of a limit-one relation reassign", async () => {
    const s = await tasksWithRows(2);
    const projects = await s.ops.database.create({ workspaceId: WS, title: "Projects" });
    const project = await s.ops.database.addProperty({
      databaseId: s.databaseId,
      name: "Project",
      type: "relation",
      reverseName: "Owner",
      config: { relation: { databaseId: projects.database.id, twoWay: true } },
    });
    await s.ops.database.updateProperty({
      id: project.config.relation!.reversePropertyId!,
      config: {
        relation: {
          databaseId: s.databaseId,
          twoWay: true,
          reversePropertyId: project.id,
          limit: "one",
        },
      },
    });
    const atlas = await s.ops.database.createRow({
      databaseId: projects.database.id,
      title: "Atlas",
    });
    const [previous, next] = s.rowIds as [string, string];
    await s.ops.database.setValues({
      databaseId: s.databaseId,
      rowIds: [previous],
      set: { [project.id]: [atlas.id] },
    });
    s.ports.state.activity.length = 0;
    s.advance(ACTIVITY_WINDOW_MS);

    const changedRows = () =>
      s
        .rows()
        .filter((r) => r.type === "doc.propertiesChanged")
        .map((r) => r.targetTitle ?? "")
        .sort();
    await s.ops.database.setValues({
      databaseId: s.databaseId,
      rowIds: [next],
      set: { [project.id]: [atlas.id] },
    });
    // The edited row and the target's reverse side; not Bug 0, which lost Atlas by the rule.
    expect(changedRows()).toEqual(["Atlas", "Bug 1"]);
    for (const step of ["undo", "redo"] as const) {
      s.ports.state.activity.length = 0;
      s.advance(ACTIVITY_WINDOW_MS);
      await s.runtime.history[step]();
      expect(changedRows()).toEqual(["Atlas", "Bug 1"]);
    }
  });

  it("still records a bulk edit of many rows per row", async () => {
    const s = await tasksWithRows(5);
    await s.ops.database.setValues({
      databaseId: s.databaseId,
      rowIds: s.rowIds,
      set: { [s.points.id]: 8 },
    });
    expect(
      s
        .rows()
        .filter((r) => r.type === "doc.propertiesChanged")
        .map((r) => r.targetId ?? "")
        .sort(),
    ).toEqual([...s.rowIds].sort());
    expect(s.rows().every((r) => r.type === "doc.propertiesChanged")).toBe(true);
  });

  it("records nothing for Getting started, run as a transaction or op by op", async () => {
    const { runtime, ops, tick, rows, ports } = setup();
    await runtime.transaction(
      "Getting started",
      (tx) => createGettingStarted(tx, { workspaceId: WS, mode: "browser" }),
      { history: false, activity: false },
    );
    // The core runs it one operation at a time (LYD-313).
    await createGettingStarted(runtime.as(user, "*", { scope: "default", activity: false }), {
      workspaceId: "ws2",
      mode: "hosted",
    });
    expect(ports.events.published.length).toBeGreaterThan(0);
    expect(rows()).toEqual([]);

    tick();
    const doc = await ops.doc.create({ workspaceId: WS, title: "First note" });
    expect(rows().map((r) => [r.type, r.targetId])).toEqual([["doc.created", doc.id]]);
  });
});

describe("activity.list", () => {
  async function seeded() {
    const s = setup();
    const { runtime, ops, tick } = s;
    const ids: string[] = [];
    for (const title of ["Alpha", "Beta", "Gamma", "Delta", "alphabet"]) {
      tick();
      ids.push((await ops.doc.create({ workspaceId: WS, title })).id);
    }
    tick();
    await runtime.as(agent, "*", { sessionId: "s1" }).doc.rename({ id: ids[1]!, title: "Beta 2" });
    tick();
    await ops.doc.create({ workspaceId: "ws2", title: "Elsewhere" });
    return { ...s, ids };
  }

  it("pages newest first with an opaque cursor", async () => {
    const { ops } = await seeded();
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await ops.activity.list({
        workspaceId: WS,
        limit: 2,
        ...(cursor ? { cursor } : {}),
      });
      seen.push(...page.items.map((i) => `${i.type} ${i.targetTitle}`));
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen).toEqual([
      "doc.renamed Beta 2",
      "doc.created alphabet",
      "doc.created Delta",
      "doc.created Gamma",
      "doc.created Beta",
      "doc.created Alpha",
    ]);
  });

  it("filters by actor, type, target, session and title", async () => {
    const { ops, ids } = await seeded();
    const titles = async (input: Omit<Parameters<typeof ops.activity.list>[0], "workspaceId">) =>
      (await ops.activity.list({ workspaceId: WS, ...input })).items.map((i) => i.targetTitle);
    expect(await titles({ actors: ["agent:claude:a1:u1"] })).toEqual(["Beta 2"]);
    expect(await titles({ actors: ["u1"], types: ["doc.renamed"] })).toEqual([]);
    expect(await titles({ types: ["doc.renamed"] })).toEqual(["Beta 2"]);
    expect(await titles({ targetId: ids[1]! })).toEqual(["Beta 2", "Beta"]);
    expect(await titles({ sessionId: "s1" })).toEqual(["Beta 2"]);
    expect(await titles({ search: "ALPHA" })).toEqual(["alphabet", "Alpha"]);
  });

  it("rejects a cursor it did not make", async () => {
    const { ops } = await seeded();
    const error = await ops.activity
      .list({ workspaceId: WS, cursor: "not a cursor" })
      .catch((e: unknown) => e);
    expect(isLydieError(error) && error.code).toBe("invalid_input");
    const row = { lastAt: "2026-11-12T10:00:00.000Z", id: "x" };
    expect(decodeActivityCursor(encodeActivityCursor(row))).toEqual(row);
  });
});
