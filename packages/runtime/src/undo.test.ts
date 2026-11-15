import { describe, expect, it } from "bun:test";

import { LydieError, operations, ViewConfig } from "@lydie/contract";

import { touchesOf, touchesOverlap } from "./history.ts";
import { createMemoryPorts } from "./memory/index.ts";
import type { MemoryState } from "./memory/index.ts";
import { createRuntime } from "./runtime.ts";
import type { Runtime } from "./runtime.ts";

const WS = "ws1";
const user = { type: "user", id: "u1" } as const;
const agent = { type: "agent", id: "a1", app: "claude", onBehalfOf: "u1" } as const;

function setup() {
  const ports = createMemoryPorts();
  let tick = Date.parse("2026-11-12T10:00:00.000Z");
  const runtime = createRuntime({
    ...ports,
    actor: user,
    clock: { now: () => new Date((tick += 1000)) },
  });
  return { ports, runtime, ops: runtime.ops };
}

// What users can see: live rows. Undoing a create moves the row to the trash (so redo can restore
// it), so trashed rows count as gone. Timestamps, authorship and link ids legitimately change.
function visible(state: MemoryState) {
  const live = (id: string | null) => (id ? state.docs.get(id)?.deletedAt === null : false);
  const docs = [...state.docs.values()]
    .filter((d) => d.deletedAt === null)
    .map((d) => ({
      id: d.id,
      parentId: d.parentId,
      title: d.title,
      sortKey: d.sortKey,
      properties: d.properties,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const bodies = Object.fromEntries(
    [...state.bodies.entries()]
      .filter(([id, b]) => live(id) && b.markdown !== "")
      .map(([id, b]) => [id, b.markdown]),
  );
  const links = [...state.links.values()]
    .filter((l) => live(l.sourceId))
    .map(({ id: _id, ...l }) => ({ ...l, targetId: live(l.targetId) ? l.targetId : null }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const attachments = [...state.attachments.values()]
    .filter((a) => a.deletedAt === null)
    .map((a) => a.id)
    .sort();
  const threads = [...state.threads.values()]
    .filter((t) => t.deletedAt === null)
    .map((t) => ({
      id: t.id,
      parentId: t.parentId,
      body: t.body,
      anchor: t.anchor,
      resolved: t.resolvedAt !== null,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const blocks = Object.fromEntries([...state.blocks.entries()].filter(([id]) => live(id)));
  const bySort = <T extends { sortKey: string; id: string }>(a: T, b: T) =>
    a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : a.id < b.id ? -1 : 1;
  const databases = [...state.databases.values()]
    .filter((d) => d.deletedAt === null && live(d.id))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((d) => ({
      id: d.id,
      config: d.config,
      properties: [...state.properties.values()]
        .filter((p) => p.databaseId === d.id && p.deletedAt === null)
        .sort(bySort)
        .map(({ id, name, type, key, config }) => ({ id, name, type, key, config })),
      views: [...state.views.values()]
        .filter((v) => v.databaseId === d.id && v.deletedAt === null)
        .sort(bySort)
        .map(({ id, name, type, config }) => ({ id, name, type, config })),
    }));
  return { docs, bodies, links, attachments, threads, blocks, databases };
}

// A tasks database related (two-way) to a projects database, with rows.
async function tasksDb({ ops }: Ctx) {
  const projects = await ops.database.create({ workspaceId: WS, title: "Projects" });
  const tasks = await ops.database.create({ workspaceId: WS, title: "Tasks", viewType: "board" });
  const db = tasks.database.id;
  const status = await ops.database.addProperty({
    databaseId: db,
    name: "Status",
    type: "status",
  });
  const tags = await ops.database.addProperty({
    databaseId: db,
    name: "Tags",
    type: "multiSelect",
    config: {
      options: [
        { name: "red", color: "red" },
        { name: "blue", color: "blue" },
      ],
    },
  });
  const estimate = await ops.database.addProperty({
    databaseId: db,
    name: "Estimate",
    type: "number",
  });
  const due = await ops.database.addProperty({ databaseId: db, name: "Due", type: "date" });
  const project = await ops.database.addProperty({
    databaseId: db,
    name: "Project",
    type: "relation",
    config: { relation: { databaseId: projects.database.id, twoWay: true } },
  });
  const atlas = await ops.database.createRow({ databaseId: projects.database.id, title: "Atlas" });
  const boreal = await ops.database.createRow({
    databaseId: projects.database.id,
    title: "Boreal",
  });
  const a = await ops.database.createRow({
    databaseId: db,
    title: "Write",
    values: {
      [status.id]: "In progress",
      [tags.id]: ["red"],
      [estimate.id]: 3,
      [project.id]: [atlas.id],
    },
  });
  const b = await ops.database.createRow({
    databaseId: db,
    title: "Review",
    values: { [status.id]: "Done", [tags.id]: ["red", "blue"], [due.id]: "2026-02-01" },
  });
  const view = tasks.views[0]!;
  return { projects, db, view, status, tags, estimate, due, project, atlas, boreal, a, b };
}

const databaseScenarios: Record<string, Scenario> = {
  "database.writeRows": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      return () =>
        ctx.ops.database.writeRows({
          databaseId: t.db,
          rows: [
            { title: "New", values: { Estimate: 5, tags: ["blue"] } },
            { id: t.a.id, title: "Write more", values: { estimate: 8 }, unset: ["Tags"] },
            { id: t.b.id, delete: true },
          ],
        });
    },
  },
  "database.changeSchema": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      return () =>
        ctx.ops.database.changeSchema({
          databaseId: t.db,
          add: [{ name: "Owner", type: "text" }],
          update: [
            { property: "Estimate", name: "Points" },
            { property: "Due", type: "text" },
          ],
          remove: ["Tags"],
        });
    },
  },
  "database.changeViews": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      return () =>
        ctx.ops.database.changeViews({
          databaseId: t.db,
          add: [{ name: "All", type: "table" }],
          update: [{ view: t.view.name, name: "Kanban", config: { limit: 10 } }],
        });
    },
  },
  "database.create": {
    async arrange({ ops }) {
      const page = await ops.doc.create({ workspaceId: WS, title: "Page" });
      await ops.doc.create({ workspaceId: WS, title: "Child", parentId: page.id });
      return () => ops.database.create({ workspaceId: WS, documentId: page.id });
    },
  },
  "database.update": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      return () =>
        ctx.ops.database.update({
          id: t.db,
          filter: { type: "condition", propertyId: t.estimate.id, op: "gt", value: 1 },
          templateIds: [t.a.id],
        });
    },
  },
  "database.delete": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      return () => ctx.ops.database.delete({ id: t.db });
    },
  },
  "database.restore": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      await ctx.ops.database.delete({ id: t.db });
      return () => ctx.ops.database.restore({ id: t.db });
    },
  },
  "database.setDefinition": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      const def = await ctx.ops.database.get({ id: t.db });
      return () =>
        ctx.ops.database.setDefinition({
          id: t.db,
          definition: {
            config: def.database.config,
            properties: [
              ...def.properties
                .filter((p) => p.id !== t.tags.id)
                .map(({ id, name, type, key, config }) => ({
                  id,
                  name: name.toUpperCase(),
                  type,
                  key,
                  config,
                }))
                .reverse(),
              {
                id: "01934000-0000-0000-0000-0000000055dc",
                name: "Notes",
                type: "text",
                key: "notes",
                config: {},
              },
            ],
            views: [
              {
                id: "01934000-0000-0000-0000-0000000dc9dc",
                name: "All",
                type: "table",
                config: ViewConfig.parse({}),
              },
              ...def.views.map(({ id, name, type, config }) => ({ id, name, type, config })),
            ],
          },
        });
    },
  },
  "database.addProperty": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      return () =>
        ctx.ops.database.addProperty({
          databaseId: t.db,
          name: "Blocked by",
          type: "relation",
          config: { relation: { databaseId: t.db, twoWay: true } },
          afterId: t.status.id,
        });
    },
  },
  "database.renameProperty": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      return () => ctx.ops.database.renameProperty({ id: t.status.id, name: "State" });
    },
  },
  "database.updateProperty": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      return () =>
        ctx.ops.database.updateProperty({
          id: t.estimate.id,
          key: "hours",
          config: { numberFormat: "integer" },
        });
    },
  },
  "database.changePropertyType": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      return () => ctx.ops.database.changePropertyType({ id: t.tags.id, type: "text" });
    },
  },
  "database.moveProperty": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      return () => ctx.ops.database.moveProperty({ id: t.due.id, beforeId: t.status.id });
    },
  },
  "database.deleteProperty": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      return () => ctx.ops.database.deleteProperty({ id: t.project.id });
    },
  },
  "database.restoreProperty": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      await ctx.ops.database.deleteProperty({ id: t.due.id });
      return () => ctx.ops.database.restoreProperty({ id: t.due.id });
    },
  },
  "database.addOption": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      return () =>
        ctx.ops.database.addOption({
          propertyId: t.tags.id,
          option: { name: "green", color: "green" },
          index: 0,
        });
    },
  },
  "database.updateOption": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      const red = t.tags.config.options!.find((o) => o.name === "red")!;
      return () =>
        ctx.ops.database.updateOption({
          propertyId: t.tags.id,
          optionId: red.id,
          name: "crimson",
          color: "pink",
        });
    },
  },
  "database.moveOption": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      const blue = t.tags.config.options!.find((o) => o.name === "blue")!;
      return () =>
        ctx.ops.database.moveOption({ propertyId: t.tags.id, optionId: blue.id, index: 0 });
    },
  },
  "database.deleteOption": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      const red = t.tags.config.options!.find((o) => o.name === "red")!;
      return () => ctx.ops.database.deleteOption({ propertyId: t.tags.id, optionId: red.id });
    },
  },
  "database.createView": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      return () =>
        ctx.ops.database.createView({
          databaseId: t.db,
          name: "Calendar",
          type: "calendar",
          beforeId: t.view.id,
        });
    },
  },
  "database.renameView": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      return () => ctx.ops.database.renameView({ id: t.view.id, name: "Kanban" });
    },
  },
  "database.duplicateView": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      return () => ctx.ops.database.duplicateView({ id: t.view.id });
    },
  },
  "database.moveView": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      await ctx.ops.database.createView({ databaseId: t.db, name: "List", type: "list" });
      return () => ctx.ops.database.moveView({ id: t.view.id, sortKey: "zz" });
    },
  },
  "database.updateView": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      return () =>
        ctx.ops.database.updateView({
          id: t.view.id,
          type: "table",
          config: { sorts: [{ propertyId: t.due.id, direction: "desc" }], groupBy: null },
        });
    },
  },
  "database.deleteView": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      await ctx.ops.database.createView({ databaseId: t.db, name: "List", type: "list" });
      return () => ctx.ops.database.deleteView({ id: t.view.id });
    },
  },
  "database.restoreView": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      await ctx.ops.database.createView({ databaseId: t.db, name: "List", type: "list" });
      await ctx.ops.database.deleteView({ id: t.view.id });
      return () => ctx.ops.database.restoreView({ id: t.view.id });
    },
  },
  "database.createRow": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      return () =>
        ctx.ops.database.createRow({
          databaseId: t.db,
          title: "New",
          viewId: t.view.id,
          group: "Blocked",
          templateId: t.b.id,
          values: { [t.project.id]: [t.boreal.id] },
        });
    },
  },
  "database.setValues": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      return () =>
        ctx.ops.database.setValues({
          databaseId: t.db,
          rowIds: [t.a.id, t.b.id],
          set: { [t.project.id]: [t.boreal.id], [t.tags.id]: ["green"] },
          unset: [t.estimate.id],
        });
    },
  },
  "database.moveRow": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      return () =>
        ctx.ops.database.moveRow({
          rowId: t.b.id,
          viewId: t.view.id,
          beforeId: t.a.id,
          group: "Not started",
        });
    },
  },
  "database.duplicateRows": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      return () => ctx.ops.database.duplicateRows({ databaseId: t.db, rowIds: [t.a.id, t.b.id] });
    },
  },
  "database.deleteRows": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      return () => ctx.ops.database.deleteRows({ databaseId: t.db, rowIds: [t.a.id, t.b.id] });
    },
  },
  "database.restoreRows": {
    async arrange(ctx) {
      const t = await tasksDb(ctx);
      await ctx.ops.database.deleteRows({ databaseId: t.db, rowIds: [t.a.id] });
      return () => ctx.ops.database.restoreRows({ databaseId: t.db, rowIds: [t.a.id] });
    },
  },
};

