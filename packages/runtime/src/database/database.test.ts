import { describe, expect, it } from "bun:test";

import { parseExpression } from "@lydie/contract";
import type { PropertyValue } from "@lydie/contract";
import { fromBase, toBase } from "@lydie/contract/files";

import { createMemoryPorts } from "../memory/index.ts";
import { createRuntime } from "../runtime.ts";
import { evaluate } from "./evaluate.ts";
import type { Scope } from "./evaluate.ts";

const WS = "ws1";

function setup() {
  const ports = createMemoryPorts();
  let tick = Date.parse("2026-03-01T10:00:00.000Z");
  const runtime = createRuntime({
    ...ports,
    actor: { type: "user", id: "me" },
    clock: { now: () => new Date((tick += 1000)) },
  });
  return { ports, runtime, ops: runtime.ops };
}

async function fixture() {
  const ctx = setup();
  const { ops } = ctx;
  const projects = await ops.database.create({ workspaceId: WS, title: "Projects" });
  const tasks = await ops.database.create({ workspaceId: WS, title: "Tasks" });
  const db = tasks.database.id;
  const status = await ops.database.addProperty({ databaseId: db, name: "Status", type: "status" });
  const tags = await ops.database.addProperty({
    databaseId: db,
    name: "Tags",
    type: "multiSelect",
  });
  const estimate = await ops.database.addProperty({
    databaseId: db,
    name: "Estimate",
    type: "number",
  });
  const due = await ops.database.addProperty({
    databaseId: db,
    name: "Due",
    type: "date",
    config: { range: true },
  });
  const done = await ops.database.addProperty({ databaseId: db, name: "Done", type: "checkbox" });
  const owner = await ops.database.addProperty({ databaseId: db, name: "Owner", type: "person" });
  const project = await ops.database.addProperty({
    databaseId: db,
    name: "Project",
    type: "relation",
    reverseName: "Tasks",
    config: { relation: { databaseId: projects.database.id, twoWay: true } },
  });
  const reverseId = project.config.relation!.reversePropertyId!;
  const budget = await ops.database.addProperty({
    databaseId: projects.database.id,
    name: "Budget",
    type: "number",
  });
  const atlas = await ops.database.createRow({
    databaseId: projects.database.id,
    title: "Atlas",
    values: { [budget.id]: 100 },
  });
  const boreal = await ops.database.createRow({
    databaseId: projects.database.id,
    title: "Boreal",
    values: { [budget.id]: 40 },
  });
  const row = (title: string, values: Record<string, PropertyValue>) =>
    ops.database.createRow({ databaseId: db, title, values });
  const rows = [
    await row("Write intro", {
      [status.id]: "In progress",
      [tags.id]: ["writing"],
      [estimate.id]: 3,
      [due.id]: "2026-03-02",
      [owner.id]: ["me"],
      [project.id]: [atlas.id],
    }),
    await row("review draft", {
      [status.id]: "Not started",
      [tags.id]: ["writing", "review"],
      [estimate.id]: 1,
      [due.id]: "2026-03-10/2026-03-12",
      [project.id]: [atlas.id],
    }),
    await row("Ship it", {
      [status.id]: "Done",
      [estimate.id]: 8,
      [done.id]: true,
      [owner.id]: ["ana"],
      [project.id]: [boreal.id],
    }),
    await row("Plan", { [tags.id]: ["planning"] }),
  ];
  const title = tasks.properties[0]!;
  return {
    ...ctx,
    projects,
    tasks,
    db,
    title,
    status,
    tags,
    estimate,
    due,
    done,
    owner,
    project,
    reverseId,
    budget,
    atlas,
    boreal,
    rows,
  };
}

const ids = (r: { rows: { id: string; title: string }[] }) => r.rows.map((x) => x.title);

