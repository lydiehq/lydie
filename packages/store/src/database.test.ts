import { afterEach, describe, expect, it } from "bun:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  FilterNode,
  GroupBy,
  PropertyValue,
  ViewConfigInput,
  ViewWindowInput,
} from "@lydie/contract";
import { createRuntime } from "@lydie/runtime";
import type { Runtime } from "@lydie/runtime";
import { createMemoryPorts } from "@lydie/runtime/memory";

import { openNodeStore } from "./node.ts";
import { queries } from "./queries.ts";
import type { Store } from "./store.ts";
import { closeTestStores, nextLive, openTestStore } from "./test-utils.ts";

afterEach(closeTestStores);

const WS = "ws1";
const ME = "u1";
const TODAY = "2026-03-01";

function deterministic() {
  let tick = Date.parse("2026-02-20T10:00:00.000Z");
  let n = 0;
  const uuid = () => `0193a5e2-7c3b-7000-8000-${String(n++).padStart(12, "0")}`;
  return { clock: { now: () => new Date((tick += 3_600_000)) }, ids: { uuid } };
}

// A tasks database with every stored type, a related projects database, messy hand-edited values
// and a trashed row. Returns the property ids.
async function scenario(runtime: Runtime) {
  const { ops } = runtime;
  const projects = await ops.database.create({ workspaceId: WS, title: "Projects" });
  const tasks = await ops.database.create({ workspaceId: WS, title: "Tasks" });
  const db = tasks.database.id;
  const add = (
    name: string,
    type: Parameters<typeof ops.database.addProperty>[0]["type"],
    config = {},
  ) => ops.database.addProperty({ databaseId: db, name, type, config });
  const P = {
    title: tasks.properties[0]!,
    status: await add("Status", "status"),
    priority: await add("Priority", "select", {
      options: [
        { name: "High", color: "red" },
        { name: "Low", color: "gray" },
      ],
    }),
    tags: await add("Tags", "multiSelect", { options: [{ name: "b" }, { name: "a" }] }),
    estimate: await add("Estimate", "number"),
    due: await add("Due", "date", { range: true, includeTime: true }),
    done: await add("Done", "checkbox"),
    url: await add("Link", "url"),
    notes: await add("Notes", "text"),
    owner: await add("Owner", "person"),
    files: await add("Files", "files"),
    created: await add("Created", "createdTime"),
    by: await add("Created by", "createdBy"),
    project: await ops.database.addProperty({
      databaseId: db,
      name: "Project",
      type: "relation",
      config: { relation: { databaseId: projects.database.id, twoWay: true } },
    }),
  };
  const budget = await ops.database.addProperty({
    databaseId: projects.database.id,
    name: "Budget",
    type: "number",
  });
  const pr = [];
  for (const [title, b] of [
    ["Atlas", 100],
    ["Boreal", 40],
    ["Cirrus", 7],
  ] as const) {
    pr.push(
      await ops.database.createRow({
        databaseId: projects.database.id,
        title,
        values: { [budget.id]: b },
      }),
    );
  }
  const words = ["alpha", "Beta", "gamma", "delta", "Épsilon", "zeta", "", "eta"];
  const rows = [];
  for (let i = 0; i < 40; i++) {
    const values: Record<string, PropertyValue> = {};
    const pick = <T>(list: readonly T[], k: number) => list[(i * k + 3) % list.length]!;
    if (i % 5 !== 0) values[P.status.id] = pick(["Not started", "In progress", "Done"], 7);
    if (i % 3 !== 0) values[P.priority.id] = pick(["High", "Low", "Medium"], 5);
    if (i % 4 !== 1) values[P.tags.id] = pick([["a"], ["b"], ["a", "b"], ["c"]], 3);
    if (i % 6 !== 2) values[P.estimate.id] = pick([0, 1, 2.5, 8, -3, 13], 11);
    if (i % 7 !== 3) {
      values[P.due.id] = pick(
        [
          "2026-02-27",
          "2026-03-01",
          "2026-03-01T09:30",
          "2026-03-04/2026-03-06",
          "2026-03-15",
          "2026-04-02",
          "2025-12-31T23:00",
        ],
        13,
      );
    }
    if (i % 2 === 0) values[P.done.id] = i % 4 === 0;
    if (i % 3 === 1) values[P.url.id] = `https://example.com/${pick(words, 3)}`;
    values[P.notes.id] = pick(words, 9);
    if (i % 4 !== 3) values[P.owner.id] = pick([[ME], ["ana"], [ME, "ana"]], 5);
    if (i % 9 === 0) values[P.files.id] = ["https://x/1.png"];
    if (i % 3 !== 2) values[P.project.id] = [pr[i % 3]!.id];
    const title = `${pick(["Write", "review", "Ship", "plan", "Ádd"], 3)} ${pick(words, 5)} ${i}`;
    rows.push(await ops.database.createRow({ databaseId: db, title, values }));
  }
  // Hand-edited values of the wrong shape, as a file could hold them.
  await ops.doc.setProperties({
    id: rows[0]!.id,
    set: { Estimate: "12", Notes: true, Status: ["Done"] },
  });
  await ops.doc.setProperties({ id: rows[1]!.id, set: { Tags: "a", Due: "", Priority: 5 } });
  await ops.doc.setProperties({ id: rows[2]!.id, set: { Owner: "solo", Done: "true" } });
  await ops.doc.delete({ id: rows[3]!.id });
  // A row created by an agent, for createdBy filters.
  await runtime
    .as({ type: "agent", id: "a1", app: "claude", onBehalfOf: ME })
    .database.createRow({ databaseId: db, title: "From agent" });
  return { db, P, projects, budget };
}

