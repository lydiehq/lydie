import { describe, expect, test } from "bun:test";

import { addDays, formatDate, parseDate } from "./dates.ts";

const d = new Date(2026, 10, 3, 9, 5); // Tue 3 November 2026, 09:05

describe("dates", () => {
  test("formats Moment-style tokens", () => {
    expect(formatDate(d)).toBe("2026-11-03");
    expect(formatDate(d, "dddd, MMMM D, YYYY")).toBe("Tuesday, November 3, 2026");
    expect(formatDate(d, "ddd DD MMM [week] HH:mm")).toBe("Tue 03 Nov week 09:05");
    expect(formatDate(d, "YYYY/MM/YYYY-MM-DD")).toBe("2026/11/2026-11-03");
  });

  test("parses what it formats, and rejects the rest", () => {
    for (const format of ["YYYY-MM-DD", "DD.MM.YYYY", "dddd, MMMM D, YYYY", "[Daily] YYYY-MM-DD"]) {
      expect(parseDate(formatDate(d, format), format)?.getTime()).toBe(
        new Date(2026, 10, 3).getTime(),
      );
    }
    expect(parseDate("2026-02-30")).toBeNull();
    expect(parseDate("Groceries")).toBeNull();
  });

  test("adds days across months", () => {
    expect(formatDate(addDays(new Date(2026, 0, 31), 1))).toBe("2026-02-01");
  });
});