describe("two-way relations", () => {
  it("keep both sides in step and undo as one step", async () => {
    const f = await fixture();
    const atlas = await f.ops.doc.get({ id: f.atlas.id, includeBody: false });
    const reverse = (await f.ops.database.get({ id: f.projects.database.id })).properties.find(
      (p) => p.id === f.reverseId,
    )!;
    expect(reverse).toMatchObject({ name: "Tasks", type: "relation" });
    expect(atlas.document.properties[reverse.key]).toEqual([f.rows[0]!.id, f.rows[1]!.id]);

    f.runtime.history.clear();
    await f.ops.database.setValues({
      databaseId: f.db,
      rowIds: [f.rows[0]!.id],
      set: { [f.project.id]: [f.boreal.id] },
    });
    const after = async (id: string) =>
      (await f.ops.doc.get({ id, includeBody: false })).document.properties[reverse.key];
    expect(await after(f.atlas.id)).toEqual([f.rows[1]!.id]);
    expect(await after(f.boreal.id)).toEqual([f.rows[2]!.id, f.rows[0]!.id]);
    await f.runtime.history.undo();
    expect(await after(f.atlas.id)).toEqual([f.rows[0]!.id, f.rows[1]!.id]);
    expect(await after(f.boreal.id)).toEqual([f.rows[2]!.id]);
  });
});

describe("options and types", () => {
  it("renames an option in every row, adds unknown ones, converts on type change", async () => {
    const f = await fixture();
    const writing = (await f.ops.database.get({ id: f.db })).properties
      .find((p) => p.id === f.tags.id)!
      .config.options!.find((o) => o.name === "writing")!;
    const { rewritten } = await f.ops.database.updateOption({
      propertyId: f.tags.id,
      optionId: writing.id,
      name: "drafting",
    });
    expect(rewritten).toBe(2);
    const doc = await f.ops.doc.get({ id: f.rows[1]!.id, includeBody: false });
    expect(doc.document.properties.Tags).toEqual(["drafting", "review"]);

    const { converted } = await f.ops.database.changePropertyType({ id: f.tags.id, type: "text" });
    expect(converted).toBe(3);
    expect(
      (await f.ops.doc.get({ id: f.rows[1]!.id, includeBody: false })).document.properties.Tags,
    ).toBe("drafting, review");
    await f.runtime.history.undo();
    expect(
      (await f.ops.doc.get({ id: f.rows[1]!.id, includeBody: false })).document.properties.Tags,
    ).toEqual(["drafting", "review"]);
  });

  it("checks values against the type", async () => {
    const f = await fixture();
    const error = await f.ops.database
      .setValues({ databaseId: f.db, rowIds: [f.rows[0]!.id], set: { [f.estimate.id]: "lots" } })
      .catch((e: unknown) => e);
    expect(String(error)).toMatch(/Estimate: Expected a number/);
  });
});

describe("rows", () => {
  it("creates rows with the values a view's filter and group imply", async () => {
    const f = await fixture();
    const view = await f.ops.database.createView({
      databaseId: f.db,
      name: "Mine",
      type: "board",
      config: {
        filter: {
          type: "group",
          combinator: "and",
          children: [
            { type: "condition", propertyId: f.owner.id, op: "contains", value: { me: true } },
            { type: "condition", propertyId: f.done.id, op: "eq", value: false },
          ],
        },
      },
    });
    expect(view.config.groupBy?.propertyId).toBe(f.status.id);
    const row = await f.ops.database.createRow({
      databaseId: f.db,
      viewId: view.id,
      group: "Done",
      title: "New",
    });
    expect(row.properties).toEqual({ Owner: ["me"], Done: false, Status: "Done" });
    const moved = await f.ops.database.moveRow({
      rowId: row.id,
      viewId: view.id,
      group: "In progress",
      beforeId: f.rows[0]!.id,
    });
    expect(moved.properties.Status).toBe("In progress");
    const children = (
      await f.ops.doc.listChildren({ workspaceId: WS, parentId: f.db })
    ).entries.map((e) => e.title);
    expect(children.indexOf("New")).toBe(children.indexOf("Write intro") - 1);
  });
});

