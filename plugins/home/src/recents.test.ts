import { expect, test } from "bun:test";

import { ago, jumpList, rankTitles, recordOpen, snippetParts } from "./recents.ts";

test("recordOpen moves a document to the front and keeps the list bounded", () => {
  let list = recordOpen([], "a", 1);
  list = recordOpen(list, "b", 2);
  list = recordOpen(list, "a", 3);
  expect(list).toEqual([
    { id: "a", at: 3 },
    { id: "b", at: 2 },
  ]);
  expect(recordOpen(list, "c", 4, 2).map((o) => o.id)).toEqual(["c", "a"]);
});

test("jumpList: opened here first, then recently changed ones not yet listed", () => {
  const opened = [
    { id: "a", at: 3 },
    { id: "b", at: 2 },
  ];
  expect(jumpList(opened, [{ id: "c" }, { id: "a" }, { id: "d" }], 3)).toEqual(["a", "b", "c"]);
  expect(jumpList(opened, [], 1)).toEqual(["a"]);
  expect(jumpList([], [{ id: "c" }], 8)).toEqual(["c"]);
});

test("rankTitles: fuzzy on titles and paths, lifted by recent opens", () => {
  const candidates = [
    { id: "1", title: "Roadmap", path: "Work" },
    { id: "2", title: "Road trip", path: "Personal" },
    { id: "3", title: "Groceries", path: "" },
  ];
  expect(rankTitles(candidates, "road", [], 5).map((c) => c.id)).toEqual(["1", "2"]);
  // A recent open lifts an equally good match.
  expect(rankTitles(candidates, "road", [{ id: "2", at: 1 }], 5).map((c) => c.id)).toEqual([
    "2",
    "1",
  ]);
  expect(rankTitles(candidates, "work/road", [], 5).map((c) => c.id)).toEqual(["1"]);
  expect(rankTitles(candidates, "  ", [], 5)).toEqual([]);
});

test("snippetParts splits marks without reading HTML", () => {
  expect(snippetParts("a <mark>b</mark> <i>c</i>")).toEqual([
    { text: "a ", mark: false },
    { text: "b", mark: true },
    { text: " <i>c</i>", mark: false },
  ]);
});

test("ago", () => {
  const now = Date.parse("2026-11-13T12:00:00Z");
  expect(ago("2026-11-13T11:59:40Z", now)).toBe("just now");
  expect(ago("2026-11-13T11:15:00Z", now)).toBe("45m ago");
  expect(ago("2026-11-13T07:00:00Z", now)).toBe("5h ago");
  expect(ago("2026-11-12T10:00:00Z", now)).toBe("yesterday");
  expect(ago("2026-11-09T12:00:00Z", now)).toBe("4d ago");
});
