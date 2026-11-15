import { describe, expect, test } from "bun:test";

import { frecency, parseQuery, rank, recordOpen } from "./ranking.ts";

const DAY = 24 * 60 * 60 * 1000;
const docs = [
  { id: "a", title: "Quarterly roadmap", path: "" },
  { id: "b", title: "Roadmap notes", path: "Work" },
  { id: "c", title: "Grocery list", path: "" },
  { id: "d", title: "Ideas", path: "Work / Lydie" },
];

describe("quick switcher ranking", () => {
  test("fuzzy matches titles, prefix first", () => {
    expect(rank(docs, "road", {}, 0).map((d) => d.id)).toEqual(["b", "a"]);
    expect(rank(docs, "qrtrly", {}, 0).map((d) => d.id)).toEqual(["a"]);
    expect(rank(docs, "zzz", {}, 0)).toEqual([]);
  });

  test("matches the folder path too, below title matches", () => {
    expect(rank(docs, "lydie ideas", {}, 0).map((d) => d.id)).toEqual(["d"]);
    expect(
      rank(docs, "work", {}, 0)
        .map((d) => d.id)
        .sort(),
    ).toEqual(["b", "d"]);
  });

  test("frequent and recent documents rank higher", () => {
    const now = 100 * DAY;
    let usage = {};
    for (let i = 0; i < 6; i++) usage = recordOpen(usage, "a", now - DAY);
    expect(rank(docs, "road", usage, now).map((d) => d.id)).toEqual(["a", "b"]);
    expect(frecency({ count: 3, last: now - 7 * DAY }, now)).toBeCloseTo(
      frecency({ count: 3, last: now }, now) / 2,
    );
  });

  test("an old habit fades: a recent open beats many old ones", () => {
    const now = 100 * DAY;
    let usage = {};
    for (let i = 0; i < 20; i++) usage = recordOpen(usage, "a", now - 60 * DAY);
    usage = recordOpen(usage, "b", now - DAY);
    usage = recordOpen(usage, "b", now - DAY);
    expect(rank(docs, "roadmap", usage, now).map((d) => d.id)[0]).toBe("b");
  });

  test("an empty query lists recent documents, newest first", () => {
    let usage = recordOpen({}, "c", 1);
    usage = recordOpen(usage, "a", 2);
    expect(rank(docs, "", usage, 3).map((d) => d.id)).toEqual(["a", "c"]);
  });

  test("usage stats stay bounded", () => {
    let usage = {};
    for (let i = 0; i < 10; i++) usage = recordOpen(usage, `d${i}`, i, 5);
    expect(Object.keys(usage).sort()).toEqual(["d5", "d6", "d7", "d8", "d9"]);
  });

  test("parses # headings and > commands", () => {
    expect(parseQuery("road")).toEqual({ kind: "docs", text: "road" });
    expect(parseQuery("#intro")).toEqual({ kind: "headings", doc: "", text: "intro" });
    expect(parseQuery("Roadmap#q3")).toEqual({ kind: "headings", doc: "Roadmap", text: "q3" });
    expect(parseQuery("> new doc")).toEqual({ kind: "commands", text: "new doc" });
  });
});