describe("queries", () => {
  it("filters, sorts, groups and windows", async () => {
    const f = await fixture();
    const q = (config: Record<string, unknown>, window = {}) =>
      f.ops.database.query({
        databaseId: f.db,
        view: { type: "table", config },
        window,
        today: "2026-03-01",
      });

    expect(ids(await q({ sorts: [{ propertyId: f.estimate.id, direction: "desc" }] }))).toEqual([
      "Ship it",
      "Write intro",
      "review draft",
      "Plan",
    ]);
    // Text sorts ignore ASCII case; empty values go last both ways.
    expect(ids(await q({ sorts: [{ propertyId: f.due.id, direction: "desc" }] }))).toEqual([
      "review draft",
      "Write intro",
      "Ship it",
      "Plan",
    ]);
    expect(ids(await q({ sorts: [{ propertyId: f.status.id }] }))).toEqual([
      "review draft",
      "Write intro",
      "Ship it",
      "Plan",
    ]);

    const mine = await q({
      filter: { type: "condition", propertyId: f.owner.id, op: "contains", value: { me: true } },
    });
    expect(ids(mine)).toEqual(["Write intro"]);
    const soon = await q({
      filter: {
        type: "condition",
        propertyId: f.due.id,
        op: "lte",
        value: { relative: "today", amount: 1, unit: "week" },
      },
    });
    expect(ids(soon)).toEqual(["Write intro"]);
    const notWriting = await q({
      filter: { type: "condition", propertyId: f.tags.id, op: "notContains", value: "writing" },
    });
    expect(ids(notWriting)).toEqual(["Ship it", "Plan"]);

    const grouped = await q(
      { groupBy: { propertyId: f.tags.id }, sorts: [{ propertyId: f.title.id }] },
      { offset: 0, limit: 2 },
    );
    expect(grouped.total).toBe(5);
    expect(grouped.groups.map((g) => [g.key, g.count, g.start])).toEqual([
      ["writing", 2, 0],
      ["review", 1, 2],
      ["planning", 1, 3],
      [null, 1, 4],
    ]);
    expect(grouped.rows.map((r) => [r.title, r.group])).toEqual([
      ["review draft", "writing"],
      ["Write intro", "writing"],
    ]);

    const column = await q({ groupBy: { propertyId: f.status.id } }, { group: "Done" });
    expect(ids(column)).toEqual(["Ship it"]);
    expect(column.groups.map((g) => g.key)).toEqual(["Not started", "In progress", "Done", null]);

    const calendar = await q(
      { layout: { calendarPropertyId: f.due.id } },
      { range: { start: "2026-03-11", end: "2026-03-20" } },
    );
    expect(ids(calendar)).toEqual(["review draft"]);
  });

  it("computes relations, rollups and formulas", async () => {
    const f = await fixture();
    const rollup = await f.ops.database.addProperty({
      databaseId: f.db,
      name: "Project budget",
      type: "rollup",
      config: {
        rollup: {
          relationPropertyId: f.project.id,
          targetPropertyId: f.budget.id,
          function: "sum",
        },
      },
    });
    const formula = await f.ops.database.addProperty({
      databaseId: f.db,
      name: "Cost",
      type: "formula",
      config: { expression: 'if(Estimate, Estimate * 10 + " €", "?")' },
    });
    const r = await f.ops.database.query({
      databaseId: f.db,
      view: {
        type: "table",
        config: {
          sorts: [{ propertyId: rollup.id, direction: "desc" }, { propertyId: f.estimate.id }],
        },
      },
    });
    expect(r.rows.map((x) => [x.title, x.computed[rollup.id], x.computed[formula.id]])).toEqual([
      ["review draft", 100, "10 €"],
      ["Write intro", 100, "30 €"],
      ["Ship it", 40, "80 €"],
      ["Plan", 0, "?"],
    ]);
    expect(r.rows[0]!.computed[f.project.id]).toEqual([{ id: f.atlas.id, title: "Atlas" }]);
  });
});

describe("inline databases", () => {
  it("resolve ![[Tasks.base#View]] embeds to the database document", async () => {
    const f = await fixture();
    const page = await f.ops.doc.create({
      workspaceId: WS,
      title: "Weekly",
      markdown: "Plan\n\n![[Tasks.base#Board]]\n",
    });
    const { backlinks } = await f.ops.doc.backlinks({ id: f.db });
    expect(backlinks).toEqual([
      expect.objectContaining({
        source: expect.objectContaining({ id: page.id }),
        kind: "embed",
        targetRef: "Tasks.base",
        targetHeading: "Board",
      }),
    ]);
    // An embed written before the database existed resolves once it does.
    const early = await f.ops.doc.create({
      workspaceId: WS,
      title: "Early",
      markdown: "![[Reading.base]]",
    });
    const reading = await f.ops.database.create({ workspaceId: WS, title: "Reading" });
    expect(
      (await f.ops.doc.backlinks({ id: reading.database.id })).backlinks.map((b) => b.source.id),
    ).toEqual([early.id]);
  });
});

