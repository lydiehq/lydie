import { expect, test } from "bun:test";

import { getLydieSchema, isDiagramLanguage } from "@lydie/plugin-api/editor";

import { diagramBlocks } from "./view.ts";

test("a diagram is a code block whose language is mermaid, wherever it sits", () => {
  const schema = getLydieSchema();
  const code = (language: string | null, text: string) => ({
    type: "codeBlock",
    attrs: { language },
    content: [{ type: "text", text }],
  });
  const doc = schema.nodeFromJSON({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Intro" }] },
      code("mermaid", "graph TB\n  A --> B"),
      code("ts", "const a = 1"),
      {
        type: "bulletList",
        content: [{ type: "listItem", content: [code("Mermaid", 'pie\n  "a": 1')] }],
      },
    ],
  });
  expect(diagramBlocks(doc).map((b) => b.source)).toEqual(["graph TB\n  A --> B", 'pie\n  "a": 1']);
  expect(isDiagramLanguage("mmd")).toBe(true);
  expect(isDiagramLanguage("mermaidish")).toBe(false);
  expect(isDiagramLanguage(null)).toBe(false);
});