async function both() {
  const memoryPorts = createMemoryPorts();
  const memory = createRuntime({
    ...memoryPorts,
    actor: { type: "user", id: ME },
    ...deterministic(),
  });
  const { store } = await openTestStore();
  const sqlite = createRuntime({
    ...store.ports,
    actor: { type: "user", id: ME },
    ...deterministic(),
  });
  const a = await scenario(memory);
  const b = await scenario(sqlite);
  expect(b.db).toBe(a.db);
  return { memory, sqlite, store, ...a };
}

describe("database view parity (SQL vs JavaScript)", () => {
  it("gives identical results for filters, sorts, groups and windows", async () => {
    const { memory, sqlite, db, P, store } = await both();
    // The store runs views in SQL; the memory backend in JavaScript.
    expect(store.ports.db).toBeDefined();
    const c = (propertyId: string, op: string, value?: unknown): FilterNode =>
      ({
        type: "condition",
        propertyId,
        op,
        ...(value === undefined ? {} : { value }),
      }) as FilterNode;
    const and = (...children: FilterNode[]): FilterNode => ({
      type: "group",
      combinator: "and",
      children,
    });
    const or = (...children: FilterNode[]): FilterNode => ({
      type: "group",
      combinator: "or",
      children,
    });
    const none = (...children: FilterNode[]): FilterNode => ({
      type: "group",
      combinator: "not",
      children,
    });
    const g = (propertyId: string, extra: Partial<GroupBy> = {}): GroupBy => ({
      propertyId,
      direction: "asc",
      ...extra,
    });

    const filters: FilterNode[] = [
      c(P.status.id, "eq", "Done"),
      c(P.status.id, "neq", "Done"),
      c(P.status.id, "in", ["Done", "Not started"]),
      c(P.status.id, "notIn", ["Done"]),
      c(P.status.id, "isEmpty"),
      c(P.priority.id, "eq", "Medium"),
      c(P.tags.id, "contains", "a"),
      c(P.tags.id, "notContains", "a"),
      c(P.tags.id, "in", ["b", "c"]),
      c(P.tags.id, "isEmpty"),
      c(P.tags.id, "isNotEmpty"),
      c(P.estimate.id, "gt", 1),
      c(P.estimate.id, "lte", 0),
      c(P.estimate.id, "eq", 12),
      c(P.estimate.id, "between", [0, 8]),
      c(P.estimate.id, "neq", 8),
      c(P.estimate.id, "isEmpty"),
      c(P.due.id, "eq", "2026-03-01"),
      c(P.due.id, "lt", { relative: "today" }),
      c(P.due.id, "gte", { relative: "today", amount: 1, unit: "week" }),
      c(P.due.id, "between", [
        { relative: "today", amount: -1, unit: "week" },
        { relative: "today", amount: 1, unit: "week" },
      ]),
      c(P.due.id, "gt", "2026-03-01T09:00"),
      c(P.due.id, "isEmpty"),
      c(P.done.id, "eq", true),
      c(P.done.id, "eq", false),
      c(P.url.id, "contains", "EXAMPLE"),
      c(P.url.id, "startsWith", "https://example.com/b"),
      c(P.url.id, "endsWith", "ta"),
      c(P.notes.id, "contains", "ps"),
      c(P.notes.id, "eq", "true"),
      c(P.notes.id, "notContains", "a"),
      c(P.notes.id, "isNotEmpty"),
      c(P.notes.id, "gt", "delta"),
      c(P.title.id, "startsWith", "write"),
      c(P.title.id, "contains", "ád"),
      c(P.owner.id, "contains", { me: true }),
      c(P.owner.id, "in", ["solo", "ana"]),
      c(P.files.id, "isNotEmpty"),
      c(P.project.id, "contains", "01933e6f-2284-0000-0000-000000000000"),
      c(P.created.id, "gte", "2026-02-22"),
      c(P.by.id, "eq", { me: true }),
      c(P.by.id, "neq", ME),
      and(c(P.done.id, "eq", false), or(c(P.estimate.id, "gt", 2), c(P.tags.id, "contains", "b"))),
      none(c(P.status.id, "eq", "Done"), c(P.priority.id, "eq", "Low")),
      or(),
    ];
    const sorts = [
      [{ propertyId: P.title.id }],
      [{ propertyId: P.status.id }, { propertyId: P.estimate.id, direction: "desc" }],
      [{ propertyId: P.priority.id, direction: "desc" }],
      [{ propertyId: P.tags.id }],
      [{ propertyId: P.due.id, direction: "desc" }],
      [{ propertyId: P.done.id }, { propertyId: P.notes.id }],
      [{ propertyId: P.owner.id, direction: "desc" }, { propertyId: P.url.id }],
      [{ propertyId: P.project.id }, { propertyId: P.created.id, direction: "desc" }],
    ];
    const groupings: Pick<ViewConfigInput, "groupBy" | "subGroupBy">[] = [
      { groupBy: g(P.status.id) },
      { groupBy: g(P.status.id, { direction: "desc", hideEmpty: true }) },
      { groupBy: g(P.priority.id, { order: ["Low", null, "High"] }) },
      { groupBy: g(P.tags.id) },
      { groupBy: g(P.due.id, { dateBucket: "week" }) },
      { groupBy: g(P.due.id, { dateBucket: "day", direction: "desc" }) },
      { groupBy: g(P.due.id, { dateBucket: "year" }) },
      { groupBy: g(P.done.id) },
      { groupBy: g(P.estimate.id, { direction: "desc" }) },
      { groupBy: g(P.owner.id) },
      { groupBy: g(P.notes.id) },
      { groupBy: g(P.project.id) },
      { groupBy: g(P.by.id) },
      { groupBy: g(P.status.id), subGroupBy: g(P.owner.id) },
      { groupBy: g(P.tags.id), subGroupBy: g(P.priority.id, { order: ["High", "Low"] }) },
    ];
    const windows: ViewWindowInput[] = [
      { offset: 0, limit: 100 },
      { offset: 3, limit: 5 },
      { offset: 0, limit: 10, group: "Done" },
      { offset: 0, limit: 10, group: null },
      {
        offset: 0,
        limit: 50,
        range: { propertyId: P.due.id, start: "2026-03-01", end: "2026-03-05" },
      },
    ];

    const cases: { config: ViewConfigInput; window: ViewWindowInput }[] = [];
    for (const filter of filters)
      cases.push({ config: { filter, sorts: [{ propertyId: P.title.id }] }, window: {} });
    for (const s of sorts)
      cases.push({ config: { sorts: s as ViewConfigInput["sorts"] }, window: {} });
    for (const grouping of groupings) {
      for (const window of windows)
        cases.push({ config: { ...grouping, sorts: [{ propertyId: P.estimate.id }] }, window });
    }
    cases.push({
      config: { limit: 7, groupBy: g(P.status.id), sorts: [{ propertyId: P.due.id }] },
      window: {},
    });
    cases.push({
      config: { filter: c(P.estimate.id, "gt", 0), groupBy: g(P.tags.id) },
      window: { offset: 2, limit: 3 },
    });

    let checked = 0;
    for (const { config, window } of cases) {
      const input = {
        databaseId: db,
        view: { type: "table" as const, config },
        window,
        today: TODAY,
      };
      const [expected, actual] = await Promise.all([
        memory.ops.database.query(input),
        sqlite.ops.database.query(input),
      ]);
      const summary = (r: typeof actual) => ({
        total: r.total,
        groups: r.groups,
        rows: r.rows.map((x) => `${x.title}|${x.group}|${x.subGroup}`),
      });
      if (JSON.stringify(summary(actual)) !== JSON.stringify(summary(expected))) {
        console.log("MISMATCH", JSON.stringify({ config, window }));
      }
      expect({ config, window, result: summary(actual) }).toEqual({
        config,
        window,
        result: summary(expected),
      });
      expect(actual).toEqual(expected);
      checked++;
    }
    expect(checked).toBe(cases.length);
  });

  it("agrees on computed columns, and on views that need JavaScript", async () => {
    const { memory, sqlite, db, P, budget } = await both();
    for (const runtime of [memory, sqlite]) {
      await runtime.ops.database.addProperty({
        databaseId: db,
        id: "01934000-0000-0000-0000-0000000c02d6",
        name: "Budget",
        type: "rollup",
        config: {
          rollup: {
            relationPropertyId: P.project.id,
            targetPropertyId: budget.id,
            function: "sum",
          },
        },
      });
      await runtime.ops.database.addProperty({
        databaseId: db,
        id: "01934000-0000-0000-0000-000000f0628a",
        name: "Score",
        type: "formula",
        config: { expression: "if(Estimate, Estimate * 2, 0) + Tags.length" },
      });
    }
    const configs: ViewConfigInput[] = [
      {
        sorts: [
          { propertyId: "01934000-0000-0000-0000-0000000c02d6", direction: "desc" },
          { propertyId: P.title.id },
        ],
      },
      {
        filter: {
          type: "condition",
          propertyId: "01934000-0000-0000-0000-000000f0628a",
          op: "gt",
          value: 4,
        },
      },
      { filter: { type: "expression", expression: 'Notes.contains("a") || Estimate > 5' } },
      { groupBy: { propertyId: "01934000-0000-0000-0000-000000f0628a", direction: "desc" } },
      { sorts: [{ propertyId: P.estimate.id }] },
    ];
    for (const config of configs) {
      const input = { databaseId: db, view: { type: "table" as const, config }, today: TODAY };
      expect(await sqlite.ops.database.query(input)).toEqual(
        await memory.ops.database.query(input),
      );
    }
  });

  it("agrees on every database operation's results", async () => {
    const { memory, sqlite, db, P } = await both();
    for (const runtime of [memory, sqlite]) {
      const { ops } = runtime;
      const tags = (await ops.database.get({ id: db })).properties.find((p) => p.id === P.tags.id)!;
      await ops.database.updateOption({
        propertyId: tags.id,
        optionId: tags.config.options![1]!.id,
        name: "aa",
      });
      await ops.database.changePropertyType({ id: P.priority.id, type: "multiSelect" });
      await ops.database.updateProperty({ id: P.notes.id, key: "Notes 2" });
      await ops.database.createView({ databaseId: db, name: "Board", type: "board" });
      const rows = (await ops.database.query({ databaseId: db, window: { limit: 5 } })).rows;
      await ops.database.setValues({
        databaseId: db,
        rowIds: rows.map((r) => r.id),
        set: { [P.status.id]: "Blocked" },
      });
      await ops.database.duplicateRows({ databaseId: db, rowIds: [rows[0]!.id] });
      await runtime.history.undo();
      await runtime.history.undo();
    }
    expect(await sqlite.ops.database.get({ id: db })).toEqual(
      await memory.ops.database.get({ id: db }),
    );
    const input = {
      databaseId: db,
      view: { type: "table" as const, config: { sorts: [{ propertyId: P.title.id }] } },
      today: TODAY,
    };
    expect(await sqlite.ops.database.query(input)).toEqual(await memory.ops.database.query(input));
    expect((await sqlite.ops.database.list({ workspaceId: WS })).databases).toEqual(
      (await memory.ops.database.list({ workspaceId: WS })).databases,
    );
  });
});

