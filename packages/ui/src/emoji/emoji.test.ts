import { describe, expect, it } from "bun:test";

import { loadEmoji, searchEmoji } from "./emoji";

describe("emoji", () => {
  it("loads every group, each emoji once", async () => {
    const groups = await loadEmoji();
    expect(groups.map((g) => g.name)).toContain("Flags");
    const all = groups.flatMap((g) => g.emojis.map((e) => e.emoji));
    expect(all.length).toBeGreaterThan(1500);
    expect(new Set(all).size).toBe(all.length);
  });

  it("finds by name first, then by search word, never by letters inside a word", async () => {
    const groups = await loadEmoji();
    expect(searchEmoji(groups, "rocket")[0]?.emoji).toBe("🚀");
    expect(searchEmoji(groups, "star")[0]?.name).toBe("star");
    expect(searchEmoji(groups, "grinning big").map((e) => e.emoji)).toContain("😃");
    // "custard" has "star" in it.
    expect(searchEmoji(groups, "star").map((e) => e.emoji)).not.toContain("🍮");
    expect(searchEmoji(groups, "zzzz")).toEqual([]);
    expect(searchEmoji(groups, "  ")).toEqual([]);
  });

  it("finds a pasted emoji, with or without its variation selector", async () => {
    const groups = await loadEmoji();
    expect(searchEmoji(groups, "❤️")[0]?.emoji).toBe("❤️");
    expect(searchEmoji(groups, "❤")[0]?.emoji).toBe("❤️");
  });
});
