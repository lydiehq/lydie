import { describe, expect, test } from "bun:test";

import { CARD_WIDTH, marginGeometry, stack } from "./margin.ts";

describe("marginGeometry", () => {
  test("a wide page keeps the text where it is and puts cards in its gutter", () => {
    const g = marginGeometry(1400, 680);
    expect(g).toMatchObject({ mode: "cards", reserve: 0 });
    // Right of the centred column, inside the page.
    expect(g.left).toBeGreaterThan((1400 + 680) / 2);
    expect(g.left + CARD_WIDTH).toBeLessThanOrEqual(1400);
  });

  test("a narrower page moves the text left only as far as the cards need", () => {
    const g = marginGeometry(1000, 680);
    expect(g.mode).toBe("cards");
    expect(g.reserve).toBeGreaterThan(0);
    expect(g.left + CARD_WIDTH).toBeLessThanOrEqual(1000);
  });

  test("full width gives the cards their whole room", () => {
    const g = marginGeometry(1200, null);
    expect(g.mode).toBe("cards");
    expect(g.left + CARD_WIDTH).toBeLessThanOrEqual(1200);
    expect(g.left).toBeGreaterThan(1200 - g.reserve);
  });

  test("too narrow for cards beside the text: markers", () => {
    expect(marginGeometry(640, 680).mode).toBe("markers");
    expect(marginGeometry(640, 680).left).toBeLessThan(640);
  });
});

describe("stack", () => {
  const box = (id: string, top: number, height = 50) => ({ id, top, height });

  test("boxes sit at their tops and push the next ones down", () => {
    const tops = stack([box("a", 0), box("b", 20), box("c", 300)], null, 8);
    expect([...tops.values()]).toEqual([0, 58, 300]);
  });

  test("the active one sits at its top; the ones before it move up", () => {
    const tops = stack([box("a", 100), box("b", 120), box("c", 130)], "b", 8);
    expect(tops.get("b")).toBe(120);
    expect(tops.get("a")).toBe(62);
    expect(tops.get("c")).toBe(178);
  });

  test("never above the floor: then everything goes down from there", () => {
    const tops = stack([box("a", 0), box("b", 10)], "b", 8);
    expect([...tops.values()]).toEqual([0, 58]);
    // Room above (beside the title): the active one stays put.
    expect([...stack([box("a", 0), box("b", 10)], "b", 8, -100).values()]).toEqual([-48, 10]);
  });
});