describe("row templates (LYD-209)", () => {
  it("are left out of views, counts and groups in SQL and JavaScript, and listed on their own", async () => {
    const { memory, sqlite, db, P, store } = await both();
    for (const runtime of [memory, sqlite]) {
      const { ops } = runtime;
      const all = (await ops.database.query({ databaseId: db, window: { limit: 1000 } })).rows;
      const template = all.find((r) => r.title.startsWith("Ship"))!;
      const outside = await ops.doc.create({ workspaceId: WS, title: "Loose template" });
      await ops.database.update({ id: db, templateIds: [template.id, outside.id] });
      const after = await ops.database.query({
        databaseId: db,
        view: { type: "table", config: { groupBy: { propertyId: P.status.id } } },
        window: { limit: 1000 },
        today: TODAY,
      });
      expect(after.total).toBe(all.length - 1);
      expect(after.rows.map((r) => r.id)).not.toContain(template.id);
      expect(after.groups.reduce((n, g) => n + g.count, 0)).toBe(all.length - 1);
      expect(
        (await ops.database.listTemplates({ databaseId: db })).templates.map((d) => d.title),
      ).toEqual([template.title, "Loose template"]);
      // Still a document, reachable by id, and usable as a template.
      expect((await ops.doc.get({ id: template.id })).document.parentId).toBe(db);
      const made = await ops.database.createRow({
        databaseId: db,
        title: "From template",
        templateId: template.id,
      });
      expect(made.parentId).toBe(db);
    }
    // A view that needs JavaScript (a formula sort) agrees too.
    for (const runtime of [memory, sqlite]) {
      await runtime.ops.database.addProperty({
        databaseId: db,
        id: "01934000-0000-0000-0000-000000f0628b",
        name: "Twice",
        type: "formula",
        config: { expression: "Estimate * 2" },
      });
    }
    for (const config of [
      { sorts: [{ propertyId: "01934000-0000-0000-0000-000000f0628b" }] },
      { filter: { type: "condition", propertyId: P.status.id, op: "isNotEmpty" } },
    ] as ViewConfigInput[]) {
      const input = { databaseId: db, view: { type: "table" as const, config }, today: TODAY };
      expect(await sqlite.ops.database.query(input)).toEqual(
        await memory.ops.database.query(input),
      );
    }
    // The store's live query for the "New" menu and its live view agree.
    const listed = await store.query(queries.databaseTemplates(db));
    expect(listed.map((d) => d.title)).toEqual(
      (await sqlite.ops.database.listTemplates({ databaseId: db })).templates.map((d) => d.title),
    );
    const view = store.liveView({ databaseId: db, window: { limit: 1000 }, today: TODAY });
    try {
      const items = await nextLive(view, (i) => i.length > 0);
      const ids = items.flatMap((i) => (i.kind === "row" ? [i.row.id] : []));
      expect(ids).not.toContain(listed[0]!.id);
    } finally {
      await view.close();
    }
  });
});

