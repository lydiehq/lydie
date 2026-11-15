import { describe, expect, test } from "bun:test";

import { describeQuote, findQuote } from "./quote.ts";

describe("findQuote", () => {
  test("finds a passage", () => {
    expect(findQuote("The quick brown fox", { quote: "quick brown" })).toEqual({
      start: 4,
      end: 15,
    });
  });

  test("is null when the passage is gone", () => {
    expect(findQuote("The quick brown fox", { quote: "slow" })).toBeNull();
    expect(findQuote("The quick brown fox", { quote: "  " })).toBeNull();
  });

  test("treats any run of whitespace as one space", () => {
    const text = "first line\n  second line";
    const range = findQuote(text, { quote: "line second" })!;
    expect(text.slice(range.start, range.end)).toBe("line\n  second");
  });

  test("takes the first of several repeats", () => {
    expect(findQuote("one two one two", { quote: "one" })).toEqual({ start: 0, end: 3 });
  });

  test("tells repeats apart by what surrounds them", () => {
    const text = "a cat sat. the cat ran. my cat slept.";
    expect(findQuote(text, { quote: "cat", prefix: "the " })).toEqual({ start: 15, end: 18 });
    expect(findQuote(text, { quote: "cat", suffix: " slept" })).toEqual({ start: 27, end: 30 });
  });

  test("still finds the passage when its surroundings changed", () => {
    expect(findQuote("now the cat ran", { quote: "cat", prefix: "old ", suffix: " gone" })).toEqual(
      { start: 8, end: 11 },
    );
  });
});

describe("describeQuote", () => {
  test("round-trips through findQuote among repeats", () => {
    const text = "a cat sat. the cat ran. my cat slept.";
    const range = { start: 27, end: 30 };
    const selector = describeQuote(text, range);
    expect(selector).toEqual({
      quote: "cat",
      prefix: "a cat sat. the cat ran. my ",
      suffix: " slept.",
    });
    expect(findQuote(text, selector)).toEqual(range);
  });
});
