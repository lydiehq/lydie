import { describe, expect, it } from "bun:test";

import { titleSimilarity, trigrams } from "./trigrams.ts";

describe("trigrams", () => {
  it("pads each word as pg_trgm does", () => {
    expect(trigrams("Search")).toEqual(["  s", " se", "sea", "ear", "arc", "rch", "ch "]);
    expect(trigrams("a b")).toEqual(["  a", " a ", "  b", " b "]);
  });

  it("splits words on separators and lower-cases ASCII only", () => {
    expect(trigrams("Q3-plan")).toEqual(trigrams("q3 plan"));
    expect(trigrams("  spaced   out ")).toEqual(trigrams("spaced out"));
    expect(trigrams("Ärger")).toContain("  Ä");
  });

  it("scores the share of the query's trigrams found in the title", () => {
    expect(titleSimilarity(trigrams("onbaording"), "Onboarding checklist")).toBeCloseTo(7 / 11);
    expect(titleSimilarity(trigrams("serch"), "Search")).toBeCloseTo(4 / 6);
    expect(titleSimilarity(trigrams("api"), "Rapid prototyping")).toBeCloseTo(1 / 4);
    expect(titleSimilarity([], "Anything")).toBe(0);
  });
});
