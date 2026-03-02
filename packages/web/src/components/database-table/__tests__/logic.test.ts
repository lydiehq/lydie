import { describe, expect, it } from "vitest";

import { applyPropertyFilters } from "../logic/filtering";
import { getNextGridPosition } from "../logic/navigation";
import { sortNullableValues } from "../logic/sorting";
import { initialTableCellState, tableCellStateReducer } from "../state/reducers";

describe("database-table logic", () => {
  it("sortNullableValues sorts null last", () => {
    expect(sortNullableValues(null, "a")).toBeGreaterThan(0);
    expect(sortNullableValues("a", null)).toBeLessThan(0);
  });

  it("applyPropertyFilters filters by property value", () => {
    const rows = [
      { properties: { status: "draft" } },
      { properties: { status: "published" } },
    ];
    expect(applyPropertyFilters(rows, { status: "draft" })).toHaveLength(1);
  });

  it("getNextGridPosition stays in bounds", () => {
    expect(getNextGridPosition({ rowIndex: 0, columnIndex: 0 }, "ArrowUp", 3, 3)).toEqual({
      rowIndex: 0,
      columnIndex: 0,
    });
    expect(getNextGridPosition({ rowIndex: 2, columnIndex: 2 }, "ArrowRight", 3, 3)).toEqual({
      rowIndex: 2,
      columnIndex: 2,
    });
  });

  it("tableCellStateReducer transitions edit state", () => {
    const started = tableCellStateReducer(initialTableCellState, {
      type: "startEdit",
      rowId: "r1",
      columnId: "c1",
      seed: "x",
    });
    expect(started.editingCell).toEqual({ rowId: "r1", columnId: "c1", seed: "x" });

    const stopped = tableCellStateReducer(started, { type: "stopEdit" });
    expect(stopped.editingCell).toBeNull();
  });
});
