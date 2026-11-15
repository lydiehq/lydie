import { describe, expect, it } from "bun:test";

import { columnShares, resizeColumns, sideHit, sideLine } from "./column-layout";

const box = (left: number, right: number, top: number, bottom: number) => ({
  left,
  right,
  top,
  bottom,
});

describe("sideHit", () => {
  const blocks = [
    { key: "a", box: box(100, 500, 0, 40) },
    { key: "b", box: box(100, 280, 50, 90) },
    { key: "c", box: box(320, 500, 50, 90) },
  ];

  it("finds the band just inside a block's left edge", () => {
    expect(sideHit(blocks, { x: 110, y: 20 })).toMatchObject({ key: "a", side: "left" });
  });

  it("finds a block's right edge and the margin beyond it", () => {
    expect(sideHit(blocks, { x: 490, y: 20 })).toMatchObject({ key: "a", side: "right" });
    expect(sideHit(blocks, { x: 580, y: 20 })).toMatchObject({ key: "a", side: "right" });
    expect(sideHit(blocks, { x: 620, y: 20 })).toBeNull();
  });

  it("leaves the middle of a block and the handle's gutter to reordering", () => {
    expect(sideHit(blocks, { x: 300, y: 20 })).toBeNull();
    expect(sideHit(blocks, { x: 90, y: 20 })).toBeNull();
    expect(sideHit(blocks, { x: 300, y: 45 })).toBeNull();
  });

  it("picks the nearest block on the pointer's line", () => {
    expect(sideHit(blocks, { x: 300, y: 70 })).toMatchObject({ key: "b", side: "right" });
    expect(sideHit(blocks, { x: 330, y: 70 })).toMatchObject({ key: "c", side: "left" });
  });

  it("scales the band with the block, within bounds", () => {
    const wide = [{ key: "w", box: box(0, 2000, 0, 10) }];
    expect(sideHit(wide, { x: 48, y: 5 })).not.toBeNull();
    expect(sideHit(wide, { x: 49, y: 5 })).toBeNull();
    const narrow = [{ key: "n", box: box(0, 100, 0, 10) }];
    expect(sideHit(narrow, { x: 24, y: 5 })?.side).toBe("left");
    expect(sideHit(narrow, { x: 25, y: 5 })).toBeNull();
  });

  it("draws the line just outside the edge", () => {
    expect(sideLine({ side: "left", box: box(100, 500, 0, 40) })).toEqual({
      x: 96,
      top: 0,
      bottom: 40,
    });
    expect(sideLine({ side: "right", box: box(100, 500, 0, 40) }).x).toBe(504);
  });
});

describe("column widths", () => {
  it("gives columns without a width an equal part of what is left", () => {
    expect(columnShares([null, null])).toEqual([50, 50]);
    expect(columnShares([40, null, null])).toEqual([40, 30, 30]);
    expect(columnShares([70, 60, null])).toEqual([70, 60, 65]);
    expect(columnShares([30, 70])).toEqual([30, 70]);
  });

  it("moves one boundary, keeping the pair's total", () => {
    expect(resizeColumns([50, 50], 0, 100, 1000)).toEqual([60, 40]);
    expect(resizeColumns([30, 30, 40], 1, -60, 600)).toEqual([30, 20, 50]);
  });

  it("keeps every column at least the minimum", () => {
    expect(resizeColumns([50, 50], 0, -900, 1000)).toEqual([10, 90]);
    expect(resizeColumns([50, 50], 0, 900, 1000)).toEqual([90, 10]);
  });

  it("rounds to a tenth", () => {
    const [a, b, c] = resizeColumns(columnShares([null, null, null]), 0, 10, 900);
    expect(a).toBe(34.4);
    expect(b).toBe(32.3);
    expect(c).toBeCloseTo(33.33, 2);
  });
});
