import { describe, expect, test } from "bun:test";

import { addDays, gridDays, moveDate, shiftAnchor, span, weekStart } from "./calendar-model.ts";

describe("calendar model", () => {
  test("weeks start on Monday; a month grid is six weeks", () => {
    expect(weekStart("2026-11-13")).toBe("2026-11-09");
    const days = gridDays("2026-11-13", "month");
    expect(days).toHaveLength(42);
    expect(days[0]).toBe("2026-10-26");
    expect(gridDays("2026-11-13", "week")).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
  });

  test("day arithmetic crosses months and years", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftAnchor("2026-01-31", "month", 1)).toBe("2026-02-01");
    expect(shiftAnchor("2026-11-13", "week", -1)).toBe("2026-11-06");
  });

  test("spans of dates and ranges", () => {
    expect(span("2026-11-13")).toEqual({ start: "2026-11-13", end: "2026-11-13" });
    expect(span("2026-11-13T09:00/2026-11-15T10:00")).toEqual({
      start: "2026-11-13",
      end: "2026-11-15",
    });
    expect(span(null)).toBeNull();
  });

  test("moving keeps the length and the time of day", () => {
    expect(moveDate("2026-11-13", "move", "2026-11-13", "2026-11-20")).toBe("2026-11-20");
    expect(moveDate("2026-11-13T09:30/2026-11-14T10:00", "move", "2026-11-14", "2026-11-16")).toBe(
      "2026-11-15T09:30/2026-11-16T10:00",
    );
  });

  test("dragging an edge changes one end and never inverts the range", () => {
    expect(moveDate("2026-11-13", "end", "2026-11-13", "2026-11-16")).toBe("2026-11-13/2026-11-16");
    expect(moveDate("2026-11-13/2026-11-16", "start", "2026-11-13", "2026-11-11")).toBe(
      "2026-11-11/2026-11-16",
    );
    expect(moveDate("2026-11-13/2026-11-16", "end", "2026-11-16", "2026-11-10")).toBe(
      "2026-11-13/2026-11-13",
    );
  });
});
