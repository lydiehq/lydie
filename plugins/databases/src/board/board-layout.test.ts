import { expect, test } from "bun:test";

import { cardLayout, cardRange, firstAbove, spacers } from "./board-layout.ts";

const ids = ["a", "b", "c", "d"];

test("cards stack by measured height, the estimate for the rest", () => {
  const layout = cardLayout(ids, new Map([["b", 100]]), 50, 6);
  expect(layout.tops).toEqual([0, 56, 162, 218, 274]);
  expect(layout.mids).toEqual([25, 106, 187, 243]);
});

test("a drop goes before the first card whose middle is below it", () => {
  const { mids } = cardLayout(ids, new Map(), 50, 6);
  expect(firstAbove(mids, -10)).toBe(0);
  expect(firstAbove(mids, 24)).toBe(0);
  expect(firstAbove(mids, 25)).toBe(1);
  expect(firstAbove(mids, 100)).toBe(2);
  expect(firstAbove(mids, 1000)).toBe(4);
  expect(firstAbove([], 0)).toBe(0);
});

test("the cards in view, and the room the others take", () => {
  const { tops } = cardLayout(ids, new Map(), 50, 6);
  expect(cardRange(tops, 0, 60)).toEqual({ start: 0, end: 2 });
  expect(cardRange(tops, 120, 170)).toEqual({ start: 2, end: 4 });
  expect(cardRange(tops, -500, 10_000)).toEqual({ start: 0, end: 4 });
  expect(cardRange([0], 0, 100)).toEqual({ start: 0, end: 0 });
  // Card c alone: b and a before it (56 + 56 - the gap after the spacer), d after it.
  expect(spacers(tops, 2, 3, 6)).toEqual({ before: 106, after: 50 });
  expect(spacers(tops, 0, 4, 6)).toEqual({ before: 0, after: 0 });
});
