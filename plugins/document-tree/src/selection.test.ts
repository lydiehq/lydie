import { describe, expect, test } from "bun:test";

import type { ChildEntry } from "@lydie/plugin-api";

import { placements, rangeIds, topmost, withinAny } from "./selection.ts";
import type { TreeRow } from "./tree-model.ts";

const row = (id: string, depth: number): TreeRow => ({
  kind: "doc",
  id,
  doc: { id } as ChildEntry,
  depth,
  expanded: false,
  expandable: false,
  collection: false,
});

// A
//   A1
//     A1a
//   A2
// B
const rows = [row("A", 0), row("A1", 1), row("A1a", 2), row("A2", 1), row("B", 0)];

describe("selection", () => {
  test("ranges run either way and fall back to the second row", () => {
    expect(rangeIds(rows, "A1", "A2")).toEqual(["A1", "A1a", "A2"]);
    expect(rangeIds(rows, "B", "A1a")).toEqual(["A1a", "A2", "B"]);
    expect(rangeIds(rows, "gone", "A2")).toEqual(["A2"]);
    expect(rangeIds(rows, "A", "gone")).toEqual([]);
  });

  test("ranges leave out a collection's views", () => {
    const view: TreeRow = {
      kind: "view",
      id: "view:v1",
      view: { id: "v1", name: "Table", type: "table" },
      collection: { id: "B" } as ChildEntry,
      depth: 1,
    };
    const withViews = [...rows, view, row("C", 0)];
    expect(rangeIds(withViews, "B", "C")).toEqual(["B", "C"]);
    expect(rangeIds(withViews, "gone", "view:v1")).toEqual([]);
  });

  test("topmost leaves out documents inside another selected one", () => {
    const ids = (s: string[]) => topmost(rows, new Set(s)).map((d) => d.id);
    expect(ids(["A", "A1a", "B"])).toEqual(["A", "B"]);
    expect(ids(["A1a", "A2"])).toEqual(["A1a", "A2"]);
    expect(ids(["A1", "A1a", "A2"])).toEqual(["A1", "A2"]);
  });

  test("withinAny finds a row inside a dragged document", () => {
    expect(withinAny(rows, "A1a", ["A"])).toBe(true);
    expect(withinAny(rows, "A1", ["A1"])).toBe(true);
    expect(withinAny(rows, "A2", ["A1"])).toBe(false);
    expect(withinAny(rows, "B", ["A"])).toBe(false);
  });

  test("placements keep the documents in order", () => {
    expect(placements(["x", "y"], { parentId: "p", beforeId: "b" })).toEqual([
      { id: "x", placement: { parentId: "p", beforeId: "b" } },
      { id: "y", placement: { parentId: "p", beforeId: "b" } },
    ]);
    expect(placements(["x", "y"], { parentId: "p", afterId: "a" })).toEqual([
      { id: "x", placement: { parentId: "p", afterId: "a" } },
      { id: "y", placement: { parentId: "p", afterId: "x" } },
    ]);
  });
});
