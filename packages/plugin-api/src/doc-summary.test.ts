import { describe, expect, test } from "bun:test";

import type { JSONContent } from "@lydie/editor";

import { editedAgo, summarizeDoc, wordsLabel } from "./doc-summary.ts";

const text = (value: string, marks?: string[]): JSONContent => ({
  type: "text",
  text: value,
  ...(marks ? { marks: marks.map((type) => ({ type })) } : {}),
});
const p = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", content });
const h = (value: string): JSONContent => ({
  type: "heading",
  attrs: { level: 1 },
  content: [text(value)],
});
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });

describe("summarizeDoc", () => {
  test("reads columns left to right", () => {
    const column = (value: string): JSONContent => ({
      type: "column",
      content: [p(text(value))],
    });
    const summary = summarizeDoc(
      doc({ type: "columnList", content: [column("Left"), column("Right")] }),
      "x",
    );
    expect(summary.lines).toEqual([
      { kind: "text", spans: [{ text: "Left" }] },
      { kind: "text", spans: [{ text: "Right" }] },
    ]);
  });

  test("skips a heading that repeats the title; keeps marks and links", () => {
    const summary = summarizeDoc(
      doc(
        h("Roadmap"),
        p(text("Ship "), text("v2", ["bold"]), text(" with "), {
          type: "wikiLink",
          attrs: { target: "Sync", heading: "Plan", blockId: null, alias: null },
        }),
      ),
      "roadmap",
    );
    expect(summary.lines).toEqual([
      {
        kind: "text",
        spans: [
          { text: "Ship " },
          { text: "v2", bold: true },
          { text: " with " },
          { text: "Sync › Plan", link: true },
        ],
      },
    ]);
    expect(summary.words).toBe(5);
    expect(summary.truncated).toBe(false);
  });

  test("lists, tasks (also written loosely), quotes and code; stops after six lines", () => {
    const item = (...content: JSONContent[]): JSONContent => ({ type: "listItem", content });
    const summary = summarizeDoc(
      doc(
        {
          type: "orderedList",
          attrs: { start: 3 },
          content: [
            item(p(text("three")), {
              type: "bulletList",
              content: [item(p(text("nested")))],
            }),
          ],
        },
        {
          type: "bulletList",
          content: [item(p({ type: "rawInline", attrs: { source: "[x] " } }, text("done")))],
        },
        { type: "blockquote", content: [p(text("quoted"))] },
        { type: "codeBlock", content: [text("let a = 1;\nlet b = 2;")] },
        p(text("sixth")),
        p(text("seventh")),
      ),
      "Notes",
    );
    expect(summary.lines.map((l) => [l.kind, l.spans.map((s) => s.text).join("")])).toEqual([
      ["bullet", "three"],
      ["bullet", "nested"],
      ["task", "done"],
      ["quote", "quoted"],
      ["code", "let a = 1;"],
      ["text", "sixth"],
    ]);
    expect(summary.lines[0]).toMatchObject({ marker: "3.", depth: 0 });
    expect(summary.lines[1]).toMatchObject({ marker: "•", depth: 1 });
    expect(summary.lines[2]).toMatchObject({ checked: true });
    expect(summary.truncated).toBe(true);
  });

  test("long text is cut with an ellipsis; an empty document has no lines", () => {
    const long = summarizeDoc(doc(p(text("word ".repeat(100)))), "x");
    const line = long.lines[0]!.spans[0]!.text;
    expect(line.length).toBeLessThanOrEqual(281);
    expect(line.endsWith("…")).toBe(true);
    expect(summarizeDoc(doc(), "x")).toEqual({ lines: [], truncated: false, words: 0 });
  });
});

test("facts", () => {
  const now = Date.parse("2026-11-13T12:00:00Z");
  expect(editedAgo("2026-11-13T11:59:50Z", now)).toBe("Edited just now");
  expect(editedAgo("2026-11-13T09:00:00Z", now)).toBe("Edited 3 hours ago");
  expect(editedAgo("not a date", now)).toBe("");
  expect(wordsLabel(0)).toBe("");
  expect(wordsLabel(1)).toBe("1 word");
  expect(wordsLabel(340)).toBe("340 words");
});
