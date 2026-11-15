import { describe, expect, test } from "bun:test";

import { extendSeries, extendTextSeries, fillShortcut, fillTarget } from "./fill.ts";
import type { FillValue } from "./fill.ts";

const num = (value: number): FillValue => ({ kind: "number", value });
const date = (value: string): FillValue => ({ kind: "date", value });
const values = (out: FillValue[]) => out.map((v) => v.value);

describe("fill down / right (Mod+D / Mod+R)", () => {
  const range = { top: 2, bottom: 5, left: 1, right: 3 };
  test("a range copies its top row down and its leftmost column right", () => {
    expect(fillShortcut(range, "down")).toEqual({
      source: { top: 2, bottom: 2, left: 1, right: 3 },
      target: { top: 3, bottom: 5, left: 1, right: 3 },
    });
    expect(fillShortcut(range, "right")).toEqual({
      source: { top: 2, bottom: 5, left: 1, right: 1 },
      target: { top: 2, bottom: 5, left: 2, right: 3 },
    });
  });

  test("one row takes the row above; one column the column to the left", () => {
    const cell = { top: 4, bottom: 4, left: 2, right: 2 };
    expect(fillShortcut(cell, "down")).toEqual({
      source: { top: 3, bottom: 3, left: 2, right: 2 },
      target: cell,
    });
    expect(fillShortcut(cell, "right")).toEqual({
      source: { top: 4, bottom: 4, left: 1, right: 1 },
      target: cell,
    });
    // A row of cells fills down from the row above, but right from its own first cell.
    const row = { top: 4, bottom: 4, left: 1, right: 3 };
    expect(fillShortcut(row, "down")).toEqual({
      source: { top: 3, bottom: 3, left: 1, right: 3 },
      target: row,
    });
    expect(fillShortcut(row, "right")!.target).toEqual({ top: 4, bottom: 4, left: 2, right: 3 });
  });

  test("nothing above the first row or left of the first column", () => {
    expect(fillShortcut({ top: 0, bottom: 0, left: 2, right: 3 }, "down")).toBeNull();
    expect(fillShortcut({ top: 1, bottom: 4, left: 0, right: 0 }, "right")).toBeNull();
    expect(fillShortcut({ top: 0, bottom: 1, left: 0, right: 0 }, "down")).not.toBeNull();
  });
});

describe("fill target", () => {
  const source = { top: 2, bottom: 3, left: 1, right: 1 };
  test("follows the axis the pointer left furthest on", () => {
    expect(fillTarget(source, { row: 6, col: 2 })).toEqual({
      top: 4,
      bottom: 6,
      left: 1,
      right: 1,
    });
    expect(fillTarget(source, { row: 0, col: 1 })).toEqual({
      top: 0,
      bottom: 1,
      left: 1,
      right: 1,
    });
    expect(fillTarget(source, { row: 3, col: 4 })).toEqual({
      top: 2,
      bottom: 3,
      left: 2,
      right: 4,
    });
    expect(fillTarget(source, { row: 2, col: 1 })).toBeNull();
  });
});

describe("series", () => {
  test("one value is copied", () => {
    expect(values(extendSeries([num(5)], 3))).toEqual([5, 5, 5]);
    expect(values(extendSeries([date("2026-01-31")], 2))).toEqual(["2026-01-31", "2026-01-31"]);
  });

  test("numbers with a constant step continue, both ways", () => {
    expect(values(extendSeries([num(1), num(3)], 3))).toEqual([5, 7, 9]);
    expect(values(extendSeries([num(1), num(3)], 2, true))).toEqual([-1, -3]);
    expect(values(extendSeries([num(0.1), num(0.2)], 2))).toEqual([0.3, 0.4]);
  });

  test("anything else repeats", () => {
    expect(values(extendSeries([num(1), num(2), num(4)], 4))).toEqual([1, 2, 4, 1]);
    expect(values(extendSeries([num(1), num(2), num(4)], 2, true))).toEqual([4, 2]);
    expect(values(extendSeries([num(1), { kind: "other", value: "a" }], 2))).toEqual([1, "a"]);
  });

  test("dates by days and by months", () => {
    expect(values(extendSeries([date("2026-12-30"), date("2026-12-31")], 2))).toEqual([
      "2027-01-01",
      "2027-01-02",
    ]);
    expect(values(extendSeries([date("2026-01-31"), date("2026-02-07")], 1))).toEqual([
      "2026-02-14",
    ]);
    expect(values(extendSeries([date("2026-01-15"), date("2026-02-15")], 2))).toEqual([
      "2026-03-15",
      "2026-04-15",
    ]);
    expect(values(extendSeries([date("2026-01-15T09:00"), date("2026-01-16T09:00")], 1))).toEqual([
      "2026-01-17T09:00",
    ]);
  });

  test("text ending in a number", () => {
    expect(extendTextSeries(["Week 1", "Week 2"], 2)).toEqual(["Week 3", "Week 4"]);
    expect(extendTextSeries(["Week 1"], 2)).toBeNull();
    expect(extendTextSeries(["a 1", "b 2"], 2)).toBeNull();
  });
});