type Ctx = ReturnType<typeof setup>;

async function noteOn({ ops }: Ctx) {
  const doc = await ops.doc.create({ workspaceId: WS, title: "A", markdown: "One two three" });
  return ops.thread.create({ documentId: doc.id, body: "Why two", quote: "two" });
}

type Scenario = { arrange(ctx: Ctx): Promise<() => Promise<unknown>> };

// One scenario per undoable operation: arrange the state, return the action. The test checks that
// undo restores the state before the action exactly and redo restores the state after it.
const scenarios: Record<string, Scenario> = {
  "doc.create": {
    async arrange({ ops }) {
      const parent = await ops.doc.create({ workspaceId: WS, title: "Parent" });
      await ops.doc.create({ workspaceId: WS, title: "Linker", markdown: "[[New]]" });
      return () =>
        ops.doc.create({
          workspaceId: WS,
          title: "New",
          parentId: parent.id,
          markdown: "[[Parent]]",
        });
    },
  },
  "doc.rename": {
    async arrange({ ops }) {
      const a = await ops.doc.create({ workspaceId: WS, title: "A" });
      return () => ops.doc.rename({ id: a.id, title: "B" });
    },
  },
  "doc.move": {
    async arrange({ ops }) {
      const a = await ops.doc.create({ workspaceId: WS, title: "A" });
      const b = await ops.doc.create({ workspaceId: WS, title: "B" });
      await ops.doc.create({ workspaceId: WS, title: "C" });
      return () => ops.doc.move({ id: b.id, parentId: a.id });
    },
  },
  "doc.delete": {
    async arrange({ ops }) {
      const a = await ops.doc.create({ workspaceId: WS, title: "A" });
      const a1 = await ops.doc.create({ workspaceId: WS, title: "A1", parentId: a.id });
      const a2 = await ops.doc.create({ workspaceId: WS, title: "A2", parentId: a.id });
      await ops.doc.create({ workspaceId: WS, title: "A11", parentId: a1.id });
      await ops.doc.delete({ id: a2.id });
      return () => ops.doc.delete({ id: a.id });
    },
  },
  "doc.restore": {
    async arrange({ ops }) {
      const a = await ops.doc.create({ workspaceId: WS, title: "A" });
      await ops.doc.create({ workspaceId: WS, title: "A1", parentId: a.id });
      await ops.doc.delete({ id: a.id });
      return () => ops.doc.restore({ id: a.id });
    },
  },
  "doc.setProperties": {
    async arrange({ ops }) {
      const a = await ops.doc.create({
        workspaceId: WS,
        title: "A",
        properties: { status: "todo", tags: ["x"], keep: 1 },
      });
      return () =>
        ops.doc.setProperties({ id: a.id, set: { status: "done", rating: 5 }, unset: ["tags"] });
    },
  },
  "doc.updateBody": {
    async arrange({ ops }) {
      await ops.doc.create({ workspaceId: WS, title: "Target" });
      const a = await ops.doc.create({ workspaceId: WS, title: "A", markdown: "one [[Missing]]" });
      return () => ops.doc.updateBody({ id: a.id, markdown: "two [[Target]] ^b1" });
    },
  },
  "doc.restoreVersion": {
    async arrange({ ops, runtime }) {
      const a = await ops.doc.create({ workspaceId: WS, title: "A", markdown: "one [[Missing]]" });
      const agent = { type: "agent", app: "test", id: "a1", onBehalfOf: "u1" } as const;
      await runtime.as(agent).doc.updateBody({ id: a.id, markdown: "two ^b1" });
      const { versions } = await ops.doc.listVersions({ id: a.id });
      return () => ops.doc.restoreVersion({ id: a.id, versionId: versions.at(-1)!.id });
    },
  },
  "attachment.create": {
    async arrange({ ops }) {
      const doc = await ops.doc.create({ workspaceId: WS, title: "A" });
      return () =>
        ops.attachment.create({
          workspaceId: WS,
          documentId: doc.id,
          filename: "a.png",
          contentType: "image/png",
          size: 3,
          sha256: "a".repeat(64),
        });
    },
  },
  "attachment.delete": {
    async arrange({ ops }) {
      const a = await ops.attachment.create({
        workspaceId: WS,
        filename: "a.png",
        contentType: "image/png",
        size: 3,
        sha256: "a".repeat(64),
      });
      return () => ops.attachment.delete({ id: a.id });
    },
  },
  "attachment.restore": {
    async arrange({ ops }) {
      const a = await ops.attachment.create({
        workspaceId: WS,
        filename: "a.png",
        contentType: "image/png",
        size: 3,
        sha256: "a".repeat(64),
      });
      await ops.attachment.delete({ id: a.id });
      return () => ops.attachment.restore({ id: a.id });
    },
  },
  "thread.create": {
    async arrange({ ops }) {
      const doc = await ops.doc.create({ workspaceId: WS, title: "A", markdown: "One two three" });
      return () => ops.thread.create({ documentId: doc.id, body: "Why two", quote: "two" });
    },
  },
  "thread.reply": {
    async arrange(ctx) {
      const t = await noteOn(ctx);
      return () => ctx.ops.thread.reply({ threadId: t.id, body: "Because" });
    },
  },
  "thread.edit": {
    async arrange(ctx) {
      const t = await noteOn(ctx);
      return () => ctx.ops.thread.edit({ id: t.id, body: "Why two, really" });
    },
  },
  "thread.setAnchor": {
    async arrange(ctx) {
      const t = await noteOn(ctx);
      return () => ctx.ops.thread.setAnchor({ id: t.id, anchor: { quote: "three" } });
    },
  },
  "thread.resolve": {
    async arrange(ctx) {
      const t = await noteOn(ctx);
      return () => ctx.ops.thread.resolve({ id: t.id });
    },
  },
  "thread.delete": {
    async arrange(ctx) {
      const t = await noteOn(ctx);
      return () => ctx.ops.thread.delete({ id: t.id });
    },
  },
  "thread.restore": {
    async arrange(ctx) {
      const t = await noteOn(ctx);
      await ctx.ops.thread.delete({ id: t.id });
      return () => ctx.ops.thread.restore({ id: t.id });
    },
  },
  "history.undoSession": {
    async arrange({ runtime }) {
      const session = runtime.as(agent, "*", { sessionId: "s1" });
      const a = await session.doc.create({ workspaceId: WS, title: "Agent doc", markdown: "x" });
      await session.doc.rename({ id: a.id, title: "Agent doc 2" });
      return () => runtime.ops.history.undoSession({ sessionId: "s1" });
    },
  },
  "inbox.capture": {
    async arrange({ ops }) {
      await ops.doc.create({ workspaceId: WS, title: "Inbox", markdown: "- 09:00 first\n" });
      return () => ops.inbox.capture({ workspaceId: WS, markdown: "second", time: "09:05" });
    },
  },
};

