import { describe, expect, test } from "bun:test";

import { matchesWords, suggestPeople } from "./match.ts";

describe("matchesWords", () => {
  test("any word prefix, case-insensitive", () => {
    expect(matchesWords("sam", "Sam Jones", "sam@example.com")).toBe(true);
    expect(matchesWords("SA", "Sam Jones", null)).toBe(true);
    expect(matchesWords("jon", "Sam Jones", null)).toBe(true);
    expect(matchesWords("sam jo", "Sam Jones", null)).toBe(true);
    expect(matchesWords("am", "Sam Jones", "sam@example.com")).toBe(false);
    expect(matchesWords("sam x", "Sam Jones", null)).toBe(false);
  });

  test("words of the email, and the whole address", () => {
    expect(matchesWords("doe", null, "jane.doe@example.com")).toBe(true);
    expect(matchesWords("example", null, "jane.doe@example.com")).toBe(true);
    expect(matchesWords("jane.doe@ex", null, "jane.doe@example.com")).toBe(true);
    expect(matchesWords("jane.doe@example.com", "Jane", "jane.doe@example.com")).toBe(true);
    expect(matchesWords("ne.doe", null, "jane.doe@example.com")).toBe(false);
  });

  test("names with accents and hyphens", () => {
    expect(matchesWords("zoe", "Zoe Müller-Lüdenscheidt", null)).toBe(true);
    expect(matchesWords("lüd", "Zoe Müller-Lüdenscheidt", null)).toBe(true);
  });

  test("nothing typed matches nothing", () => {
    expect(matchesWords("  ", "Sam", "sam@example.com")).toBe(false);
  });
});

describe("suggestPeople", () => {
  const people = [
    { userId: "o", name: "Olivia Sampson", email: "olivia@example.com" },
    { userId: "s", name: "Sam", email: "sam@example.com" },
    { userId: "t", name: null, email: "samuel@example.com" },
    { userId: "x", name: "Xavier", email: "x@example.com" },
  ];

  test("matches name and email, names starting with the query first", () => {
    expect(suggestPeople(people, "sam", new Set()).map((p) => p.userId)).toEqual(["s", "t", "o"]);
  });

  test("leaves out excluded people", () => {
    expect(suggestPeople(people, "sam", new Set(["s", "o"])).map((p) => p.userId)).toEqual(["t"]);
  });
});
