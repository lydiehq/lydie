import { describe, expect, test } from "bun:test";

import {
  addCondition,
  addGroup,
  canAddGroup,
  countConditions,
  defaultCondition,
  fromRoot,
  needsValue,
  nodeAt,
  opLabel,
  relativeLabel,
  removeAt,
  setCombinator,
  toRoot,
  updateCondition,
  withSearch,
} from "./filter-model.ts";

const A = "01928000-0000-0000-0000-000000000000";
const B = "0192c000-0000-0000-0000-000000000000";
const TITLE = "01968000-0000-0000-0000-000000000000";

describe("filter model", () => {
  test("an empty filter is an empty and-group, saved as null", () => {
    const root = toRoot(null);
    expect(root).toEqual({ type: "group", combinator: "and", children: [] });
    expect(fromRoot(root)).toBeNull();
  });

  test("a single condition is wrapped; a not-group too", () => {
    const condition = { type: "condition" as const, propertyId: A, op: "eq" as const, value: "x" };
    expect(toRoot(condition).children).toEqual([condition]);
    const not = { type: "group" as const, combinator: "not" as const, children: [condition] };
    expect(toRoot(not).children).toEqual([not]);
  });

  test("default conditions use the type's first operator", () => {
    expect(defaultCondition({ id: A, type: "text" })).toEqual({
      type: "condition",
      propertyId: A,
      op: "eq",
      value: "",
    });
    expect(defaultCondition({ id: A, type: "checkbox" }).value).toBe(true);
    expect(defaultCondition({ id: A, type: "multiSelect" }).op).toBe("contains");
  });

  test("add, nest, update, combine and remove by path", () => {
    let root = toRoot(null);
    root = addCondition(root, [], defaultCondition({ id: A, type: "text" }));
    root = addGroup(root, [], defaultCondition({ id: B, type: "number" }));
    expect(root.children).toHaveLength(2);
    const group = nodeAt(root, [1]);
    expect(group?.type === "group" && group.combinator).toBe("or");
    root = addCondition(root, [1], defaultCondition({ id: A, type: "text" }));
    root = updateCondition(root, [1, 0], { op: "gt", value: 3 });
    expect(nodeAt(root, [1, 0])).toEqual({ type: "condition", propertyId: B, op: "gt", value: 3 });
    root = setCombinator(root, [], "or");
    expect(root.combinator).toBe("or");
    expect(countConditions(root)).toBe(3);
    // Removing the nested group's last two conditions removes the group.
    root = removeAt(root, [1, 1]);
    root = removeAt(root, [1, 0]);
    expect(root.children).toHaveLength(1);
    expect(nodeAt(root, [1])).toBeNull();
  });

  test("operators without values drop the value", () => {
    let root = addCondition(toRoot(null), [], defaultCondition({ id: A, type: "text" }));
    root = updateCondition(root, [0], { op: "isEmpty" });
    expect(nodeAt(root, [0])).toEqual({ type: "condition", propertyId: A, op: "isEmpty" });
    expect(needsValue("isEmpty")).toBe(false);
    expect(needsValue("eq")).toBe(true);
  });

  test("nesting stops at the schema's depth", () => {
    expect(canAddGroup([])).toBe(true);
    expect(canAddGroup([0])).toBe(true);
    expect(canAddGroup([0, 0])).toBe(false);
    let root = addGroup(toRoot(null), [], defaultCondition({ id: A, type: "text" }));
    root = addGroup(root, [0], defaultCondition({ id: A, type: "text" }));
    const deep = addGroup(root, [0, 1], defaultCondition({ id: A, type: "text" }));
    expect(deep).toBe(root);
  });

  test("labels read naturally per type", () => {
    expect(opLabel("lt", "date")).toBe("is before");
    expect(opLabel("lt", "number")).toBe("<");
    expect(opLabel("in", "multiSelect")).toBe("contains any of");
    expect(relativeLabel({ relative: "today", amount: -1, unit: "week" })).toBe("One week ago");
    expect(relativeLabel({ relative: "today", amount: 3, unit: "day" })).toBe("3 days from now");
  });

  test("search joins the filter without exceeding its depth", () => {
    expect(withSearch(null, TITLE, "  ")).toBeNull();
    expect(withSearch(null, TITLE, "abc")).toEqual({
      type: "condition",
      propertyId: TITLE,
      op: "contains",
      value: "abc",
    });
    const and = addCondition(toRoot(null), [], defaultCondition({ id: A, type: "text" }));
    const joined = withSearch(and, TITLE, "abc");
    expect(joined?.type === "group" && joined.children).toHaveLength(2);
    const or = setCombinator(and, [], "or");
    const wrapped = withSearch(or, TITLE, "abc");
    expect(wrapped?.type === "group" && wrapped.combinator).toBe("and");
  });
});
