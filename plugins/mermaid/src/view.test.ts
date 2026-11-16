import { expect, test } from "bun:test";

import { EditorState, getLydieSchema, isDiagramLanguage } from "@lydie/plugin-api/editor";
import type { DecorationSet, ProseMirrorNode, Transaction } from "@lydie/plugin-api/editor";

import { applyState, build, diagramBlocks, initState, mermaidKey } from "./view.ts";

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

// What a set draws: each widget's key (its drawing) and the hidden blocks.
function drawn(set: DecorationSet) {
  return set.find().map((d) => {
    const { spec, type } = d as unknown as { spec: { key?: string }; type: { attrs?: object } };
    return `${d.from}-${d.to}:${spec.key ?? JSON.stringify(type.attrs)}`;
  });
}

test("an edit draws what drawing every diagram again would, and the preview waits for a pause", () => {
  const schema = getLydieSchema();
  const code = (language: string | null, text: string) =>
    schema.nodes.codeBlock!.create({ language }, schema.text(text));
  const para = (text: string) => schema.nodes.paragraph!.create(null, schema.text(text));
  let doc = schema.nodes.doc!.create(null, [
    para("Intro"),
    code("mermaid", "graph TB\n  A --> B"),
    para("Between"),
    code("ts", "const a = 1"),
    code("mermaid", "pie"),
  ]);
  let state = EditorState.create({ doc });
  let value = initState(doc);
  let seed = 3;
  const next = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const pick = <T>(items: readonly T[]) => items[Math.floor(next() * items.length)]!;
  const apply = (tr: Transaction) => {
    state = state.apply(tr);
    value = applyState(tr, value);
    doc = state.doc;
  };
  for (let step = 0; step < 150; step++) {
    const blocks: { node: ProseMirrorNode; pos: number }[] = [];
    doc.descendants((node, pos) => {
      if (node.isTextblock) blocks.push({ node, pos });
      return !node.isTextblock;
    });
    const block = pick(blocks);
    const inside = block.pos + 1 + Math.floor(next() * (block.node.content.size + 1));
    const tr = state.tr;
    const codeBlocks = blocks.filter((b) => b.node.type.name === "codeBlock");
    switch (Math.floor(next() * 7)) {
      case 0:
        tr.insertText(pick(["x", "\n", " --> C"]), inside);
        break;
      case 1:
        if (codeBlocks.length)
          tr.setNodeAttribute(pick(codeBlocks).pos, "language", pick(["mermaid", "ts", null]));
        break;
      case 2:
        tr.insert(pick([0, doc.content.size]), code("mermaid", "graph LR\n  X --> Y"));
        break;
      case 3:
        if (blocks.length > 1) tr.delete(block.pos, block.pos + block.node.nodeSize);
        break;
      case 4: {
        const diagrams = diagramBlocks(doc);
        if (diagrams.length) tr.setMeta(mermaidKey, { toggle: pick(diagrams).from });
        break;
      }
      case 5:
        tr.setMeta(mermaidKey, { redraw: true });
        break;
      default:
        tr.insertText("y", inside);
    }
    apply(tr);
    expect(drawn(value.decorations)).toEqual(drawn(build(doc, value.editing, value.drawn)));
  }

  // A diagram being edited keeps its drawing while its code is typed, until a redraw.
  const [first] = diagramBlocks(doc);
  if (!first) return;
  if (!value.editing.has(first.from)) apply(state.tr.setMeta(mermaidKey, { toggle: first.from }));
  const before = drawn(value.decorations);
  apply(state.tr.insertText("x", first.to - 1));
  expect(drawn(value.decorations)).toEqual(before);
  apply(state.tr.setMeta(mermaidKey, { redraw: true }));
  expect(drawn(value.decorations)).not.toEqual(before);
});
