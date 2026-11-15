import { describe, expect, test } from "bun:test";

import {
  matchName,
  parseBooleanText,
  parseDateRangeText,
  parseDateText,
  parseNumberText,
  splitList,
} from "./parse.ts";

describe("numbers", () => {
  test("separators, currency, percent and negatives", () => {
    expect(parseNumberText("1,234.5")).toBe(1234.5);
    expect(parseNumberText("1.234,5")).toBe(1234.5);
    expect(parseNumberText("$1,234,567")).toBe(1234567);
    expect(parseNumberText("€ 3,50")).toBe(3.5);
    expect(parseNumberText("1 234 EUR")).toBe(1234);
    expect(parseNumberText("1.234.567")).toBe(1234567);
    expect(parseNumberText("(12.5)")).toBe(-12.5);
    expect(parseNumberText("−7")).toBe(-7);
    expect(parseNumberText("12%")).toBe(0.12);
    expect(parseNumberText("1e3")).toBe(1000);
    expect(parseNumberText("0.5")).toBe(0.5);
  });

  test("not numbers", () => {
    expect(parseNumberText("")).toBeNull();
    expect(parseNumberText("abc")).toBeNull();
    expect(parseNumberText("1,2,3")).toBeNull();
    expect(parseNumberText("12 apples")).toBeNull();
    expect(parseNumberText("$")).toBeNull();
  });
});

describe("dates", () => {
  test("common orders", () => {
    expect(parseDateText("2026-11-13")).toBe("2026-11-13");
    expect(parseDateText("2026-11-13T14:05")).toBe("2026-11-13T14:05");
    expect(parseDateText("2026-11-13 9:05 pm")).toBe("2026-11-13T21:05");
    expect(parseDateText("13.11.2026")).toBe("2026-11-13");
    expect(parseDateText("11/13/2026")).toBe("2026-11-13");
    expect(parseDateText("13/11/2026")).toBe("2026-11-13");
    expect(parseDateText("3/4/2026", { dayFirst: true })).toBe("2026-04-03");
    expect(parseDateText("Nov 13, 2026")).toBe("2026-11-13");
    expect(parseDateText("November 3rd 2026 14:00")).toBe("2026-11-03T14:00");
    expect(parseDateText("13 Nov 2026")).toBe("2026-11-13");
    expect(parseDateText("1/2/26")).toBe("2026-01-02");
  });

  test("invalid dates", () => {
    expect(parseDateText("2026-02-30")).toBeNull();
    expect(parseDateText("soon")).toBeNull();
    expect(parseDateText("Foo 13, 2026")).toBeNull();
  });

  test("ranges as the grid copies them", () => {
    expect(parseDateRangeText("Nov 1, 2026 → Nov 3, 2026")).toBe("2026-11-01/2026-11-03");
    expect(parseDateRangeText("2026-11-01/2026-11-03")).toBe("2026-11-01/2026-11-03");
    expect(parseDateRangeText("2026-11-01")).toBe("2026-11-01");
  });
});

describe("checkboxes, options, lists", () => {
  test("booleans", () => {
    expect(parseBooleanText("Yes")).toBe(true);
    expect(parseBooleanText("✓")).toBe(true);
    expect(parseBooleanText("No")).toBe(false);
    expect(parseBooleanText("")).toBe(false);
    expect(parseBooleanText("maybe")).toBeNull();
  });

  test("option names match exactly, then loosely", () => {
    const names = ["In progress", "Done"];
    expect(matchName(names, "Done")).toBe("Done");
    expect(matchName(names, " in  PROGRESS ")).toBe("In progress");
    expect(matchName(names, "Later")).toBeNull();
  });

  test("list items", () => {
    expect(splitList("a, b;c\n d,,")).toEqual(["a", "b", "c", "d"]);
  });
});
