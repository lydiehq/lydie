import { describe, expect, test } from "bun:test";

import { inferDayFirst, parseNotionDate } from "./dates.ts";

describe("parseNotionDate", () => {
  test.each([
    ["@March 1, 2024", "2024-03-01"],
    ["@March 1, 2024 3:05 PM", "2024-03-01T15:05"],
    ["@March 1, 2024 9:00 AM (GMT+1)", "2024-03-01T09:00"],
    ["March 1, 2024 → March 3, 2024", "2024-03-01/2024-03-03"],
    ["@March 1, 2024 3:00 PM → 5:30 PM", "2024-03-01T15:00/2024-03-01T17:30"],
    ["2024/03/01", "2024-03-01"],
    ["Mar 1, 2024", "2024-03-01"],
    ["1 March 2024", "2024-03-01"],
  ])("%s", (text, value) => {
    expect(parseNotionDate(text)?.value).toBe(value);
  });

  test("numeric dates follow the export's order", () => {
    expect(parseNotionDate("03/04/2024")?.value).toBe("2024-03-04");
    expect(parseNotionDate("03/04/2024", null, { dayFirst: true })?.value).toBe("2024-04-03");
    expect(inferDayFirst(["01/02/2024", "23/09/2026"])).toBe(true);
    expect(inferDayFirst(["09/23/2026"])).toBe(false);
  });

  test("the machine-readable value wins", () => {
    expect(parseNotionDate("@Yesterday", "2026-11-14")?.value).toBe("2026-11-14");
  });

  test("what cannot be read", () => {
    expect(parseNotionDate("@Last Thursday")).toBeNull();
    expect(parseNotionDate("")).toBeNull();
  });

  test("time and range flags", () => {
    expect(parseNotionDate("March 1, 2024 → March 3, 2024")).toEqual({
      value: "2024-03-01/2024-03-03",
      time: false,
      range: true,
    });
  });
});
