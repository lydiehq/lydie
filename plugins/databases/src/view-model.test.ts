import { describe, expect, test } from "bun:test";

import type { DatabaseDefinition, DatabaseProperty, ViewRow } from "@lydie/plugin-api/databases";

import {
  allColumns,
  movedColumns,
  summarize,
  tableItems,
  visibleColumns,
  withColumn,
} from "./view-model.ts";
import { prefixSums, visibleColumns as columnRange, visibleRange, windowFor } from "./virtual.ts";

const T = "2026-11-13T00:00:00.000Z";
const prop = (id: string, name: string, type: DatabaseProperty["type"]): DatabaseProperty => ({
  id,
  workspaceId: "ws",
  databaseId: "db",
  name,
  type,
  key: name,
  config: {},
  sortKey: id,
  createdAt: T,
  updatedAt: T,
  deletedAt: null,
});
const title = prop("P0", "Name", "title");
const num = prop("P1", "Points", "number");
const done = prop("P2", "Done", "checkbox");
const due = prop("P3", "Due", "date");

const definition = {
  database: { id: "db" },
  properties: [num, title, done, due],
  views: [],
} as unknown as DatabaseDefinition;
const view = (columns: { propertyId: string; visible: boolean; width?: number }[]) =>
  ({ id: "v", config: { columns } }) as unknown as Parameters<typeof allColumns>[1];

const row = (properties: Record<string, unknown>): ViewRow => ({
  id: crypto.randomUUID(),
  title: "r",
  sortKey: "a",
  properties,
  createdAt: T,
  updatedAt: T,
  createdBy: null,
  updatedBy: null,
  group: null,
  subGroup: null,
  computed: {},
});

describe("columns", () => {
  test("title first, listed order, unlisted after, hidden kept out of the visible ones", () => {
    const v = view([
      { propertyId: "P2", visible: true, width: 90 },
      { propertyId: "P1", visible: false },
    ]);
    expect(allColumns(definition, v).map((c) => c.property.name)).toEqual([
      "Name",
      "Done",
      "Points",
      "Due",
    ]);
    expect(visibleColumns(definition, v).map((c) => c.property.name)).toEqual([
      "Name",
      "Done",
      "Due",
    ]);
    expect(allColumns(definition, v)[1]!.width).toBe(90);
  });

  test("hiding, resizing and moving keep every column listed", () => {
    const columns = allColumns(definition, view([]));
    expect(
      withColumn(columns, "P1", { visible: false }).find((c) => c.propertyId === "P1"),
    ).toEqual({
      propertyId: "P1",
      visible: false,
    });
    expect(movedColumns(columns, "P3", "P1").map((c) => c.propertyId)).toEqual([
      "P0",
      "P3",
      "P1",
      "P2",
    ]);
    expect(movedColumns(columns, "P1", null).map((c) => c.propertyId)).toEqual([
      "P0",
      "P2",
      "P3",
      "P1",
    ]);
  });
});

describe("table items", () => {
  test("ungrouped: every row, then New", () => {
    const items = tableItems(3, [], false, []);
    expect(items.map((i) => i.kind)).toEqual(["row", "row", "row", "add"]);
  });

  test("grouped: header, rows, New per group; collapsed groups hide their rows", () => {
    const groups = [
      { key: "a", subKey: null, count: 2, start: 0 },
      { key: null, subKey: null, count: 1, start: 2 },
    ];
    const items = tableItems(3, groups, true, [null]);
    expect(items.map((i) => (i.kind === "row" ? i.position : i.kind))).toEqual([
      "group",
      0,
      1,
      "add",
      "group",
    ]);
  });
});

describe("summaries", () => {
  const rows = [
    row({ Points: 3, Done: true, Due: "2026-01-05" }),
    row({ Points: 5 }),
    row({ Due: "2025-12-01/2026-01-01" }),
  ];
  test("numbers, checkboxes, counts and dates", () => {
    expect(summarize("Sum", num, rows)).toBe("8");
    expect(summarize("Average", num, rows)).toBe("4");
    expect(summarize("Median", num, rows)).toBe("4");
    expect(summarize("Range", num, rows)).toBe("2");
    expect(summarize("Empty", num, rows)).toBe("1");
    expect(summarize("Count", num, rows)).toBe("3");
    expect(summarize("PercentChecked", done, rows)).toBe("33%");
    expect(summarize("Earliest", due, rows)).toBe("Dec 1, 2025");
    expect(summarize("Latest", due, rows)).toBe("Jan 5, 2026");
  });
});

describe("windowing", () => {
  test("visible range with overscan", () => {
    expect(visibleRange(0, 340, 34, 100, 2)).toEqual({ start: 0, end: 12 });
    expect(visibleRange(3400, 340, 34, 100, 2)).toEqual({ start: 98, end: 100 });
  });

  test("windows align to pages and stay within the contract's limit", () => {
    expect(windowFor(0, 20)).toEqual({ offset: 0, limit: 200 });
    expect(windowFor(250, 280)).toEqual({ offset: 100, limit: 300 });
    expect(windowFor(4990, 5000, 5000)).toEqual({ offset: 4800, limit: 200 });
    expect(windowFor(0, 5000).limit).toBe(1000);
  });

  test("visible columns from prefix sums", () => {
    const offsets = prefixSums([100, 100, 100, 100, 100]);
    expect(columnRange(offsets, 150, 120, 0)).toEqual({ start: 1, end: 3 });
  });
});
