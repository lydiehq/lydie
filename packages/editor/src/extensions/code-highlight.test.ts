import { beforeAll, describe, expect, it } from "bun:test";

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
import type { DecorationSet } from "@tiptap/pm/view";

import { getLydieSchema } from "../schema";
import {
  buildCodeHighlight,
  codeHighlightKey,
  codeHighlightPlugin,
  loadGrammars,
} from "./code-highlight";

const schema = getLydieSchema();
const code = (language: string | null, text: string) =>
  schema.nodes.codeBlock!.create({ language }, text ? schema.text(text) : undefined);
const para = (text: string) => schema.nodes.paragraph!.create(null, schema.text(text));

const SAMPLES = [
  "const a = 1;\nfunction f(x) { return x * 2; }",
  "def f(x):\n    return x + 1  # one",
  "SELECT id, name FROM users WHERE id = 42;",
  '{ "a": [1, 2, true], "b": null }',
  '<div class="x">hi</div>',
];
const LANGUAGES = [null, "javascript", "python", "sql", "json", "xml", "nonsense"];

// A small deterministic generator, so a failure can be replayed.
function random(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function render(set: DecorationSet, doc: ProseMirrorNode) {
  return set
    .find(0, doc.content.size)
    .map(
      (d) =>
        `${d.from}-${d.to}:${(d as unknown as { type: { attrs: { class: string } } }).type.attrs.class}`,
    )
    .sort();
}

function codeBlocks(doc: ProseMirrorNode) {
  const found: { node: ProseMirrorNode; pos: number }[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "codeBlock") found.push({ node, pos });
    return !node.isTextblock;
  });
  return found;
}

function randomEdit(state: EditorState, next: () => number): Transaction {
  const pick = <T>(items: readonly T[]) => items[Math.floor(next() * items.length)]!;
  const tr = state.tr;
  const blocks = codeBlocks(state.doc);
  const kind = Math.floor(next() * 8);
  const block = blocks.length ? pick(blocks) : undefined;
  const inside = (b: { node: ProseMirrorNode; pos: number }) =>
    b.pos + 1 + Math.floor(next() * (b.node.content.size + 1));
  if (kind === 0 && block)
    return tr.insertText(pick(["x", " ", "\n", "(", '"', "42"]), inside(block));
  if (kind === 1 && block && block.node.content.size > 1) {
    const from = inside(block);
    return tr.delete(
      from,
      Math.min(from + 1 + Math.floor(next() * 5), block.pos + block.node.nodeSize - 1),
    );
  }
  if (kind === 2 && block) return tr.setNodeAttribute(block.pos, "language", pick(LANGUAGES));
  if (kind === 3) {
    const at = pick([0, state.doc.content.size]);
    return tr.insert(at, code(pick(LANGUAGES), pick(SAMPLES)));
  }
  if (kind === 4 && block) {
    return tr.setBlockType(block.pos + 1, block.pos + 1, schema.nodes.paragraph!);
  }
  if (kind === 5) {
    let target: number | undefined;
    state.doc.descendants((node, pos) => {
      if (target === undefined && node.type.name === "paragraph" && next() < 0.5) target = pos;
      return !node.isTextblock;
    });
    if (target !== undefined) {
      return tr.setBlockType(target + 1, target + 1, schema.nodes.codeBlock!, {
        language: pick(LANGUAGES),
      });
    }
  }
  if (kind === 6 && block) return tr.delete(block.pos, block.pos + block.node.nodeSize);
  // A whole-document replace, as a collaborator's change arrives through y-prosemirror.
  if (kind === 7) return tr.replaceWith(0, state.doc.content.size, state.doc.content);
  return tr.insertText("y", 1);
}

describe("code highlighting, incrementally", () => {
  beforeAll(() => loadGrammars());

  it("matches highlighting the whole document again, after random edits", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const next = random(seed);
      const content = [];
      for (let i = 0; i < 6; i++) {
        content.push(para(`Paragraph ${i}`));
        content.push(code(LANGUAGES[i % LANGUAGES.length]!, SAMPLES[i % SAMPLES.length]!));
      }
      let state = EditorState.create({
        doc: schema.nodes.doc!.create(null, content),
        plugins: [codeHighlightPlugin("codeBlock")],
      });
      for (let step = 0; step < 60; step++) {
        state = state.apply(randomEdit(state, next));
        // Unlabelled blocks keep their guess until typing pauses; then all must match.
        state = state.apply(state.tr.setMeta(codeHighlightKey, "guess"));
        const incremental = codeHighlightKey.getState(state)!;
        const full = buildCodeHighlight(state.doc, "codeBlock");
        expect(render(incremental.decorations, state.doc)).toEqual(
          render(full.decorations, state.doc),
        );
        expect(incremental.blocks.find().map((d) => d.from)).toEqual(
          full.blocks.find().map((d) => d.from),
        );
      }
    }
  });

  it("keeps an unlabelled block's guessed language while typing, and guesses again on a pause", () => {
    let state = EditorState.create({
      doc: schema.nodes.doc!.create(null, [code(null, SAMPLES[0]!)]),
      plugins: [codeHighlightPlugin("codeBlock")],
    });
    const guess = () => codeHighlightKey.getState(state)!.blocks.find()[0]!.spec.guess;
    const guessed = guess().language;
    expect(guessed).toBeString();
    state = state.apply(state.tr.insertText(" let b = 2;", state.doc.content.size - 1));
    expect(guess()).toEqual({ language: guessed, stale: true });
    expect(codeHighlightKey.getState(state)!.stale).toBe(true);
    state = state.apply(state.tr.setMeta(codeHighlightKey, "guess"));
    expect(guess()?.stale).toBe(false);
    expect(codeHighlightKey.getState(state)!.stale).toBe(false);
  });

  it("leaves other code blocks' decorations alone when one is edited", () => {
    let state = EditorState.create({
      doc: schema.nodes.doc!.create(null, [
        code("javascript", SAMPLES[0]!),
        para("between"),
        code("python", SAMPLES[1]!),
      ]),
      plugins: [codeHighlightPlugin("codeBlock")],
    });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)));
    const before = codeHighlightKey.getState(state)!.decorations;
    const second = codeBlocks(state.doc)[1]!;
    const secondDecos = before.find(second.pos, second.pos + second.node.nodeSize);
    state = state.apply(state.tr.insertText("x", 3));
    const after = codeHighlightKey.getState(state)!.decorations;
    const moved = codeBlocks(state.doc)[1]!;
    // The same Decoration objects' specs, mapped one position on: not highlighted again.
    expect(after.find(moved.pos, moved.pos + moved.node.nodeSize).map((d) => d.from - 1)).toEqual(
      secondDecos.map((d) => d.from),
    );
  });
});