Object.assign(scenarios, databaseScenarios);

describe("undo", () => {
  const undoable = Object.values(operations).filter((op) => op.undo === "inverse");

  it("has a round-trip scenario for every undoable operation", () => {
    expect(Object.keys(scenarios).sort()).toEqual(undoable.map((op) => op.id).sort());
  });

  it.each(undoable.map((op) => op.id))(
    "%s: undo restores the state, redo reapplies it",
    async (id) => {
      const ctx = setup();
      const act = await scenarios[id]!.arrange(ctx);
      ctx.runtime.history.clear();
      const before = visible(ctx.ports.state);
      await act();
      const after = visible(ctx.ports.state);
      expect(after).not.toEqual(before);
      expect(await ctx.runtime.history.undo()).toBe(true);
      expect(visible(ctx.ports.state)).toEqual(before);
      expect(await ctx.runtime.history.redo()).toBe(true);
      expect(visible(ctx.ports.state)).toEqual(after);
      expect(await ctx.runtime.history.undo()).toBe(true);
      expect(visible(ctx.ports.state)).toEqual(before);
    },
  );

  it("runs undo as ordinary logged operations and reports state", async () => {
    const { runtime, ports, ops } = setup();
    const states: boolean[] = [];
    runtime.history.subscribe(() => states.push(runtime.history.canUndo()));
    const doc = await ops.doc.create({ workspaceId: WS, title: "A" });
    await ops.doc.rename({ id: doc.id, title: "B" });
    expect(runtime.history.state()).toMatchObject({
      canUndo: true,
      undoLabel: "Rename a document",
    });
    await runtime.history.undo();
    expect(ports.state.oplog.map((e) => e.operation)).toEqual([
      "doc.create",
      "doc.rename",
      "doc.rename",
    ]);
    expect(ports.state.oplog[2]?.input).toMatchObject({ title: "A" });
    expect(ports.state.history.find((e) => e.operation === "doc.rename")?.undoneAt).not.toBeNull();
    expect(runtime.history.state()).toMatchObject({
      canRedo: true,
      redoLabel: "Rename a document",
    });
    // A new change clears redo.
    await ops.doc.rename({ id: doc.id, title: "C" });
    expect(runtime.history.canRedo()).toBe(false);
    expect(states.length).toBeGreaterThan(2);
    expect(await runtime.history.undo("nothing-here")).toBe(false);
  });

  it("keeps one stack per scope and skips history when asked", async () => {
    const { runtime } = setup();
    const a = await runtime.execute(
      "doc.create",
      { workspaceId: WS, title: "A" },
      { scope: "tab1" },
    );
    await runtime.execute("doc.rename", { id: a.id, title: "B" }, { scope: "tab2" });
    await runtime.execute("doc.updateBody", { id: a.id, markdown: "typed" }, { history: false });
    expect(runtime.history.canUndo("default")).toBe(false);
    await runtime.history.undo("tab2");
    expect((await runtime.ops.doc.get({ id: a.id })).document.title).toBe("A");
    expect(runtime.history.canUndo("tab1")).toBe(true);
  });

  it("groups a transaction into one step and one database transaction", async () => {
    const { runtime, ports } = setup();
    const created = await runtime.transaction("New project", async (ops) => {
      const root = await ops.doc.create({ workspaceId: WS, title: "Project" });
      const child = await ops.doc.create({ workspaceId: WS, title: "Notes", parentId: root.id });
      await ops.doc.setProperties({ id: child.id, set: { status: "open" } });
      // Reads inside the transaction see its own writes.
      expect((await ops.doc.listTree({ workspaceId: WS })).entries).toHaveLength(2);
      return root;
    });
    expect(runtime.history.state().undoLabel).toBe("New project");
    const groups = new Set(ports.state.history.map((e) => e.groupId));
    expect(groups.size).toBe(1);
    await runtime.history.undo();
    expect((await runtime.ops.doc.listTree({ workspaceId: WS })).entries).toEqual([]);
    await runtime.history.redo();
    expect((await runtime.ops.doc.get({ id: created.id })).document.deletedAt).toBeNull();

    // A failing transaction leaves nothing behind.
    const failed = await runtime
      .transaction("Broken", async (ops) => {
        await ops.doc.create({ workspaceId: WS, title: "Half" });
        throw new Error("boom");
      })
      .catch((e: unknown) => e);
    expect(failed).toBeInstanceOf(Error);
    expect([...ports.state.docs.values()].some((d) => d.title === "Half")).toBe(false);
  });

  it("coalesces steps with the same key", async () => {
    const { runtime } = setup();
    const a = await runtime.ops.doc.create({ workspaceId: WS, title: "T" });
    for (const title of ["Ti", "Tit", "Titl", "Title"]) {
      await runtime.execute("doc.rename", { id: a.id, title }, { coalesce: `title:${a.id}` });
    }
    await runtime.history.undo();
    expect((await runtime.ops.doc.get({ id: a.id })).document.title).toBe("T");
  });

  it("drops a step whose inverse no longer applies", async () => {
    const { runtime, ops } = setup();
    const a = await ops.doc.create({ workspaceId: WS, title: "A" });
    await ops.doc.rename({ id: a.id, title: "B" });
    await runtime.execute("doc.delete", { id: a.id }, { history: false });
    await runtime.execute("doc.purge", { id: a.id }, { history: false });
    const error = await runtime.history.undo().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LydieError);
    expect((error as LydieError).code).toBe("conflict");
    expect(runtime.history.canUndo()).toBe(true);
  });

  it("undoes a type change of a relation whose target database is gone", async () => {
    const { runtime, ops } = setup();
    const target = await ops.database.create({ workspaceId: WS, title: "Tasks" });
    const projects = await ops.database.create({ workspaceId: WS, title: "Projects" });
    const relation = await ops.database.addProperty({
      databaseId: projects.database.id,
      name: "Tasks",
      type: "relation",
      config: { relation: { databaseId: target.database.id } },
    });
    const row = await ops.database.createRow({
      databaseId: projects.database.id,
      title: "Fernweh",
    });
    // An unresolved link kept as written, as the file bridge stores it.
    await ops.doc.setProperties({
      id: row.id,
      set: { [relation.key]: ["[[Tasks/Write test script]]"] },
    });
    await runtime.execute("database.delete", { id: target.database.id }, { history: false });
    runtime.history.clear();
    await ops.database.changePropertyType({ id: relation.id, type: "status" });
    expect(await runtime.history.undo()).toBe(true);
    const def = await ops.database.get({ id: projects.database.id });
    const back = def.properties.find((p) => p.id === relation.id)!;
    expect(back.type).toBe("relation");
    expect(back.config).toEqual(relation.config);
    const doc = await ops.doc.get({ id: row.id });
    expect(doc.document.properties[relation.key]).toEqual(["[[Tasks/Write test script]]"]);
    // Redo puts the status back.
    expect(await runtime.history.redo()).toBe(true);
    const again = (await ops.database.get({ id: projects.database.id })).properties;
    expect(again.find((p) => p.id === relation.id)!.type).toBe("status");
  });

  it("does not record purges, which cannot be undone", async () => {
    const { runtime, ops } = setup();
    const a = await ops.doc.create({ workspaceId: WS, title: "A" });
    await ops.doc.delete({ id: a.id });
    runtime.history.clear();
    await ops.doc.purge({ id: a.id });
    expect(runtime.history.canUndo()).toBe(false);
  });

  it("keeps an agent's changes off the user's stack", async () => {
    const { runtime } = setup();
    await runtime.as(agent).doc.create({ workspaceId: WS, title: "From agent" });
    expect(runtime.history.canUndo()).toBe(false);
    expect(runtime.history.canUndo("actor:agent:claude:a1:u1")).toBe(true);
  });
});

