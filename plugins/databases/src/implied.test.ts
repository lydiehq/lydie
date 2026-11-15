import { describe, expect, test } from "bun:test";

import type { DatabaseProperty, FilterNode } from "@lydie/plugin-api/databases";

import { groupedValues, groupMoveValues, impliedValues } from "./implied.ts";

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
const owner = prop("P3", "Owner", "person");
const formula = prop("P4", "Late", "formula");
const properties = [status, tags, owner, formula];

describe("values a personal view implies for a new page", () => {
  test("and-joined conditions that pin one value", () => {
    const filter: FilterNode = {
      type: "group",
      combinator: "and",
      children: [
        { type: "condition", propertyId: "P1", op: "eq", value: "Todo" },
        { type: "condition", propertyId: "P2", op: "in", value: ["a"] },
        { type: "condition", propertyId: "P3", op: "contains", value: { me: true } },
        { type: "condition", propertyId: "P4", op: "eq", value: "x" },
      ],
    };
    expect(impliedValues(filter, properties, "U1")).toEqual({
      P1: "Todo",
      P2: ["a"],
      P3: ["U1"],
    });
    expect(impliedValues(filter, properties, null)).toEqual({ P1: "Todo", P2: ["a"] });
  });

  test("or-groups and several values imply nothing", () => {
    const or: FilterNode = {
      type: "group",
      combinator: "or",
      children: [{ type: "condition", propertyId: "P1", op: "eq", value: "Todo" }],
    };
    expect(impliedValues(or, properties, null)).toEqual({});
    expect(
      impliedValues(
        { type: "condition", propertyId: "P1", op: "in", value: ["A", "B"] },
        properties,
        null,
      ),
    ).toEqual({});
  });

  test("the group a page is created in", () => {
    expect(
      groupedValues(properties, [
        [{ propertyId: "P1", direction: "asc" }, "Done"],
        [{ propertyId: "P2", direction: "asc" }, "b"],
      ]),
    ).toEqual({ P1: "Done", P2: ["b"] });
  });
});

describe("moving between groups of a personal grouping", () => {
  test("a single value is replaced, a list keeps its other values", () => {
    expect(
      groupMoveValues(properties, { Tags: ["a", "c"] }, [
        { groupBy: { propertyId: "P2", direction: "asc" }, key: "b", from: "a" },
      ]),
    ).toEqual({ set: { P2: ["c", "b"] }, unset: [] });
    expect(
      groupMoveValues(properties, {}, [
        { groupBy: { propertyId: "P1", direction: "asc" }, key: null },
      ]),
    ).toEqual({ set: {}, unset: ["P1"] });
  });

  test("computed groups cannot be moved into", () => {
    expect(
      groupMoveValues(properties, {}, [
        { groupBy: { propertyId: "P4", direction: "asc" }, key: "x" },
      ]),
    ).toBeNull();
  });
});
