import { describe, expect, test } from "bun:test";

import { dateMentions, personHref, userIdOf } from "./suggest.ts";

const now = new Date(2026, 10, 13, 10); // a Friday

describe("@ mentions", () => {
  test("offers today, tomorrow and yesterday with no query", () => {
    expect(dateMentions("", now, "YYYY-MM-DD").map((m) => m.label)).toEqual([
      "Today · 2026-11-13",
      "Tomorrow · 2026-11-14",
      "Yesterday · 2026-11-12",
    ]);
  });

  test("weekdays mean the next one; explicit dates parse in the given format", () => {
    expect(dateMentions("mon", now, "YYYY-MM-DD").map((m) => m.label)).toEqual([
      "Monday · 2026-11-16",
    ]);
    expect(dateMentions("2026-12-01", now, "DD.MM.YYYY")[0]?.label).toBe("01.12.2026");
    expect(dateMentions("zzz", now, "YYYY-MM-DD")).toEqual([]);
  });

  test("person links round-trip their id", () => {
    expect(userIdOf(personHref("user 1"))).toBe("user 1");
    expect(userIdOf("https://x")).toBeNull();
  });
});
