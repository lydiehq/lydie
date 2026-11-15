import { describe, expect, test } from "bun:test";

import {
  cellBox,
  createGeometry,
  hitTest,
  nearestRow,
  nextViewport,
  onScreen,
  rangeBoxes,
  reveal,
  spacerBefore,
  withColumnWidth,
} from "./geometry.ts";
import { prefixSums, visibleColumns, visibleRange, windowFor } from "./virtual.ts";

// Title (frozen, 200) and four 100 px columns; 40 px gutter, 48 px trailing; 30 px rows; 1,000
// items of which item 0 is a group header.
const g = createGeometry({
  columnWidths: [200, 100, 100, 100, 100],
  frozen: 1,
  rowHeight: 30,
  header: 30,
  footer: 30,
  leading: 40,
  trailing: 48,
  items: 1000,
  rowToItem: Array.from({ length: 999 }, (_, i) => i + 1),
});
const scroll = { top: 0, left: 0, width: 400, height: 360 };

describe("windowing arithmetic", () => {
  test("visible items with overscan", () => {
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
    expect(visibleColumns(prefixSums([100, 100, 100, 100, 100]), 150, 120, 0)).toEqual({
      start: 1,
      end: 3,
    });
  });
});

describe("geometry", () => {
  test("sizes", () => {
    expect(g.totalWidth).toBe(40 + 600 + 48);
    expect(g.totalHeight).toBe(30 + 30_000 + 30);
    expect(g.frozenWidth).toBe(200);
    expect(g.itemToRow[0]).toBe(-1);
    expect(g.itemToRow[1]).toBe(0);
  });

  test("cell boxes and range boxes split at the frozen columns", () => {
    expect(cellBox(g, { row: 0, col: 2 })).toEqual({ x: 340, y: 60, width: 100, height: 30 });
    const boxes = rangeBoxes(g, { top: 0, bottom: 1, left: 0, right: 2 });
    expect(boxes.frozen).toEqual({ x: 40, y: 60, width: 200, height: 60 });
    expect(boxes.scrolling).toEqual({ x: 240, y: 60, width: 200, height: 60 });
    expect(rangeBoxes(g, { top: 0, bottom: 0, left: 2, right: 2 }).frozen).toBeNull();
  });

  test("on screen and the rendered window (the same object while it does not move)", () => {
    expect(onScreen(g, scroll)).toEqual({ rowStart: 0, rowEnd: 10, colStart: 1, colEnd: 3 });
    const first = nextViewport(g, scroll, { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 });
    expect(first).toEqual({ rowStart: 0, rowEnd: 18, colStart: 1, colEnd: 5 });
    const moved = nextViewport(g, { ...scroll, top: 31 }, first);
    expect(nextViewport(g, { ...scroll, top: 59 }, moved)).toBe(moved);
    expect(nextViewport(g, { ...scroll, top: 600 }, first).rowStart).toBe(12);
  });

  test("reveal keeps the cell clear of the header, footer and frozen columns", () => {
    // Body area: 360 - 30 - 30 = 300 px = 10 rows; row 20 is item 21.
    expect(reveal(g, { row: 20, col: 1 }, scroll)).toEqual({ top: 360, left: 0 });
    expect(reveal(g, { row: 0, col: 1 }, { ...scroll, top: 500 })).toEqual({ top: 30, left: 0 });
    expect(reveal(g, { row: 0, col: 4 }, scroll)).toEqual({ top: 0, left: 240 });
    expect(reveal(g, { row: 0, col: 1 }, { ...scroll, left: 240 })).toEqual({ top: 0, left: 0 });
    expect(reveal(g, { row: 0, col: 0 }, { ...scroll, left: 240 }).left).toBe(240);
  });

  test("hit testing from viewport coordinates", () => {
    expect(hitTest(g, 50, 10, scroll)).toMatchObject({ item: -1, col: 0 });
    expect(hitTest(g, 10, 75, scroll)).toMatchObject({ item: 1, row: 0, col: -1, edge: "after" });
    expect(hitTest(g, 250, 35, scroll)).toMatchObject({ item: 0, row: -1, col: 1 });
    // Scrolled sideways: the frozen title stays, the rest moves.
    expect(hitTest(g, 100, 60, { ...scroll, left: 100 })).toMatchObject({ col: 0 });
    expect(hitTest(g, 250, 60, { ...scroll, left: 100 })).toMatchObject({ col: 2 });
    expect(nearestRow(g, 0)).toBe(0);
    expect(nearestRow(g, 5000)).toBe(998);
  });

  test("an inset scrolls away before the sticky columns pin to the left edge", () => {
    const h = createGeometry({ ...g, inset: 100 });
    expect(h.totalWidth).toBe(g.totalWidth + 100);
    expect(cellBox(h, { row: 0, col: 1 }).x).toBe(100 + 40 + 200);
    // Not scrolled: the gutter starts at 100, the title at 140.
    expect(hitTest(h, 50, 60, scroll).col).toBe(-1);
    expect(hitTest(h, 150, 60, scroll).col).toBe(0);
    expect(hitTest(h, 345, 60, scroll).col).toBe(1);
    // Scrolled 60: the gutter starts at 40; scrolled 250: pinned at 0, column 2 under x 250.
    expect(hitTest(h, 90, 60, { ...scroll, left: 60 }).col).toBe(0);
    expect(hitTest(h, 250, 60, { ...scroll, left: 250 }).col).toBe(2);
    expect(onScreen(h, scroll)).toMatchObject({ colStart: 1, colEnd: 2 });
    // Column 4 needs the content's right edge (100 + 40 + 500) in view; going back to column 1
    // scrolls until it clears the sticky title.
    expect(reveal(h, { row: 0, col: 4 }, scroll).left).toBe(340);
    expect(reveal(h, { row: 0, col: 1 }, { ...scroll, left: 340 }).left).toBe(100);
  });

  test("spacers and resized widths", () => {
    expect(spacerBefore(g, 3)).toBe(200);
    expect(withColumnWidth(g, 1, 150).offsets.at(-1)).toBe(650);
    expect(withColumnWidth(g, 1, 100)).toBe(g);
  });
});
