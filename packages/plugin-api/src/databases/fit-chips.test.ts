import { describe, expect, test } from "bun:test";

import { fitChips } from "./PropertyValueView.tsx";

describe("fitChips", () => {
  test("all fit: no room needed for +N", () => {
    expect(fitChips(300, [100, 100], 30, 2)).toBe(2);
  });

  test("leaves room for +N on the same line", () => {
    // Three chips fill 308 px; with "+1" (4 + 30) they would not.
    expect(fitChips(320, [100, 100, 100], 30, 4)).toBe(2);
    expect(fitChips(342, [100, 100, 100], 30, 4)).toBe(3);
  });

  test("always at least one", () => {
    expect(fitChips(50, [100, 100], 30, 2)).toBe(1);
  });
});
