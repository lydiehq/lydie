import { describe, expect, test } from "bun:test";

import type { DatabaseProperty, FilterNode } from "@lydie/plugin-api/databases";

import { valueLabel } from "./chips-model.ts";
import {
  addCondition,
  defaultCondition,
  defaultValue,
  toRoot,
  withSearch,
} from "./filter-model.ts";
import { impliedValues } from "./implied.ts";

const T = "2026-11-13T00:00:00.000Z";
const TITLE = "01968000-0000-0000-0000-000000000000";
const ID = "01JI0000000000000000000000";
const issueId: DatabaseProperty = {
  id: ID,
  workspaceId: "ws",
  databaseId: "db",
  name: "ID",
  type: "uniqueId",
  key: "ID",
  config: { prefix: "LYD" },
  sortKey: "a",
  createdAt: T,
  updatedAt: T,
  deletedAt: null,
};

describe("uniqueId in views", () => {
  test("the view's search also finds a page by its id", () => {
    const title = { type: "condition", propertyId: TITLE, op: "contains" } as const;
    expect(withSearch(null, TITLE, "LYD-12", [issueId])).toEqual({
      type: "group",
      combinator: "or",
      children: [
        { ...title, value: "LYD-12" },
        { type: "condition", propertyId: ID, op: "eq", value: 12 },
      ],
    });
    expect(withSearch(null, TITLE, "lyd-12", [issueId])).toMatchObject({ combinator: "or" });
    expect(withSearch(null, TITLE, "12", [issueId])).toMatchObject({ combinator: "or" });
    // Not an id of this property: the title search alone.
    expect(withSearch(null, TITLE, "ABC-12", [issueId])).toEqual({ ...title, value: "ABC-12" });
    expect(withSearch(null, TITLE, "bug", [issueId])).toEqual({ ...title, value: "bug" });
    // Joins a root "and" filter as one more child.
    const and = addCondition(toRoot(null), [], defaultCondition({ id: ID, type: "uniqueId" }));
    const joined = withSearch(and, TITLE, "LYD-3", [issueId]);
    expect(joined?.type === "group" && joined.children.at(-1)).toMatchObject({ combinator: "or" });
  });

  test("filter values read as the ids show", () => {
    expect(defaultValue("uniqueId", "eq")).toBeNull();
    expect(valueLabel(12, issueId)).toBe("LYD-12");
    expect(valueLabel([1, 2], issueId)).toBe("LYD-1, LYD-2");
    expect(valueLabel(12, { ...issueId, config: {} })).toBe("12");
  });

  test("a new page never gets an id from the filter", () => {
    const filter: FilterNode = { type: "condition", propertyId: ID, op: "eq", value: 4 };
    expect(impliedValues(filter, [issueId], null)).toEqual({});
  });
});
