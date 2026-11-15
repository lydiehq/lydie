import { describe, expect, it } from "bun:test";

import { parse as parseYaml } from "yaml";

import {
  databaseChangeViews,
  databaseCreate,
  databaseQuery,
  databaseUpdateView,
} from "../operations/database.ts";
import { fromBase, toBase, toBaseObject } from "./base.ts";
import type { BaseDefinition } from "./base.ts";
import { DatabaseConfig, ViewConfig, ViewConfigPatch } from "./entities.ts";
import type { FilterNode, PropertyInput, ViewInput } from "./entities.ts";
import { parseExpression, printExpression, refsIn } from "./expression.ts";
import { conditionExpr, exprCondition, fromBaseFilter, toBaseFilterRoot } from "./filters.ts";
import type { FilterMapping } from "./filters.ts";
import { operatorsFor } from "./types.ts";
import { checkValue, convertValue, fromFileValue, toFileValue } from "./values.ts";

const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`;
let next = 500;
const newId = () => id(next++);

const P = {
  title: { id: id(1), name: "Name", type: "title", key: "name", config: {} },
  status: {
    id: id(2),
    name: "Status",
    type: "status",
    key: "status",
    config: {
      options: [
        { id: id(20), name: "Todo", color: "gray", group: "todo" },
        { id: id(21), name: "Done", color: "green", group: "complete" },
      ],
    },
  },
  estimate: {
    id: id(3),
    name: "Estimate",
    type: "number",
    key: "estimate",
    config: { numberFormat: "number" },
  },
  due: { id: id(4), name: "Due", type: "date", key: "due", config: {} },
  tags: { id: id(5), name: "Tags", type: "multiSelect", key: "tags", config: { options: [] } },
  done: { id: id(6), name: "Done?", type: "checkbox", key: "done", config: {} },
  owner: { id: id(7), name: "Owner", type: "person", key: "owner", config: {} },
  project: {
    id: id(8),
    name: "Project",
    type: "relation",
    key: "project",
    config: {
      relation: { databaseId: id(90), twoWay: true, reversePropertyId: id(91), limit: "one" },
    },
  },
  ppu: {
    id: id(9),
    name: "Per unit",
    type: "formula",
    key: "ppu",
    config: { expression: "(price / age).toFixed(2)" },
  },
  hours: {
    id: id(10),
    name: "Project hours",
    type: "rollup",
    key: "project_hours",
    config: { rollup: { relationPropertyId: id(8), targetPropertyId: id(92), function: "sum" } },
  },
  created: { id: id(11), name: "Created", type: "createdTime", key: "ctime", config: {} },
} satisfies Record<string, PropertyInput>;
const properties = Object.values(P) as PropertyInput[];
const mapping: FilterMapping = { properties };

describe("expressions", () => {
  it.each([
    'if(price, price.toFixed(2) + " dollars")',
    "(price / age).toFixed(2)",
    'file.hasTag("book") && !file.inFolder("Required Reading")',
    'note["date-created"] == this.file.name',
    "list(type)[0].asFile().properties.icon",
    "[latitude, longitude]",
    'now() + "1 day" > file.mtime',
    "a - (b - c)",
    "-x.abs()",
    "values.reduce(acc + value, 0) / values.length",
  ])("parses and prints %s", (source) => {
    const printed = printExpression(parseExpression(source));
    expect(printExpression(parseExpression(printed))).toBe(printed);
    expect(parseExpression(printed)).toEqual(parseExpression(source));
  });

  it("prints canonically and finds references", () => {
    expect(printExpression(parseExpression("'a' + (1 * 2)"))).toBe('"a" + 1 * 2');
    expect(refsIn(parseExpression('note.a + b + file.name + formula["x y"]'))).toEqual([
      { ns: "note", name: "a" },
      { ns: "note", name: "b" },
      { ns: "file", name: "name" },
      { ns: "formula", name: "x y" },
    ]);
    expect(refsIn(parseExpression("tags.map(value.lower())"))).toEqual([
      { ns: "note", name: "tags" },
    ]);
    expect(() => parseExpression("a +")).toThrow();
    expect(() => parseExpression('"open')).toThrow();
  });
});

describe("filters", () => {
  const cases: [FilterNode, string][] = [
    [{ type: "condition", propertyId: P.status.id, op: "eq", value: "Done" }, 'status == "Done"'],
    [
      { type: "condition", propertyId: P.status.id, op: "in", value: ["Todo", "Done"] },
      '["Todo", "Done"].contains(status)',
    ],
    [
      { type: "condition", propertyId: P.tags.id, op: "in", value: ["a", "b"] },
      'tags.containsAny("a", "b")',
    ],
    [
      { type: "condition", propertyId: P.tags.id, op: "notContains", value: "a" },
      '!tags.contains("a")',
    ],
    [
      { type: "condition", propertyId: P.title.id, op: "startsWith", value: "Re" },
      'file.name.startsWith("Re")',
    ],
    [{ type: "condition", propertyId: P.estimate.id, op: "gte", value: 3 }, "estimate >= 3"],
    [
      { type: "condition", propertyId: P.estimate.id, op: "between", value: [1, 5] },
      "estimate >= 1 && estimate <= 5",
    ],
    [
      {
        type: "condition",
        propertyId: P.due.id,
        op: "lt",
        value: { relative: "today", amount: 7, unit: "day" },
      },
      'due.date() < today() + "7d"',
    ],
    [
      { type: "condition", propertyId: P.due.id, op: "eq", value: "2026-01-05" },
      'due.date() == date("2026-01-05")',
    ],
    [
      {
        type: "condition",
        propertyId: P.created.id,
        op: "gt",
        value: { relative: "now", amount: -2, unit: "hour" },
      },
      'file.ctime > now() - "2h"',
    ],
    [{ type: "condition", propertyId: P.due.id, op: "isEmpty" }, "due.isEmpty()"],
    [{ type: "condition", propertyId: P.due.id, op: "isNotEmpty" }, "!due.isEmpty()"],
    [{ type: "condition", propertyId: P.done.id, op: "eq", value: true }, "done == true"],
    [
      { type: "condition", propertyId: P.owner.id, op: "contains", value: { me: true } },
      'owner.contains("@me")',
    ],
    [{ type: "condition", propertyId: P.ppu.id, op: "gt", value: 5 }, "formula.ppu > 5"],
  ];

  it.each(cases)("writes and reads %j", (node, statement) => {
    const written = toBaseFilterRoot(node, mapping);
    expect(written).toEqual({ and: [statement] });
    const read = fromBaseFilter(written, mapping);
    expect(read).toEqual({ type: "group", combinator: "and", children: [node] });
  });

  it("maps relations through links and keeps unknown statements", () => {
    const withLinks: FilterMapping = {
      properties,
      linkFor: (x) => (x === id(77) ? "Projects/Atlas" : null),
      idFor: (l) => (l === "Projects/Atlas" ? id(77) : null),
    };
    const node: FilterNode = {
      type: "condition",
      propertyId: P.project.id,
      op: "contains",
      value: id(77),
    };
    const e = conditionExpr(node, withLinks)!;
    expect(printExpression(e)).toBe('project.contains(link("Projects/Atlas"))');
    expect(exprCondition(e, withLinks)).toEqual(node);
    expect(fromBaseFilter({ or: ['file.hasTag("x")', "price > 2.1"] }, mapping)).toEqual({
      type: "group",
      combinator: "or",
      children: [
        { type: "expression", expression: 'file.hasTag("x")' },
        { type: "expression", expression: "price > 2.1" },
      ],
    });
  });

  it("offers operators per type", () => {
    expect(operatorsFor("checkbox")).toEqual(["eq"]);
    expect(operatorsFor("multiSelect")).toContain("in");
    expect(operatorsFor("date")).toContain("between");
  });
});

function definition(): BaseDefinition {
  const views: ViewInput[] = [
    {
      id: id(30),
      name: "All tasks",
      type: "table",
      config: ViewConfig.parse({
        filter: {
          type: "group",
          combinator: "and",
          children: [
            { type: "condition", propertyId: P.status.id, op: "neq", value: "Done" },
            {
              type: "group",
              combinator: "or",
              children: [
                { type: "condition", propertyId: P.estimate.id, op: "gt", value: 2 },
                { type: "condition", propertyId: P.owner.id, op: "contains", value: { me: true } },
              ],
            },
          ],
        },
        sorts: [{ propertyId: P.due.id, direction: "desc" }, { propertyId: P.title.id }],
        columns: [
          { propertyId: P.title.id, width: 280 },
          { propertyId: P.status.id },
          { propertyId: P.created.id, visible: false },
        ],
        summaries: { [P.estimate.id]: "Sum" },
        layout: { rowHeight: "medium", wrapCells: true },
        extra: { someone: { keep: [1, 2] } },
      }),
    },
    {
      id: id(31),
      name: "Board",
      type: "board",
      config: ViewConfig.parse({
        groupBy: { propertyId: P.status.id, order: ["Todo", "Done", null], hideEmpty: true },
        subGroupBy: { propertyId: P.owner.id },
        layout: { cover: { type: "pageContent" }, cardSize: 240, colorColumns: true },
      }),
    },
    {
      id: id(32),
      name: "Calendar",
      type: "calendar",
      config: ViewConfig.parse({ layout: { calendarPropertyId: P.due.id, calendarMode: "month" } }),
    },
    { id: id(33), name: "Gallery", type: "gallery", config: ViewConfig.parse({ limit: 50 }) },
    {
      id: id(34),
      name: "List",
      type: "list",
      config: ViewConfig.parse({ layout: { markers: "number" } }),
    },
  ];
  return {
    id: id(99),
    config: DatabaseConfig.parse({
      filter: { type: "condition", propertyId: P.done.id, op: "eq", value: false },
      templateIds: [id(60)],
      extra: {
        summaries: { customAverage: "values.mean().round(3)" },
        properties: { "file.ext": { displayName: "Extension" } },
      },
    }),
    properties,
    views,
  };
}

describe(".base files", () => {
  const resolveProperty = (x: string) =>
    x === id(92) ? { type: "number" as const, key: "hours" } : null;

  it("writes native Bases keys and a lydie block", () => {
    const base = toBaseObject(definition(), { folder: "Projects/Tasks", resolveProperty });
    expect(base.filters).toEqual({ and: ['file.inFolder("Projects/Tasks")', "done == false"] });
    expect(base.formulas).toEqual({
      ppu: "(price / age).toFixed(2)",
      project_hours:
        'list(project).map(value.asFile().properties["hours"]).filter(!value.isEmpty()).reduce(acc + value, 0)',
    });
    expect((base.properties as Record<string, unknown>)["note.status"]).toEqual({
      displayName: "Status",
    });
    expect((base.properties as Record<string, unknown>)["file.ext"]).toEqual({
      displayName: "Extension",
    });
    const [table, board, calendar, gallery, list] = base.views as Record<string, unknown>[];
    expect(table).toMatchObject({
      type: "table",
      name: "All tasks",
      filters: { and: ['status != "Done"', { or: ["estimate > 2", 'owner.contains("@me")'] }] },
      order: [
        "file.name",
        "note.status",
        "note.estimate",
        "note.due",
        "note.tags",
        "note.done",
        "note.owner",
        "note.project",
        "formula.ppu",
        "formula.project_hours",
      ],
      sort: [
        { property: "note.due", direction: "DESC" },
        { property: "file.name", direction: "ASC" },
      ],
      columnSize: { "file.name": 280 },
      summaries: { "note.estimate": "Sum" },
      rowHeight: "medium",
      someone: { keep: [1, 2] },
    });
    expect(board).toMatchObject({
      type: "kanban",
      groupBy: { property: "note.status", direction: "ASC" },
      groupOrder: ["Todo", "Done", null],
      cardSize: 240,
    });
    expect(calendar).toMatchObject({ type: "table", lydie: { type: "calendar" } });
    expect(gallery).toMatchObject({ type: "cards", limit: 50 });
    expect(list).toMatchObject({ type: "list", markers: "number" });
    expect(base.summaries).toEqual({ customAverage: "values.mean().round(3)" });
  });

  it("round-trips a definition exactly", () => {
    const def = definition();
    const text = toBase(def, { folder: "Projects/Tasks", resolveProperty });
    const read = fromBase(text, { newId });
    expect(read.warnings).toEqual([]);
    expect(read.id).toBe(def.id);
    expect(read.folder).toBe("Projects/Tasks");
    expect(read.definition.config).toEqual(def.config);
    expect(read.definition.views).toEqual([...def.views]);
    // Properties come back in schema order with identical configs.
    expect(read.definition.properties).toEqual([...def.properties]);
    // Writing again gives the same file.
    expect(
      toBase({ id: def.id, ...read.definition }, { folder: "Projects/Tasks", resolveProperty }),
    ).toBe(text);
  });

  it("prefers edits made in Obsidian over the lydie block", () => {
    const text = toBase(definition(), { folder: "Tasks" });
    const yaml = parseYaml(text) as { views: Record<string, unknown>[] };
    yaml.views[0]!.filters = { and: ['status == "Todo"', "file.hasLink(this.file)"] };
    yaml.views[0]!.order = ["file.name", "note.estimate", "note.brandNew"];
    yaml.views[0]!.name = "Renamed in Obsidian";
    const read = fromBaseObjectText(yaml);
    const view = read.definition.views[0]!;
    expect(view.id).toBe(id(30));
    expect(view.name).toBe("Renamed in Obsidian");
    expect(view.config.filter).toEqual({
      type: "group",
      combinator: "and",
      children: [
        { type: "condition", propertyId: P.status.id, op: "eq", value: "Todo" },
        { type: "expression", expression: "file.hasLink(this.file)" },
      ],
    });
    const brandNew = read.definition.properties.find((p) => p.key === "brandNew")!;
    expect(brandNew).toMatchObject({ type: "text", name: "brandNew" });
    expect(view.config.columns.filter((c) => c.visible).map((c) => c.propertyId)).toEqual([
      P.title.id,
      P.estimate.id,
      brandNew.id,
    ]);
    // Columns not in `order` are hidden, as in Bases.
    expect(view.config.columns.find((c) => c.propertyId === P.status.id)?.visible).toBe(false);
  });

  it("reads a base Lydie never wrote", () => {
    const text = `filters:
  and:
    - file.inFolder("Reading")
    - '!file.tags.contains("daily")'