describe("live views", () => {
  it("re-run only when their rows or related rows change", async () => {
    const { store, runtime } = await openTestStore();
    const { db, P, projects } = await scenario(runtime);
    const runs = { n: 0 };
    const getAll = store.db.getAll.bind(store.db);
    (store.db as { getAll: typeof getAll }).getAll = ((sql: string, params?: unknown[]) => {
      if (sql.includes("WITH f AS MATERIALIZED")) runs.n++;
      return getAll(sql, params);
    }) as typeof getAll;
    const view = store.liveView({
      databaseId: db,
      view: { config: { sorts: [{ propertyId: P.title.id }] } },
      window: { limit: 10 },
      today: TODAY,
    });
    try {
      await nextLive(view, (items) => items.length > 0);
      const settle = () => new Promise((r) => setTimeout(r, 80));
      await settle();
      const base = runs.n;
      // A note elsewhere in the workspace: no re-run.
      const note = await runtime.ops.doc.create({ workspaceId: WS, title: "Elsewhere" });
      await runtime.ops.doc.updateBody({ id: note.id, markdown: "typing" });
      await runtime.ops.doc.rename({ id: note.id, title: "Elsewhere 2" });
      await settle();
      expect(runs.n).toBe(base);
      // A related row (a project the tasks point at) changes their relation titles: re-run.
      const [project] = await store.query(queries.children(WS, projects.database.id));
      await runtime.ops.doc.rename({ id: project!.id, title: "Renamed project" });
      await settle();
      expect(runs.n).toBe(base + 1);
      // A row moved in from elsewhere: re-run, and it shows.
      await runtime.ops.doc.move({ id: note.id, parentId: db });
      const moved = await nextLive(view, (items) =>
        items.some((i) => i.kind === "meta" && i.total === 41),
      );
      expect(moved.length).toBeGreaterThan(0);
    } finally {
      await view.close();
    }
  });

  it("repaint on changes and keep unchanged rows", async () => {
    const { store, runtime } = await openTestStore();
    const { db, P, projects } = await scenario(runtime);
    const view = store.liveView({
      databaseId: db,
      view: { config: { sorts: [{ propertyId: P.title.id }] } },
      window: { limit: 10 },
      today: TODAY,
    });
    try {
      const first = await nextLive(view, (items) => items.length > 0);
      const meta = first.find((i) => i.kind === "meta");
      expect(meta).toMatchObject({ kind: "meta", total: 40, viewType: "table" });
      const rows = first.filter((i) => i.kind === "row");
      expect(rows).toHaveLength(10);
      const target = rows[4]!;
      if (target.kind !== "row") throw new Error("expected a row");

      await runtime.ops.database.setValues({
        databaseId: db,
        rowIds: [target.row.id],
        set: { [P.estimate.id]: 99 },
      });
      const second = await nextLive(view, (items) =>
        items.some(
          (i) => i.kind === "row" && i.row.id === target.row.id && i.row.properties.Estimate === 99,
        ),
      );
      // Only the changed row is a new object.
      const kept = second.filter((i, n) => i === first[n]).length;
      expect(kept).toBe(first.length - 1);
      expect(view.result?.rows).toHaveLength(10);

      // A related row's title shows in the relation column of the rows that point at it.
      const withProject = second.find(
        (i) => i.kind === "row" && (i.row.computed[P.project.id] as unknown[]).length > 0,
      );
      if (!withProject || withProject.kind !== "row") throw new Error("expected a related row");
      const related = (withProject.row.computed[P.project.id] as { id: string }[])[0]!;
      await runtime.ops.doc.rename({ id: related.id, title: "Renamed project" });
      await nextLive(view, (items) =>
        items.some(
          (i) =>
            i.kind === "row" &&
            i.row.id === withProject.row.id &&
            JSON.stringify(i.row.computed[P.project.id]).includes("Renamed project"),
        ),
      );
      expect(projects.database.id).toBeDefined();
    } finally {
      await view.close();
    }
  });

  it("serves definitions and the database list as live queries", async () => {
    const { store, runtime } = await openTestStore();
    const { db } = await scenario(runtime);
    const list = await store.query(queries.databases(WS));
    expect(list.map((d) => d.title)).toEqual(["Projects", "Tasks"]);
    const props = await store.query(queries.databaseProperties(db));
    expect(props[0]).toMatchObject({ type: "title", key: "name" });
    expect((await store.query(queries.databaseViews(db))).map((v) => v.name)).toEqual(["Table"]);
    await runtime.ops.doc.delete({ id: db });
    expect((await store.query(queries.databases(WS))).map((d) => d.title)).toEqual(["Projects"]);
  });
});

