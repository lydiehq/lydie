import { describe, expect, test } from "bun:test";

import type { DocumentOutline, JSONContent } from "@lydie/plugin-api";

import {
  defaultLabel,
  formatWikiLink,
  hrefToTarget,
  isExternalHref,
  isImageTarget,
  linkKey,
  looksLikeUrl,
  parsePreviewTarget,
  parseWikiTarget,
  sectionOf,
  targetToHref,
} from "./targets.ts";

describe("wiki targets", () => {
  test("parse note, heading, block and alias", () => {
    expect(parseWikiTarget("Note")).toEqual({
      target: "Note",
      heading: null,
      blockId: null,
      alias: null,
    });
    expect(parseWikiTarget("Folder/Note.md#Part two|see")).toEqual({
      target: "Folder/Note",
      heading: "Part two",
      blockId: null,
      alias: "see",
    });
    expect(parseWikiTarget("Note#^abc-1")).toMatchObject({ blockId: "abc-1", heading: null });
    expect(parseWikiTarget("#Local")).toMatchObject({ target: "", heading: "Local" });
  });

  test("format and label round-trip", () => {
    const t = parseWikiTarget("Note#^b1|alias");
    expect(formatWikiLink(t)).toBe("[[Note#^b1|alias]]");
    expect(defaultLabel(parseWikiTarget("Note#Part"))).toBe("Note > Part");
  });
});

describe("Markdown hrefs", () => {
  test("internal links ⇄ targets, Obsidian's encoding", () => {
    expect(targetToHref({ target: "My note", heading: "Part two", blockId: null })).toBe(
      "My%20note.md#Part%20two",
    );
    expect(hrefToTarget("My%20note.md#Part%20two")).toMatchObject({
      target: "My note",
      heading: "Part two",
    });
    expect(hrefToTarget("./Sub/Note.md#^x")).toMatchObject({ target: "Sub/Note", blockId: "x" });
  });

  test("external vs internal", () => {
    expect(isExternalHref("https://example.com")).toBeTrue();
    expect(isExternalHref("mailto:a@b.c")).toBeTrue();
    expect(isExternalHref("Note.md")).toBeFalse();
    expect(isExternalHref("C:\\notes\\a.md")).toBeFalse();
    expect(looksLikeUrl("example.com/docs")).toBeTrue();
    expect(looksLikeUrl("Meeting notes")).toBeFalse();
    expect(isImageTarget("diagram.PNG")).toBeTrue();
    expect(linkKey("Folder/Ünïcode Note.md")).toBe("ünïcode note");
  });

  test("preview targets", () => {
    expect(parsePreviewTarget("doc:01563e3a-b5d3-d676-4c61-efb99302bd5b#^blk")).toEqual({
      kind: "doc",
      id: "01563e3a-b5d3-d676-4c61-efb99302bd5b",
      heading: null,
      blockId: "blk",
    });
    expect(parsePreviewTarget("https://x.dev").kind).toBe("url");
    expect(parsePreviewTarget("Note#H").kind).toBe("wiki");
  });
});

describe("linked sections", () => {
  const h = (level: number, text: string): JSONContent => ({
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }],
  });
  const p = (text: string): JSONContent => ({
    type: "paragraph",
    content: [{ type: "text", text }],
  });
  const content: JSONContent = {
    type: "doc",
    content: [
      p("intro"),
      h(2, "Plan"),
      p("a"),
      h(3, "Detail"),
      p("b"),
      h(2, "Later ^h1"),
      p("c ^blk"),
    ],
  };
  const outline: DocumentOutline = {
    headings: [],
    blocks: [{ index: 6, type: "paragraph", id: "blk", text: "c" }],
  };

  test("a heading's section runs to the next heading of the same level", () => {
    expect(sectionOf(content, outline, { heading: "plan" }).nodes).toHaveLength(4);
    expect(sectionOf(content, outline, { heading: "Later" }).nodes).toHaveLength(2);
  });

  test("a block is itself; missing parts say so", () => {
    expect(sectionOf(content, outline, { blockId: "blk" }).nodes).toEqual([p("c ^blk")]);
    expect(sectionOf(content, outline, { blockId: "nope" }).found).toBeFalse();
    expect(sectionOf(content, outline, { heading: "Nope" }).found).toBeFalse();
    expect(sectionOf(content, outline, {}).nodes).toHaveLength(7);
  });
});