formulas:
  pages_left: 'pages - read'
properties:
  file.name:
    displayName: Book
  note.author:
    displayName: Author
views:
  - type: table
    name: Shelf
    order:
      - file.name
      - author
      - rating
      - formula.pages_left
      - file.ext
    sort:
      - property: rating
        direction: DESC
    columnSize:
      file.name: 287
  - type: map
    name: Places
    coordinates: note.coordinates
    defaultZoom: 12
`;
    const read = fromBase(text, { newId, types: { rating: "number" } });
    expect(read.folder).toBe("Reading");
    expect(read.id).toBeNull();
    expect(read.warnings).toEqual(['Unsupported property "file.ext"']);
    const byKey = Object.fromEntries(read.definition.properties.map((p) => [p.key, p]));
    expect(byKey.name).toMatchObject({ type: "title", name: "Book" });
    expect(byKey.author).toMatchObject({ type: "text", name: "Author" });
    expect(byKey.rating).toMatchObject({ type: "number" });
    expect(byKey.pages_left).toMatchObject({
      type: "formula",
      config: { expression: "pages - read" },
    });
    expect(read.definition.config.filter).toEqual({
      type: "group",
      combinator: "and",
      children: [{ type: "expression", expression: '!file.tags.contains("daily")' }],
    });
    const [shelf, places] = read.definition.views;
    expect(shelf!.config.sorts).toEqual([{ propertyId: byKey.rating!.id, direction: "desc" }]);
    expect(shelf!.config.columns[0]).toEqual({
      propertyId: byKey.name!.id,
      visible: true,
      width: 287,
    });
    expect(places!.type).toBe("table");
    expect(places!.config.extra).toEqual({
      type: "map",
      coordinates: "note.coordinates",
      defaultZoom: 12,
    });
    // Written back: the map view keeps its type and settings.
    const again = parseYaml(
      toBase({ id: id(98), ...read.definition }, { folder: read.folder }),
    ) as { views: Record<string, unknown>[] };
    expect(again.views[1]).toMatchObject({
      type: "map",
      name: "Places",
      coordinates: "note.coordinates",
      defaultZoom: 12,
    });
  });

  it("keeps ids through `existing` when the lydie block is gone", () => {
    const def = definition();
    const yaml = parseYaml(toBase(def)) as Record<string, unknown>;
    delete yaml.lydie;
    for (const v of yaml.views as Record<string, unknown>[]) delete v.lydie;
    const read = fromBaseObjectText(yaml, {
      existing: { properties: def.properties, views: def.views },
    });
    expect(read.definition.views.map((v) => v.id)).toEqual(def.views.map((v) => v.id));
    const status = read.definition.properties.find((p) => p.key === "status")!;
    expect(status).toMatchObject({ id: P.status.id, type: "status" });
  });

  it("survives invalid YAML", () => {
    const read = fromBase("views: [", { newId });
    expect(read.warnings[0]).toMatch(/Invalid YAML/);
    expect(read.definition.properties.map((p) => p.type)).toEqual(["title"]);
  });
});

function fromBaseObjectText(yaml: unknown, extra: Partial<Parameters<typeof fromBase>[1]> = {}) {
  return fromBase(JSON.stringify(yaml), { newId, ...extra });
}

describe("values", () => {
  it("checks values by type", () => {
    expect(checkValue({ type: "select" }, "  Done ")).toEqual({ ok: true, value: "Done" });
    expect(checkValue({ type: "multiSelect" }, "a")).toEqual({ ok: true, value: ["a"] });
    expect(checkValue({ type: "multiSelect" }, ["a", "a", " "])).toEqual({
      ok: true,
      value: ["a"],
    });
    expect(checkValue({ type: "number" }, "12.5")).toEqual({ ok: true, value: 12.5 });
    expect(checkValue({ type: "number" }, "x").ok).toBe(false);
    expect(checkValue({ type: "date" }, "2026-01-05T10:00").ok).toBe(true);
    expect(checkValue({ type: "date" }, "2026-01-05/2026-01-07").ok).toBe(false);
    expect(checkValue({ type: "date", config: { range: true } }, "2026-01-05/2026-01-07").ok).toBe(
      true,
    );
    expect(checkValue({ type: "relation" }, ["nope"]).ok).toBe(false);
    expect(
      checkValue(
        {
          type: "relation",
          config: {
            relation: { databaseId: id(1), twoWay: false, reversePropertyId: null, limit: "one" },
          },
        },
        [id(1), id(2)],
      ),
    ).toEqual({ ok: true, value: [id(1)] });
    expect(checkValue({ type: "formula" }, 1).ok).toBe(false);
  });

  it("converts between types", () => {
    const titleOf = (x: string) => (x === id(1) ? "Atlas" : null);
    expect(convertValue("a, b ,c", "text", "multiSelect")).toEqual(["a", "b", "c"]);
    expect(convertValue(["a", "b"], "multiSelect", "text")).toBe("a, b");
    expect(convertValue([id(1)], "relation", "text", { titleOf })).toBe("Atlas");
    expect(convertValue("about 12.5 hours", "text", "number")).toBe(12.5);
    expect(convertValue("Yes", "text", "checkbox")).toBe(true);
    expect(convertValue(0, "number", "checkbox")).toBe(false);
    expect(convertValue(["a", "b"], "multiSelect", "select")).toBe("a");
    expect(convertValue("2026-03-04 at noon", "text", "date")).toBe("2026-03-04");
    expect(convertValue(true, "checkbox", "text")).toBe("true");
    expect(convertValue("x", "text", "relation")).toBeNull();
  });

  it("maps relation and file values to links on disk and back", () => {
    const p = { type: "relation" as const };
    const links = {
      linkFor: (x: string) => (x === id(1) ? "Projects/Atlas" : null),
      idFor: (t: string) => (t === "Projects/Atlas" ? id(1) : null),
    };
    expect(toFileValue(p, [id(1), id(2)], links)).toEqual(["[[Projects/Atlas]]", id(2)]);
    expect(fromFileValue(p, ["[[Projects/Atlas|Atlas]]", "[[Gone]]"], links)).toEqual([
      id(1),
      "[[Gone]]",
    ]);
    expect(fromFileValue({ type: "multiSelect" }, "solo")).toEqual(["solo"]);
  });
});

describe("view config patches (LYD-249)", () => {
  const ID = id(900);
  it("keeps only the fields given, with no defaults filled in", () => {
    expect(ViewConfigPatch.parse({})).toEqual({});
    expect(ViewConfigPatch.parse({ sorts: [] })).toEqual({ sorts: [] });
    expect(ViewConfigPatch.parse({ filter: null, layout: { cardSize: 200 } })).toEqual({
      filter: null,
      layout: { cardSize: 200 },
    });
    expect(databaseUpdateView.input.parse({ id: ID, config: { sorts: [] } })).toEqual({
      id: ID,
      config: { sorts: [] },
    });
    expect(
      databaseQuery.input.parse({ databaseId: ID, view: { config: { limit: 5 } } }).view,
    ).toEqual({ type: "table", config: { limit: 5 } });
    const changed = databaseChangeViews.input.parse({
      databaseId: ID,
      update: [{ view: "Table", config: { columns: [] } }],
    });
    expect(changed.update?.[0]?.config).toEqual({ columns: [] });
  });

  it("has exactly ViewConfig's fields", () => {
    expect(Object.keys(ViewConfigPatch.shape).sort()).toEqual(Object.keys(ViewConfig.shape).sort());
  });
});

it("database.create accepts a teamspace (LYD-245)", () => {
  const input = { workspaceId: "ws", teamspaceId: "ts_1" };
  expect(databaseCreate.input.parse(input).teamspaceId).toBe("ts_1");
  expect(databaseCreate.input.parse({ workspaceId: "ws" }).teamspaceId).toBeUndefined();
  expect(databaseCreate.input.safeParse({ workspaceId: "ws", teamspaceId: "" }).success).toBe(
    false,
  );
});