describe("touches", () => {
  it("name entity aspects and detect overlaps", () => {
    expect(
      touchesOf("doc.rename", {}, [{ op: "doc.rename", input: { id: "x", title: "a" } }]),
    ).toEqual(["x|title"]);
    expect(
      touchesOf("doc.setProperties", {}, [
        { op: "doc.setProperties", input: { id: "x", set: { a: 1 }, unset: ["b"] } },
      ]),
    ).toEqual(["x|properties.a", "x|properties.b"]);
    expect(touchesOf("doc.purge", { id: "x" }, null)).toEqual(["x|*"]);
    expect(touchesOverlap(["x|title"], ["x|body"])).toBe(false);
    expect(touchesOverlap(["x|title"], ["x|*"])).toBe(true);
    expect(touchesOverlap(["x|title"], ["y|title"])).toBe(false);
  });
});

describe("sessions and authorship", () => {
  async function agentSession(runtime: Runtime) {
    const session = runtime.as(agent, "*", { sessionId: "mcp-1" });
    const a = await session.doc.create({ workspaceId: WS, title: "Draft", markdown: "v1" });
    await session.doc.updateBody({ id: a.id, markdown: "v2" });
    await session.doc.setProperties({ id: a.id, set: { status: "draft" } });
    return a;
  }

  it("records the actor and session on entities, log entries and events", async () => {
    const { runtime, ports } = setup();
    const a = await agentSession(runtime);
    expect(a.createdBy).toBe("agent:claude:a1:u1");
    await runtime.ops.doc.rename({ id: a.id, title: "Mine" });
    const doc = (await runtime.ops.doc.get({ id: a.id })).document;
    expect(doc).toMatchObject({ createdBy: "agent:claude:a1:u1", updatedBy: "u1" });
    expect(ports.state.oplog[0]).toMatchObject({ actor: agent, sessionId: "mcp-1" });
    expect(ports.events.published[0]).toMatchObject({ sessionId: "mcp-1" });

    const { sessions } = await runtime.ops.history.listSessions({ workspaceId: WS });
    expect(sessions).toEqual([
      expect.objectContaining({ sessionId: "mcp-1", actor: agent, count: 3, undoneCount: 0 }),
    ]);
    const { entries } = await runtime.ops.history.listBySession({ sessionId: "mcp-1" });
    expect(entries.map((e) => e.operation)).toEqual([
      "doc.create",
      "doc.updateBody",
      "doc.setProperties",
    ]);
  });

  it("undoes a whole session, newest first, as one user step", async () => {
    const { runtime } = setup();
    const keep = await runtime.ops.doc.create({ workspaceId: WS, title: "Mine" });
    const a = await agentSession(runtime);
    const result = await runtime.ops.history.undoSession({ sessionId: "mcp-1" });
    expect(result.skipped).toEqual([]);
    expect(result.undoneIds).toHaveLength(3);
    expect((await runtime.ops.doc.get({ id: a.id })).document.deletedAt).not.toBeNull();
    expect((await runtime.ops.doc.get({ id: keep.id })).document.deletedAt).toBeNull();
    // Running it again finds nothing left to undo.
    expect((await runtime.ops.history.undoSession({ sessionId: "mcp-1" })).undoneIds).toEqual([]);
    // The user can take the session undo back with Cmd+Z.
    await runtime.history.undo();
    const doc = await runtime.ops.doc.get({ id: a.id });
    expect(doc.document).toMatchObject({ deletedAt: null, properties: { status: "draft" } });
    expect(doc.body?.markdown).toBe("v2");
  });

  it("skips changes that someone else edited later, and what depends on them", async () => {
    const { runtime } = setup();
    const a = await agentSession(runtime);
    // The user edits the body after the agent; the agent's property change is independent.
    await runtime.ops.doc.updateBody({ id: a.id, markdown: "user text" });
    const result = await runtime.ops.history.undoSession({ sessionId: "mcp-1" });
    expect(result.skipped.map((s) => [s.operation, s.reason])).toEqual([
      ["doc.updateBody", "conflict"],
      // Undoing the create would delete the document the user just edited.
      ["doc.create", "conflict"],
    ]);
    expect(result.undoneIds).toHaveLength(1);
    const doc = await runtime.ops.doc.get({ id: a.id });
    expect(doc.body?.markdown).toBe("user text");
    expect(doc.document.properties).toEqual({});
    expect(doc.document.deletedAt).toBeNull();
  });

  it("keeps a created document that someone else added a child to (LYD-171)", async () => {
    const { runtime } = setup();
    const session = runtime.as(agent, "*", { sessionId: "s-tree" });
    const parent = await session.doc.create({ workspaceId: WS, title: "Agent parent" });
    const child = await runtime.ops.doc.create({
      workspaceId: WS,
      title: "User child",
      parentId: parent.id,
    });
    const result = await runtime.ops.history.undoSession({ sessionId: "s-tree" });
    expect(result.skipped.map((s) => [s.operation, s.reason])).toEqual([
      ["doc.create", "conflict"],
    ]);
    expect((await runtime.ops.doc.get({ id: child.id })).document.deletedAt).toBeNull();
    expect((await runtime.ops.doc.get({ id: parent.id })).document.deletedAt).toBeNull();

    // Its own children do not block it.
    const own = runtime.as(agent, "*", { sessionId: "s-own" });
    const p2 = await own.doc.create({ workspaceId: WS, title: "P2" });
    await own.doc.create({ workspaceId: WS, title: "C2", parentId: p2.id });
    expect((await runtime.ops.history.undoSession({ sessionId: "s-own" })).skipped).toEqual([]);
    expect((await runtime.ops.doc.get({ id: p2.id })).document.deletedAt).not.toBeNull();
  });

  it("reports changes that cannot be undone", async () => {
    const { runtime } = setup();
    const session = runtime.as(agent, "*", { sessionId: "s" });
    const a = await session.doc.create({ workspaceId: WS, title: "Tmp" });
    await session.doc.delete({ id: a.id });
    await session.doc.purge({ id: a.id });
    const result = await runtime.ops.history.undoSession({ sessionId: "s" });
    expect(result.skipped.map((s) => s.reason)).toEqual(["not_undoable", "conflict", "conflict"]);
  });
});
