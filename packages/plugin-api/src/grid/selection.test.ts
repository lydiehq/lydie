import { describe, expect, test } from "bun:test";

import {
  clampSelection,
  dataEdge,
  isWholeColumns,
  isWholeRows,
  moveSelection,
  rectOf,
  rowsSelection,
  single,
  tabSelection,
} from "./selection.ts";
import type { Cell } from "./selection.ts";

const size = { rows: 10, cols: 4, page: 3 };

describe("keyboard navigation", () => {
  test("arrows move and clamp at the edges", () => {
    const start = single({ row: 0, col: 0 });
    expect(moveSelection(start, "ArrowUp", size)?.focus).toEqual({ row: 0, col: 0 });
    expect(moveSelection(start, "ArrowDown", size)?.focus).toEqual({ row: 1, col: 0 });
    expect(moveSelection(start, "ArrowRight", size)?.focus).toEqual({ row: 0, col: 1 });
    expect(moveSelection(single({ row: 9, col: 3 }), "ArrowDown", size)?.focus).toEqual({
      row: 9,
      col: 3,
    });
  });

  test("Mod jumps to the edge without data; Home/End; pages", () => {
    const at = single({ row: 4, col: 2 });
    expect(moveSelection(at, "ArrowDown", size, { mod: true })?.focus).toEqual({ row: 9, col: 2 });
    expect(moveSelection(at, "ArrowLeft", size, { mod: true })?.focus).toEqual({ row: 4, col: 0 });
    expect(moveSelection(at, "End", size)?.focus).toEqual({ row: 4, col: 3 });
    expect(moveSelection(at, "Home", size, { mod: true })?.focus).toEqual({ row: 0, col: 0 });
    expect(moveSelection(at, "PageDown", size)?.focus).toEqual({ row: 7, col: 2 });
    expect(moveSelection(at, "PageUp", size)?.focus).toEqual({ row: 1, col: 2 });
    expect(moveSelection(at, "x", size)).toBeNull();
  });

  test("Shift extends a range from the anchor", () => {
    const a = moveSelection(single({ row: 1, col: 1 }), "ArrowDown", size, { shift: true })!;
    const b = moveSelection(a, "ArrowRight", size, { shift: true })!;
    expect(b.anchor).toEqual({ row: 1, col: 1 });
    expect(rectOf(b)).toEqual({ top: 1, bottom: 2, left: 1, right: 2 });
  });

  test("Tab wraps to the next row, Shift+Tab back", () => {
    expect(tabSelection(single({ row: 0, col: 3 }), size, false).focus).toEqual({ row: 1, col: 0 });
    expect(tabSelection(single({ row: 1, col: 0 }), size, true).focus).toEqual({ row: 0, col: 3 });
    expect(tabSelection(single({ row: 9, col: 3 }), size, false).focus).toEqual({ row: 9, col: 3 });
  });
});

describe("data edges (Cmd/Ctrl+arrows)", () => {
  // Column 0: filled rows 0-3, blank 4-6, filled 7-9.
  const filled = new Set([0, 1, 2, 3, 7, 8, 9]);
  const isBlank = (c: Cell) => !filled.has(c.row);
  const g = { rows: 10, cols: 1 };
  test("along a filled run to its last cell", () => {
    expect(dataEdge({ row: 0, col: 0 }, 1, 0, g, isBlank)).toEqual({ row: 3, col: 0 });
  });
  test("from the end of a run to the next filled cell", () => {
    expect(dataEdge({ row: 3, col: 0 }, 1, 0, g, isBlank)).toEqual({ row: 7, col: 0 });
    expect(dataEdge({ row: 5, col: 0 }, 1, 0, g, isBlank)).toEqual({ row: 7, col: 0 });
    expect(dataEdge({ row: 7, col: 0 }, -1, 0, g, isBlank)).toEqual({ row: 3, col: 0 });
  });
  test("to the edge when nothing follows or the data is not loaded", () => {
    expect(dataEdge({ row: 9, col: 0 }, 1, 0, g, isBlank)).toEqual({ row: 9, col: 0 });
    expect(dataEdge({ row: 0, col: 0 }, 1, 0, g, () => undefined)).toEqual({ row: 9, col: 0 });
    expect(dataEdge({ row: 4, col: 0 }, 1, 0, { rows: 10, cols: 1 }, () => true)).toEqual({
      row: 9,
      col: 0,
    });
  });
});

describe("whole rows and columns", () => {
  test("a row selection spans every column", () => {
    const s = rowsSelection(2, 4, size);
    expect(rectOf(s)).toEqual({ top: 2, bottom: 4, left: 0, right: 3 });
    expect(isWholeRows(s, size)).toBe(true);
    expect(isWholeColumns(s, size)).toBe(false);
  });

  test("clamping keeps a selection inside a smaller grid", () => {
    const s = { anchor: { row: 8, col: 3 }, focus: { row: 9, col: 3 } };
    expect(clampSelection(s, { rows: 5, cols: 2 })).toEqual({
      anchor: { row: 4, col: 1 },
      focus: { row: 4, col: 1 },
    });
    expect(clampSelection(s, { rows: 0, cols: 2 })).toBeNull();
    expect(clampSelection(s, size)).toBe(s);
  });
});
