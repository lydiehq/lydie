import { describe, expect, test } from "bun:test";

import type { SlashCommandItem } from "@lydie/plugin-api";

import { rankSlash, recordSlashUse } from "./slash-ranking.ts";

const item = (
  id: string,
  title: string,
  extra: Partial<SlashCommandItem> = {},
): SlashCommandItem => ({
  id,
  title,
  run: () => {},
  ...extra,
});

const items = [
  item("paragraph", "Text", { keywords: ["paragraph", "plain"] }),
  item("heading1", "Heading 1", { keywords: ["h1", "title"] }),
  item("heading2", "Heading 2", { keywords: ["h2"] }),
  item("taskList", "Task List", { keywords: ["todo", "checkbox"] }),
  item("codeBlock", "Code Block", { keywords: ["code"] }),
  item("command:op.doc.create", "New document", { group: "Commands" }),
  item("command:trash.open", "Open trash", { group: "Commands" }),
];

const ids = (list: SlashCommandItem[]) => list.map((i) => i.id);

describe("slash menu ranking", () => {
  test("an empty query hides commands and lists recent items first", () => {
    let recents = recordSlashUse({}, "codeBlock", 1);
    recents = recordSlashUse(recents, "taskList", 2);
    expect(ids(rankSlash(items, "", recents))).toEqual([
      "taskList",
      "codeBlock",
      "paragraph",
      "heading1",
      "heading2",
    ]);
  });

  test("fuzzy matches titles and keywords, titles first", () => {
    expect(ids(rankSlash(items, "hd2", {}))[0]).toBe("heading2");
    expect(ids(rankSlash(items, "todo", {}))).toEqual(["taskList"]);
    expect(ids(rankSlash(items, "zzz", {}))).toEqual([]);
  });

  test("a title prefix beats an exact keyword", () => {
    const list = [
      item("db", "Linked view of database", { keywords: ["embed"] }),
      item("embed", "Embed page"),
    ];
    expect(ids(rankSlash(list, "embed", {}))).toEqual(["embed", "db"]);
  });

  test("blocks rank above commands; commands are found by typing", () => {
    expect(ids(rankSlash(items, "trash", {}))).toEqual(["command:trash.open"]);
    const result = ids(rankSlash(items, "t", {}));
    expect(result.indexOf("paragraph")).toBeLessThan(result.indexOf("command:trash.open"));
  });

  test("recent use breaks near ties", () => {
    expect(ids(rankSlash(items, "heading", {})).slice(0, 2)).toEqual(["heading1", "heading2"]);
    const recents = recordSlashUse({}, "heading2", 10);
    expect(ids(rankSlash(items, "heading", recents))[0]).toBe("heading2");
  });

  test("recents stay bounded", () => {
    let recents = {};
    for (let i = 0; i < 10; i++) recents = recordSlashUse(recents, `x${i}`, i, 3);
    expect(Object.keys(recents).sort()).toEqual(["x7", "x8", "x9"]);
  });
});
