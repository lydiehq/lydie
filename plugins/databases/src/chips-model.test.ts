import { describe, expect, test } from "bun:test";

import type { DatabaseProperty, FilterCondition, FilterNode } from "@lydie/plugin-api/databases";

import {
  addChip,
  chipOperatorOf,
  chipOperators,
  filterChips,
  removeChip,
  replaceChip,
  valuesOf,
  withChipOperator,
  withValues,
} from "./chips-model.ts";
import { defaultValue } from "./filter-model.ts";

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
const status = prop("P1", "Status", "status");
const tags = prop("P2", "Tags", "multiSelect");
const points = prop("P3", "Points", "number");
const done = prop("P4", "Done", "checkbox");
const due = prop("P5", "Due", "date");
const properties = [status, tags, points, done, due];

const cond = (propertyId: string, op: FilterCondition["op"], value?: unknown): FilterCondition =>
  ({
    type: "condition",
    propertyId,
    op,
    ...(value !== undefined ? { value } : {}),
  }) as FilterCondition;

describe("filter chips", () => {
  test("no filter, no chips", () => {
    expect(filterChips(null, properties)).toEqual({ kind: "none" });
    expect(filterChips({ type: "group", combinator: "and", children: [] }, properties)).toEqual({
      kind: "none",
    });
  });

  test("conditions joined by and read as sentences", () => {
    const filter: FilterNode = {
      type: "group",
      combinator: "and",
      children: [
        cond("P1", "in", ["Todo", "Doing"]),
        cond("P3", "gt", 5),
        cond("P4", "eq", false),
        cond("P2", "isEmpty"),
        cond("P5", "lt", { relative: "today" }),
      ],
    };
    const chips = filterChips(filter, properties);
    expect(chips.kind).toBe("simple");
    if (chips.kind !== "simple") return;
    expect(chips.chips.map((c) => [c.propertyLabel, c.opLabel, c.valueLabel])).toEqual([
      ["Status", "is any of", "Todo, Doing"],
      ["Points", ">", "5"],
      ["Done", "is", "Unchecked"],
      ["Tags", "is empty", null],
      ["Due", "is before", "Today"],
    ]);
  });

  test("a single condition (not a group) is one chip", () => {
    const chips = filterChips(cond("P1", "eq", "Todo"), properties);
    expect(chips.kind === "simple" && chips.chips[0]?.valueLabel).toBe("Todo");
  });

  test("or-groups and nested groups go to the advanced builder", () => {
    const or: FilterNode = {
      type: "group",
      combinator: "or",
      children: [cond("P1", "eq", "Todo"), cond("P3", "gt", 1)],
    };
    expect(filterChips(or, properties)).toEqual({ kind: "advanced", rules: 2 });
    const nested: FilterNode = {
      type: "group",
      combinator: "and",
      children: [cond("P1", "eq", "Todo"), or],
    };
    expect(filterChips(nested, properties)).toEqual({ kind: "advanced", rules: 3 });
  });

  test("a deleted property still shows, so it can be removed", () => {
    const chips = filterChips(cond("gone", "eq", "x"), properties);
    expect(chips.kind === "simple" && chips.chips[0]?.propertyLabel).toBe("Deleted property");
  });
});

describe("operators follow the number of values", () => {
  test("is ⇄ is any of", () => {
    const one = withValues(cond("P1", "eq", "Todo"), "status", ["Todo", "Doing"]);
    expect(one).toMatchObject({ op: "in", value: ["Todo", "Doing"] });
    const back = withValues(one, "status", ["Doing"]);
    expect(back).toMatchObject({ op: "eq", value: "Doing" });
  });

  test("is not ⇄ is none of", () => {
    expect(withValues(cond("P1", "neq", "A"), "status", ["A", "B"])).toMatchObject({
      op: "notIn",
    });
    expect(withValues(cond("P1", "notIn", ["A", "B"]), "status", ["A"])).toMatchObject({
      op: "neq",
      value: "A",
    });
  });

  test("lists: contains ⇄ contains any of", () => {
    expect(withValues(cond("P2", "contains", "a"), "multiSelect", ["a", "b"])).toMatchObject({
      op: "in",
    });
    expect(withValues(cond("P2", "in", ["a", "b"]), "multiSelect", ["b"])).toMatchObject({
      op: "contains",
      value: "b",
    });
  });

  test("a one-value `in` from the builder reads as the single form", () => {
    const chips = filterChips(cond("P1", "in", ["Todo"]), properties);
    expect(chips.kind === "simple" && chips.chips[0]?.opLabel).toBe("is");
  });

  test("choice operators are offered as pairs", () => {
    expect(chipOperators("status").map((o) => o.label)).toEqual([
      "is",
      "is not",
      "is empty",
      "is not empty",
    ]);
    expect(chipOperators("multiSelect").map((o) => o.label)).toEqual([
      "contains",
      "does not contain",
      "is empty",
      "is not empty",
    ]);
    expect(chipOperatorOf(cond("P1", "in", ["a", "b"]), "status")).toBe("positive");
    expect(chipOperatorOf(cond("P3", "gt", 1), "number")).toBe("gt");
  });

  test("choosing an operator keeps the values that still fit", () => {
    const c = cond("P1", "in", ["A", "B"]);
    expect(
      withChipOperator(c, "status", "negative", (op) => defaultValue("status", op)),
    ).toMatchObject({
      op: "notIn",
      value: ["A", "B"],
    });
    const empty = withChipOperator(c, "status", "isEmpty", (op) => defaultValue("status", op));
    expect(empty).toEqual({ type: "condition", propertyId: "P1", op: "isEmpty" });
    const n = withChipOperator(cond("P3", "gt", 4), "number", "lte", (op) =>
      defaultValue("number", op),
    );
    expect(n).toMatchObject({ op: "lte", value: 4 });
  });

  test("valuesOf reads scalars and lists", () => {
    expect(valuesOf(cond("P1", "eq", ""))).toEqual([]);
    expect(valuesOf(cond("P1", "eq", "A"))).toEqual(["A"]);
    expect(valuesOf(cond("P1", "in", ["A", "B"]))).toEqual(["A", "B"]);
  });
});

describe("chip edits", () => {
  test("add joins with and, replace and remove by index", () => {
    const lone: FilterNode = { type: "group", combinator: "or", children: [cond("P1", "eq", "A")] };
    const added = addChip(lone, cond("P3", "gt", 1));
    expect(added).toMatchObject({ combinator: "and" });
    expect(filterChips(added, properties).kind).toBe("simple");
    const replaced = replaceChip(added, 1, cond("P3", "isEmpty", 3));
    expect(replaced?.type === "group" && replaced.children[1]).toEqual(cond("P3", "isEmpty"));
    expect(removeChip(removeChip(added, 0), 0)).toBeNull();
  });
});