describe(".base round trip through operations", () => {
  it("applies what fromBase reads", async () => {
    const f = await fixture();
    const def = await f.ops.database.get({ id: f.db });
    const text = toBase(
      {
        id: def.database.id,
        config: def.database.config,
        properties: def.properties,
        views: def.views,
      },
      { folder: "Tasks" },
    );
    let n = 0;
    const read = fromBase(text, { newId: () => `01JD${String(n++).padStart(22, "0")}` });
    expect(read.id).toBe(f.db);
    const applied = await f.ops.database.setDefinition({ id: f.db, definition: read.definition });
    expect(
      applied.properties.map(({ id, name, type, key, config }) => ({
        id,
        name,
        type,
        key,
        config,
      })),
    ).toEqual(
      def.properties.map(({ id, name, type, key, config }) => ({ id, name, type, key, config })),
    );
    expect(applied.views.map((v) => v.config)).toEqual(def.views.map((v) => v.config));
  });
});

describe("evaluate", () => {
  const scope: Scope = {
    note: (name) => ({ price: 12.5, tags: ["a", "b"], title: "Hi" })[name] ?? null,
    file: (name) => (name === "name" ? "Note" : null),
    formula: () => null,
    now: Date.parse("2026-03-01T10:00:00Z"),
    today: "2026-03-01",
  };
  it.each([
    ["price * 2", 25],
    ['price.toFixed(1) + " $"', "12.5 $"],
    ['tags.contains("b") && !tags.contains("c")', true],
    ['tags.map(value.upper()).join("-")', "A-B"],
    ['tags.reduce(acc + value, "")', "ab"],
    ['(date("2026-03-10") - today()) / 86400000', 9],
    ['(today() + "1M").format("YYYY-MM-DD")', "2026-04-01"],
    ["if(missing, 1, 2)", 2],
    ["file.name.lower()", "note"],
    ["[1, 2, 3].filter(value > 1).length", 2],
  ])("%s", (source, expected) => {
    expect(evaluate(parseExpression(source), scope)).toEqual(expected);
  });
});