describe("team and access tables", () => {
  it("are empty locally and read hosted rows", async () => {
    const { store, runtime } = await openTestStore();
    const doc = await runtime.ops.doc.create({ workspaceId: WS, title: "Page" });
    expect(await store.query(queries.teamspaces(WS))).toEqual([]);
    expect(await store.query(queries.myAccess(doc.id))).toEqual([
      {
        documentId: doc.id,
        teamspaceId: null,
        privateOwnerId: null,
        restricted: false,
        scopeId: null,
        level: null,
      },
    ]);
    // What sync would write (local mode allows writing the views directly).
    const at = "2026-03-01T00:00:00.000Z";
    await store.db.execute(
      "INSERT INTO teamspaces (id, workspace_id, name, description, icon, visibility, is_default, created_by, created_at, updated_at) VALUES ('t1', ?, 'Eng', '', NULL, 'closed', 1, 'u1', ?, ?)",
      [WS, at, at],
    );
    await store.db.execute(
      "INSERT INTO teamspace_members (id, workspace_id, teamspace_id, user_id, role, created_at) VALUES ('m1', ?, 't1', 'u1', 'owner', ?)",
      [WS, at],
    );
    await store.db.execute(
      "INSERT INTO workspace_members (id, workspace_id, user_id, role, user_name, user_email, created_at) VALUES ('w1', ?, 'u1', 'owner', 'Ada', 'ada@x', ?)",
      [WS, at],
    );
    await store.db.execute(
      "INSERT INTO access_scope_members (id, scope_id, workspace_id, level) VALUES ('s1', 'scope1', ?, 'edit')",
      [WS],
    );
    await store.db.execute(
      "UPDATE documents SET teamspace_id = 't1', scope_id = 'scope1', restricted = 0 WHERE id = ?",
      [doc.id],
    );
    await store.db.execute(
      "INSERT INTO document_grants (id, workspace_id, document_id, principal_type, principal_id, level, scope_id, created_by, created_at, updated_at) VALUES ('g1', ?, ?, 'user', 'u2', 'view', 'scope1', 'u1', ?, ?)",
      [WS, doc.id, at, at],
    );
    expect(await store.query(queries.teamspaces(WS))).toEqual([
      {
        id: "t1",
        workspaceId: WS,
        name: "Eng",
        description: "",
        icon: null,
        visibility: "closed",
        isDefault: true,
        createdBy: "u1",
        createdAt: at,
        updatedAt: at,
      },
    ]);
    expect((await store.query(queries.teamspaceMembers("t1")))[0]).toMatchObject({
      userId: "u1",
      role: "owner",
    });
    expect((await store.query(queries.workspaceMembers(WS)))[0]).toMatchObject({
      userName: "Ada",
      role: "owner",
    });
    expect((await store.query(queries.grants(doc.id)))[0]).toMatchObject({
      principalId: "u2",
      level: "view",
    });
    expect((await store.query(queries.myAccess(doc.id)))[0]).toMatchObject({
      teamspaceId: "t1",
      level: "edit",
      restricted: false,
    });
  });
});

