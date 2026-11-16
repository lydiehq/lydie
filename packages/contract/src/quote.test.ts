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

// The first implementation, kept to check the faster one against.
function slowFindQuote(
  text: string,
  selector: { quote: string; prefix?: string; suffix?: string },
) {
  const squash = (t: string) => {
    let out = "";
    const at: number[] = [];
    let space = false;
    for (let i = 0; i < t.length; i++) {
      if (/\s/.test(t[i]!)) {
        if (!space) {
          out += " ";
          at.push(i);
        }
        space = true;
      } else {
        out += t[i];
        at.push(i);
        space = false;
      }
    }
    return { text: out, at };
  };
  const suffixOf = (a: string, b: string) => {
    let n = 0;
    while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
    return n;
  };
  const prefixOf = (a: string, b: string) => {
    let n = 0;
    while (n < a.length && n < b.length && a[n] === b[n]) n++;
    return n;
  };
  const hay = squash(text);
  const needle = squash(selector.quote).text.trim();
  if (!needle) return null;
  const prefix = squash(selector.prefix ?? "").text;
  const suffix = squash(selector.suffix ?? "").text;
  let top: { start: number; end: number; score: number } | null = null;
  for (let i = hay.text.indexOf(needle); i !== -1; i = hay.text.indexOf(needle, i + 1)) {
    const last = i + needle.length - 1;
    const score =
      suffixOf(hay.text.slice(0, i), prefix) + prefixOf(hay.text.slice(last + 1), suffix);
    if (!top || score > top.score) top = { start: hay.at[i]!, end: hay.at[last]! + 1, score };
  }
  return top ? { start: top.start, end: top.end } : null;
}

describe("findQuote against the first implementation", () => {
  test("finds the same range in random texts", () => {
    let seed = 11;
    const next = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const words = ["the", "cat", "sat", " ", "  ", "\n", "\t\n ", "on", "mat", "a", "é"];
    const random = (n: number) =>
      Array.from({ length: n }, () => words[Math.floor(next() * words.length)]!).join(
        next() < 0.5 ? " " : "",
      );
    for (let i = 0; i < 500; i++) {
      const text = random(5 + Math.floor(next() * 60));
      const selector = {
        quote: random(1 + Math.floor(next() * 3)),
        ...(next() < 0.7 ? { prefix: random(Math.floor(next() * 4)) } : {}),
        ...(next() < 0.7 ? { suffix: random(Math.floor(next() * 4)) } : {}),
      };
      expect(findQuote(text, selector)).toEqual(slowFindQuote(text, selector));
    }
  });
});
