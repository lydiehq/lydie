import { describe, expect, test } from "bun:test";

import { fitTabs } from "./tabs-model.ts";

const fit = (widths: number[], available: number, active = 0) =>
  fitTabs({ widths, available, moreWidth: 60, gap: 4, active });

describe("fitTabs", () => {
  test("everything fits: no more button", () => {
    expect(fit([100, 100, 100], 308)).toEqual({ shown: [0, 1, 2], hidden: [] });
  });

  test("the rest goes under more, room kept for the button", () => {
    // 100 + 4 + 100 = 204, plus 4 + 60 for "more" = 268.
    expect(fit([100, 100, 100], 268)).toEqual({ shown: [0, 1], hidden: [2] });
    expect(fit([100, 100, 100], 267)).toEqual({ shown: [0], hidden: [1, 2] });
  });

  test("the open view stays in its place even when it is past the edge", () => {
    expect(fit([100, 100, 100, 100], 268, 3)).toEqual({ shown: [0, 3], hidden: [1, 2] });
  });

  test("stops at the first tab that does not fit, keeping the order", () => {
    expect(fit([100, 300, 50], 300)).toEqual({ shown: [0], hidden: [1, 2] });
  });

  test("the open view shows even when it alone is too wide", () => {
    expect(fit([500, 100], 200, 0)).toEqual({ shown: [0], hidden: [1] });
  });

  test("no open view among the tabs", () => {
    expect(fit([100, 100, 100], 268, -1)).toEqual({ shown: [0, 1], hidden: [2] });
  });
});