describe("Yjs persistence", () => {
  it("appends, compacts, flags dirty documents and clears", async () => {
    const { store } = await openTestStore();
    const y = store.yjs;
    await y.append("d1", new Uint8Array([1, 2, 3]));
    await y.append("d1", new Uint8Array([4]));
    expect((await y.load("d1")).map((u) => [...u])).toEqual([[1, 2, 3], [4]]);
    await y.setDirty("d1", true);
    await y.setDirty("d2", true);
    expect(await y.dirty()).toEqual(["d1", "d2"]);
    await y.replace("d1", new Uint8Array([9, 9]));
    await y.append("d1", new Uint8Array([5]));
    expect((await y.load("d1")).map((u) => [...u])).toEqual([[9, 9], [5]]);
    expect(await y.dirty()).toEqual(["d1", "d2"]);
    await y.setDirty("d1", false);
    await y.clear("d2");
    expect(await y.dirty()).toEqual([]);
    expect(await y.load("d2")).toEqual([]);
    const big = new Uint8Array(200_000).map((_, i) => i % 251);
    await y.replace("d3", big);
    expect((await y.load("d3"))[0]).toEqual(big);
  });
});

describe("migration 4", () => {
  it("builds doc_props for an existing database", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lydie-m4-"));
    const path = join(dir, "workspace.sqlite");
    copyFileSync(join(import.meta.dir, "migrations", "fixtures", "v1.sqlite"), path);
    let store: Store | undefined;
    try {
      store = await openNodeStore({ path });
      const rows = await store.db.getAll<{ title: string; props: string }>(
        "SELECT title, json(props) AS props FROM doc_props ORDER BY title",
      );
      expect(rows.map((r) => [r.title, JSON.parse(r.props)])).toEqual([
        ["Alpha", {}],
        ["Beta", { status: "done" }],
        ["Deleted", {}],
      ]);
    } finally {
      await store?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
