import { describe, expect, test } from "bun:test";

import { EditorState, getLydieSchema } from "@lydie/plugin-api/editor";
import type { DecorationSet, ProseMirrorNode, Transaction } from "@lydie/plugin-api/editor";

import { linkDecorations, updateLinkDecorations } from "./extension.ts";

const schema = getLydieSchema();
const targets = {
  unresolved: new Set(["missing", "gone"]),
  icons: new Map([["notes", "📝"]]),
};
const TARGETS = ["missing", "gone", "notes", "other"];

function random(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// What a set draws: each decoration's range and attributes (or a widget's key).
function drawn(set: DecorationSet, doc: ProseMirrorNode) {
  return set
    .find(0, doc.content.size)
    .map((d) => {
      const { type, spec } = d as unknown as { type: { attrs?: object }; spec: { key?: string } };
      return `${d.from}-${d.to}:${spec.key ?? JSON.stringify(type.attrs)}`;
    })
    .sort();
}

function randomEdit(state: EditorState, next: () => number): Transaction {
  const pick = <T>(items: readonly T[]) => items[Math.floor(next() * items.length)]!;
  const tr = state.tr;
  const size = state.doc.content.size;
  const textPositions: number[] = [];
  const wikiLinks: number[] = [];
  state.doc.descendants((node, pos) => {
    if (node.isTextblock)
      for (let i = 0; i <= node.content.size; i++) textPositions.push(pos + 1 + i);
    if (node.type.name === "wikiLink") wikiLinks.push(pos);
    return true;
  });
  const at = pick(textPositions);
  switch (Math.floor(next() * 9)) {
    case 0:
      return tr.insertText(pick(["x", " ", "word"]), at);
    case 1:
      return tr.insert(at, schema.nodes.wikiLink!.create({ target: pick(TARGETS) }));
    case 2: {
      const $at = state.doc.resolve(at);
      const to = Math.min($at.end(), at + 1 + Math.floor(next() * 4));
      return tr.addMark(at, to, schema.marks.link!.create({ href: pick(TARGETS) }));
    }
    case 3:
      return tr.removeMark(0, size, schema.marks.link);
    case 4: {
      const $at = state.doc.resolve(at);
      return tr.delete(at, Math.min($at.end(), at + 1 + Math.floor(next() * 3)));
    }
    case 5:
      return wikiLinks.length
        ? tr.setNodeAttribute(pick(wikiLinks), "target", pick(TARGETS))
        : tr.insertText("y", at);
    case 6:
      return tr.split(at);
    case 7: {
      // Join a block with the one before it (Backspace at its start).
      const $at = state.doc.resolve(at);
      const before = $at.before();
      return before > 0 && state.doc.resolve(before).nodeBefore?.isTextblock
        ? tr.join(before)
        : tr.insertText("z", at);
    }
    default:
      return tr.replaceWith(0, size, state.doc.content);
  }
}

describe("link decorations", () => {
  test("an edit redraws what a full pass over the document would, after random edits", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const next = random(seed);
      const paragraph = (text: string, target: string) =>
        schema.nodes.paragraph!.create(null, [
          schema.text(text),
          schema.nodes.wikiLink!.create({ target }),
          schema.text(" and ", []),
          schema.text("a link", [schema.marks.link!.create({ href: target })]),
        ]);
      let state = EditorState.create({
        doc: schema.nodes.doc!.create(
          null,
          TARGETS.map((target, i) => paragraph(`Block ${i} `, target)),
        ),
      });
      let set = linkDecorations(state.doc, targets);
      expect(drawn(set, state.doc).length).toBeGreaterThan(0);
      for (let step = 0; step < 80; step++) {
        const tr = randomEdit(state, next);
        state = state.apply(tr);
        set = updateLinkDecorations(tr, set, targets);
        expect(drawn(set, state.doc)).toEqual(
          drawn(linkDecorations(state.doc, targets), state.doc),
        );
      }
    }
  });
});
