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
  openableUrl,
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

describe("openable URLs", () => {
  test("http, https and mailto open", () => {
    expect(openableUrl("https://example.com/a?b=1#c")).toBe("https://example.com/a?b=1#c");
    expect(openableUrl("http://example.com")).toBe("http://example.com/");
    expect(openableUrl("HTTPS://Example.com")).toBe("https://example.com/");
    expect(openableUrl("mailto:someone@example.com")).toBe("mailto:someone@example.com");
  });

  test("other schemes do not", () => {
    for (const href of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "slack://open",
      "x-custom-app:do-something",
      "lydie:user/abc",
      "ftp://example.com",
      "blob:https://example.com/uuid",
    ]) {
      expect(openableUrl(href)).toBeNull();
    }
  });

  test("whitespace and control characters do not hide a scheme", () => {
    for (const href of [
      " javascript:alert(1)",
      "\tjavascript:alert(1)",
      "\njavascript:alert(1)",
      "\u0000javascript:alert(1)",
      "\u001fjavascript:alert(1)",
      "java\tscript:alert(1)",
      "java\nscript:alert(1)",
      "java\rscript:alert(1)",
      " \u0001data:text/html,x",
    ]) {
      expect(openableUrl(href)).toBeNull();
    }
    expect(openableUrl("  https://example.com  ")).toBe("https://example.com/");
    expect(openableUrl("ht\ttps://example.com")).toBe("https://example.com/");
  });

  test("relative and malformed hrefs do not", () => {
    for (const href of ["", "Note.md", "/d/abc", "//example.com", "https://", "http://[::1"]) {
      expect(openableUrl(href)).toBeNull();
    }
  });
});