describe("agent-level operations", () => {
  it("write rows by property name, change schema and views in one step each", async () => {
    const f = await fixture();
    const written = await f.ops.database.writeRows({
      databaseId: f.db,
      rows: [{ values: { Name: "From an agent", estimate: 2, Tags: ["new"] } }],
    });
    expect(written.rows).toMatchObject([{ title: "From an agent", action: "created" }]);
    const row = await f.ops.doc.get({ id: written.rows[0]!.id, includeBody: false });
    expect(row.document.title).toBe("From an agent");
    expect(row.document.properties).toMatchObject({ Estimate: 2, Tags: ["new"] });

    const schema = await f.ops.database.changeSchema({
      databaseId: f.db,
      add: [{ name: "Notes", type: "text" }],
      update: [{ property: "Estimate", name: "Points" }],
    });
    expect(schema.properties.map((p) => p.name)).toContain("Points");
    expect(schema.properties.map((p) => p.name)).toContain("Notes");

    const views = await f.ops.database.changeViews({
      databaseId: f.db,
      add: [{ name: "Calendar", type: "calendar" }],
    });
    expect(views.views.map((v) => v.name)).toContain("Calendar");

    // One undo step each.
    await f.runtime.history.undo();
    expect((await f.ops.database.get({ id: f.db })).views.map((v) => v.name)).not.toContain(
      "Calendar",
    );
  });

  it("names properties and views by name in view configs and queries", async () => {
    const f = await fixture();
    const changed = await f.ops.database.changeViews({
      databaseId: f.db,
      add: [
        {
          name: "Open work",
          type: "board",
          config: {
            filter: { type: "condition", propertyId: "status", op: "neq", value: "Done" },
            sorts: [{ propertyId: "Estimate", direction: "desc" }],
            groupBy: { propertyId: "Status" },
            columns: [{ propertyId: "tags", visible: false }],
            summaries: { Estimate: "Sum" },
          },
        },
      ],
    });
    const view = (await f.ops.database.get({ id: f.db })).views.find(
      (v) => v.name === "Open work",
    )!;
    expect(changed.views.map((v) => v.id)).toContain(view.id);
    // Stored with ids.
    expect(view.config.filter).toMatchObject({ propertyId: f.status.id });
    expect(view.config.sorts).toEqual([{ propertyId: f.estimate.id, direction: "desc" }]);
    expect(view.config.groupBy).toMatchObject({ propertyId: f.status.id });
    expect(view.config.columns).toContainEqual(
      expect.objectContaining({ propertyId: f.tags.id, visible: false }),
    );
    expect(view.config.summaries).toEqual({ [f.estimate.id]: "Sum" });

    const byName = await f.ops.database.query({ databaseId: f.db, viewId: "open WORK" });
    expect(ids(byName).sort()).toEqual(["Plan", "Write intro", "review draft"]);
    const adHoc = await f.ops.database.query({
      databaseId: f.db,
      view: { type: "table", config: { sorts: [{ propertyId: "Name" }] } },
      window: { offset: 0, limit: 2 },
    });
    expect(ids(adHoc)).toEqual(["Plan", "review draft"]);
    expect(adHoc.hasMore).toBe(true);
    const rest = await f.ops.database.query({
      databaseId: f.db,
      view: { type: "table", config: { sorts: [{ propertyId: "Name" }] } },
      window: { offset: 2, limit: 2 },
    });
    expect(rest.hasMore).toBe(false);

    await f.ops.database.changeViews({
      databaseId: f.db,
      update: [{ view: "Open work", config: { sorts: [{ propertyId: "due" }] } }],
    });
    expect(
      (await f.ops.database.get({ id: f.db })).views.find((v) => v.id === view.id)!.config.sorts,
    ).toEqual([{ propertyId: f.due.id, direction: "asc" }]);

    await f.ops.database.addProperty({ databaseId: f.db, name: "status", type: "text", key: "s2" });
    await expect(
      f.ops.database.query({
        databaseId: f.db,
        view: { type: "table", config: { sorts: [{ propertyId: "STATUS" }] } },
      }),
    ).rejects.toMatchObject({ code: "invalid_input", message: expect.stringContaining("Several") });
    await expect(f.ops.database.query({ databaseId: f.db, viewId: "Nope" })).rejects.toMatchObject({
      code: "invalid_input",
      hint: expect.stringContaining("Open work"),
    });
  });

  it("writes rows by unique id with their body, in one undo step", async () => {
    const f = await fixture();
    await f.ops.database.addProperty({
      databaseId: f.db,
      name: "ID",
      type: "uniqueId",
      key: "ID",
      config: { prefix: "TSK" },
    });
    const written = await f.ops.database.writeRows({
      databaseId: f.db,
      rows: [
        { title: "With a body", values: { Status: "Done" }, markdown: "## Notes\n\nFirst.\n" },
        { id: "TSK-1", markdown: "Rewritten." },
        { id: "tsk-2", values: { Estimate: 5 } },
      ],
    });
    expect(written.rows.map((r) => [r.title, r.uniqueId, r.action])).toEqual([
      ["With a body", "TSK-5", "created"],
      ["Write intro", "TSK-1", "updated"],
      ["review draft", "TSK-2", "updated"],
    ]);
    const created = await f.ops.doc.get({ id: written.rows[0]!.id });
    expect(created.body?.markdown).toBe("## Notes\n\nFirst.\n");
    expect((await f.ops.doc.get({ id: f.rows[0]!.id })).body?.markdown).toBe("Rewritten.");

    await expect(
      f.ops.database.writeRows({ databaseId: f.db, rows: [{ id: "TSK-99", title: "x" }] }),
    ).rejects.toMatchObject({ code: "not_found" });

    await f.runtime.history.undo();
    expect(
      (await f.ops.doc.get({ id: written.rows[0]!.id, includeBody: false })).document.deletedAt,
    ).not.toBeNull();
    expect((await f.ops.doc.get({ id: f.rows[0]!.id })).body?.markdown).toBe("");
    expect(
      (await f.ops.doc.get({ id: f.rows[1]!.id, includeBody: false })).document.properties.Estimate,
    ).toBe(1);
  });

  it("rejects unknown references before writing anything", async () => {
    const f = await fixture();
    const before = (await f.ops.doc.listChildren({ workspaceId: WS, parentId: f.db })).entries
      .length;
    let error: unknown;
    try {
      await f.ops.database.writeRows({
        databaseId: f.db,
        rows: [{ title: "ok" }, { title: "bad", values: { Nope: 1 } }],
      });
    } catch (e) {
      error = e;
    }
    expect(String((error as Error).message)).toContain('No property "Nope"');
    expect((error as { hint?: string }).hint).toContain("Estimate");
    expect(
      (await f.ops.doc.listChildren({ workspaceId: WS, parentId: f.db })).entries,
    ).toHaveLength(before);
  });
});

