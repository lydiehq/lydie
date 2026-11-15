import { describe, expect, test } from "bun:test";

import type { DatabaseProperty, ViewRow } from "@lydie/plugin-api/databases";

import { cellText, fillLine, parseCell } from "./cell-values.ts";

const T = "2026-11-13T00:00:00.000Z";
const ROW = "019b76da-a816-46a6-355c-4218d3345eac";
const prop = (
  id: string,
  type: DatabaseProperty["type"],
  config: DatabaseProperty["config"] = {},
): DatabaseProperty => ({
  id,
  workspaceId: "ws",
  databaseId: "db",
  name: id,
  type,
  key: id,
  config,
  sortKey: id,
  createdAt: T,
  updatedAt: T,
  deletedAt: null,
});
const row = (title: string, properties: Record<string, unknown> = {}): ViewRow => ({
  id: crypto.randomUUID(),
  title,
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

const title = prop("Name", "title");
const points = prop("Points", "number");
const status = prop("Status", "select", {
  options: [{ id: "o1", name: "In progress", color: "blue" }],
});
const tags = prop("Tags", "multiSelect", { options: [{ id: "o2", name: "Red", color: "red" }] });
const due = prop("Due", "date");
const done = prop("Done", "checkbox");
const project = prop("Project", "relation", {
  relation: { databaseId: "db2", twoWay: false, reversePropertyId: null, limit: "one" },
});
const owner = prop("Owner", "person");
const cost = prop("Cost", "formula");

describe("pasted text by type", () => {
  test("numbers, dates, checkboxes, options", () => {
    expect(parseCell(points, "$1,234.50")).toEqual({ value: 1234.5 });
    expect(parseCell(points, "lots")).toBeNull();
    expect(parseCell(points, " ")).toEqual({ value: null });
    expect(parseCell(due, "Nov 13, 2026")).toEqual({ value: "2026-11-13" });
    // A range into a column without ranges keeps the start.
    expect(parseCell(due, "Nov 1, 2026 → Nov 3, 2026")).toEqual({ value: "2026-11-01" });
    expect(parseCell({ ...due, config: { range: true } }, "Nov 1, 2026 → Nov 3, 2026")).toEqual({
      value: "2026-11-01/2026-11-03",
    });
    expect(parseCell(done, "Yes")).toEqual({ value: true });
    expect(parseCell(done, "perhaps")).toBeNull();
    expect(parseCell(status, "in progress")).toEqual({ value: "In progress" });
    expect(parseCell(status, "Blocked")).toEqual({ value: "Blocked" });
    expect(parseCell(tags, "red, Blue")).toEqual({ value: ["Red", "Blue"] });
  });

  test("relations by id or title, people by name, computed columns never", () => {
    expect(parseCell(project, ROW)).toEqual({ value: [ROW] });
    const relation = (_p: DatabaseProperty, t: string) => (t === "Apollo" ? ROW : null);
    expect(parseCell(project, "Apollo", { relation })).toEqual({ value: [ROW] });
    expect(parseCell(project, "Nobody", { relation })).toBeNull();
    const person = (t: string) => (t === "Ana" ? "u1" : null);
    expect(parseCell(owner, "Ana", { person })).toEqual({ value: ["u1"] });
    expect(parseCell(owner, "Zed", { person })).toBeNull();
    expect(parseCell(cost, "12")).toBeNull();
    expect(parseCell(title, "x")).toBeNull();
  });

  test("copy text round-trips through paste", () => {
    const formatted = { ...points, config: { numberFormat: "currency" as const } };
    const r = row("A", { Points: 1234.5, Due: "2026-11-13", Done: true });
    expect(parseCell(formatted, cellText(formatted, r))).toEqual({ value: 1234.5 });
    expect(parseCell(due, cellText(due, r))).toEqual({ value: "2026-11-13" });
    expect(parseCell(done, cellText(done, r))).toEqual({ value: true });
  });
});

describe("fill", () => {
  test("down a column: series for numbers and dates, copies otherwise", () => {
    const rows = [
      row("Week 1", { Points: 2, Due: "2026-01-01" }),
      row("Week 2", { Points: 4, Due: "2026-01-08" }),
    ];
    const cells = (p: DatabaseProperty) => rows.map((r) => ({ property: p, row: r }));
    expect(fillLine(cells(points), [points, points], false)).toEqual([
      { kind: "value", value: 6 },
      { kind: "value", value: 8 },
    ]);
    expect(fillLine(cells(due), [due], false)).toEqual([{ kind: "value", value: "2026-01-15" }]);
    expect(fillLine(cells(title), [title], false)).toEqual([{ kind: "title", title: "Week 3" }]);
    expect(
      fillLine(
        [{ property: status, row: row("x", { Status: "In progress" }) }],
        [status, status],
        false,
      ),
    ).toEqual([
      { kind: "value", value: "In progress" },
      { kind: "value", value: "In progress" },
    ]);
    expect(fillLine(cells(points), [cost], false)).toEqual([{ kind: "skip" }]);
  });

  test("across columns the text is read for each column's type", () => {
    const r = row("x", { Points: 5 });
    expect(fillLine([{ property: points, row: r }], [status, done], false)).toEqual([
      { kind: "value", value: "5" },
      { kind: "skip" },
    ]);
  });

  test("fill down / right (Mod+D / Mod+R): one source cell is copied, never a series", () => {
    const r = row("Week 1", { Points: 5, Due: "2026-01-01" });
    expect(fillLine([{ property: points, row: r }], [points, points], false)).toEqual([
      { kind: "value", value: 5 },
      { kind: "value", value: 5 },
    ]);
    expect(fillLine([{ property: title, row: r }], [title], false)).toEqual([
      { kind: "title", title: "Week 1" },
    ]);
    // Right across types: converted where it fits, computed columns skipped.
    expect(fillLine([{ property: due, row: r }], [title, cost, points], false)).toEqual([
      { kind: "title", title: "2026-01-01" },
      { kind: "skip" },
      { kind: "skip" },
    ]);
  });
});
