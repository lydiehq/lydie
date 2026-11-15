import { describe, expect, it } from "bun:test";

import { dateGroupOf, groupByDate } from "./groups.ts";

// Sunday 15 November 2026, noon local time.
const now = new Date(2026, 10, 15, 12, 0);
const at = (month: number, day: number, hour = 9) => new Date(2026, month, day, hour).toISOString();

describe("dateGroupOf", () => {
  it("puts today under Today, with relative times", () => {
    expect(dateGroupOf(at(10, 15, 1), now)).toMatchObject({
      key: "day-2026-11-15",
      label: "Today",
      timeFormat: "relative",
    });
    // A clock ahead of this one is still today.
    expect(dateGroupOf(at(10, 16), now).label).toBe("Today");
  });

  it("gives each of the last seven days its own heading, with times only", () => {
    const thursday = dateGroupOf(at(10, 12), now);
    expect(thursday.key).toBe("day-2026-11-12");
    expect(thursday.label).toContain("Thursday");
    expect(thursday.label).toContain("12");
    expect(thursday.label).toContain("November");
    expect(thursday.timeFormat).toBe("time");
    expect(dateGroupOf(at(10, 9), now).key).toBe("day-2026-11-09");
  });

  it("then weeks from Monday up to 60 days, then months", () => {
    // Sunday 8 November: its week started on Monday 2 November.
    expect(dateGroupOf(at(10, 8), now)).toMatchObject({
      key: "week-2026-11-02",
      timeFormat: "date",
    });
    expect(dateGroupOf(at(10, 2), now).key).toBe("week-2026-11-02");
    expect(dateGroupOf(at(9, 20), now).key).toBe("week-2026-10-19");
    expect(dateGroupOf(at(8, 1), now)).toMatchObject({ key: "month-2026-9", timeFormat: "date" });
    expect(dateGroupOf(at(8, 1), now).label).toContain("September");
  });

  it("leaves days shown one by one out of a week's label", () => {
    // Wednesday 18 November: 12-18 November have their own headings, so the week of 9 November
    // reads 9-11 November.
    const wednesday = new Date(2026, 10, 18, 12);
    const week = dateGroupOf(new Date(2026, 10, 9, 9).toISOString(), wednesday);
    expect(week.key).toBe("week-2026-11-09");
    expect(week.label).toContain("9");
    expect(week.label).toContain("11");
  });
});

describe("groupByDate", () => {
  it("keeps entries in order under headings in order", () => {
    const entries = [at(10, 15, 11), at(10, 15, 8), at(10, 13), at(10, 1), at(6, 3)];
    const groups = groupByDate(entries, (e) => e, now);
    expect(groups.map((g) => g.key)).toEqual([
      "day-2026-11-15",
      "day-2026-11-13",
      "week-2026-10-26",
      "month-2026-7",
    ]);
    expect(groups[0]!.entries).toEqual([at(10, 15, 11), at(10, 15, 8)]);
  });
});