describe("links in properties", () => {
  it("indexes [[links]] in properties and relation values, next to body links", async () => {
    const f = await fixture();
    const target = await f.ops.doc.create({ workspaceId: WS, title: "Target" });
    const note = await f.ops.doc.create({
      workspaceId: WS,
      title: "Note",
      properties: { related: "[[Target]]", tags: ["x"] },
    });
    const sources = async (id: string) =>
      (await f.ops.doc.backlinks({ id })).backlinks.map((b) => [
        b.source.title,
        b.sourceProperty ?? null,
      ]);
    expect(await sources(target.id)).toEqual([["Note", "related"]]);

    // A body save keeps property links; a property change keeps body links.
    await f.ops.doc.updateBody({ id: note.id, markdown: "See [[Target]]" });
    expect(
      (await sources(target.id)).sort((a, b) => String(a[1]).localeCompare(String(b[1]))),
    ).toEqual([
      ["Note", null],
      ["Note", "related"],
    ]);
    await f.ops.doc.setProperties({ id: note.id, unset: ["related"] });
    expect(await sources(target.id)).toEqual([["Note", null]]);

    // Relation values are links from the row to the related document.
    await f.ops.database.setValues({
      databaseId: f.db,
      rowIds: [f.rows[0]!.id],
      set: { [f.project.id]: [f.boreal.id] },
    });
    const fromRows = (await f.ops.doc.backlinks({ id: f.boreal.id })).backlinks.filter(
      (b) => b.source.id === f.rows[0]!.id,
    );
    expect(fromRows.map((b) => b.sourceProperty)).toEqual([f.project.key]);
    // Undo removes it again.
    await f.runtime.history.undo();
    expect(
      (await f.ops.doc.backlinks({ id: f.boreal.id })).backlinks.some(
        (b) => b.source.id === f.rows[0]!.id,
      ),
    ).toBe(false);
  });
});

describe("view config patches (LYD-249)", () => {
  it("updateView and query overrides keep the fields not given", async () => {
    const f = await fixture();
    const view = (await f.ops.database.get({ id: f.db })).views[0]!;
    const filter = {
      type: "condition" as const,
      propertyId: f.done.id,
      op: "eq" as const,
      value: false,
    };
    await f.ops.database.updateView({
      id: view.id,
      config: { filter, groupBy: { propertyId: f.status.id }, limit: 10 },
    });
    const updated = await f.ops.database.updateView({
      id: view.id,
      config: { sorts: [{ propertyId: f.estimate.id, direction: "desc" }] },
    });
    expect(updated.config).toMatchObject({
      filter,
      groupBy: { propertyId: f.status.id },
      limit: 10,
      sorts: [{ propertyId: f.estimate.id, direction: "desc" }],
    });

    // A query that overrides only the sorts still uses the saved filter.
    const r = await f.ops.database.query({
      databaseId: f.db,
      viewId: view.id,
      view: { type: "table", config: { sorts: [{ propertyId: f.estimate.id, direction: "asc" }] } },
    });
    expect(ids(r)).not.toContain("Ship it");

    // One undo step restores the previous config exactly.
    await f.runtime.history.undo();
    const back = (await f.ops.database.get({ id: f.db })).views[0]!;
    expect(back.config.sorts).toEqual([]);
    expect(back.config.filter).toEqual(filter);
  });
});

it("database.create ignores teamspaceId locally (LYD-245)", async () => {
  const { ops } = setup();
  const created = await ops.database.create({ workspaceId: WS, title: "T", teamspaceId: "ts_1" });
  const doc = await ops.doc.get({ id: created.database.id, includeBody: false });
  expect(doc.document).not.toHaveProperty("teamspaceId");
  expect(doc.document.parentId).toBeNull();
});

describe("row templates (LYD-209)", () => {
  it("are not rows of any view but stay documents and templates", async () => {
    const f = await fixture();
    const template = f.rows[3]!;
    await f.ops.database.update({ id: f.db, templateIds: [template.id] });
    const r = await f.ops.database.query({ databaseId: f.db });
    expect(ids(r)).not.toContain(template.title);
    expect(r.total).toBe(f.rows.length - 1);
    expect((await f.ops.database.listTemplates({ databaseId: f.db })).templates).toHaveLength(1);
    // Deleted templates drop out of the list; the id stays in the config for restore.
    await f.ops.doc.delete({ id: template.id });
    expect((await f.ops.database.listTemplates({ databaseId: f.db })).templates).toEqual([]);
    await f.runtime.history.undo();
    expect((await f.ops.database.listTemplates({ databaseId: f.db })).templates).toHaveLength(1);
  });
});
