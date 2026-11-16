import { describe, expect, test } from "bun:test";

import { EditorState, getLydieSchema } from "@lydie/plugin-api/editor";
import type { JSONContent, Transaction } from "@lydie/plugin-api/editor";

import { findKey, findMatches, findPlugin, matchAt, remapMatches, stepMatch } from "./find.ts";
import type { FindMeta, FindState } from "./find.ts";

const schema = getLydieSchema();

function doc(...blocks: JSONContent[]) {
  return schema.nodeFromJSON({ type: "doc", content: blocks });
}

function p(...content: JSONContent[]): JSONContent {
  return { type: "paragraph", content };
}

function text(value: string, marks: string[] = []): JSONContent {
  return { type: "text", text: value, marks: marks.map((type) => ({ type })) };
}

function texts(node: ReturnType<typeof doc>, query: string) {
  return findMatches(node, query).map((m) => node.textBetween(m.from, m.to, "\n", "@"));
}

describe("findMatches", () => {
  test("finds every occurrence, case-insensitively, in document order", () => {
    const d = doc(p(text("The cat sat. THE end.")), p(text("Then there")));
    expect(texts(d, "the")).toEqual(["The", "THE", "The", "the"]);
    const first = findMatches(d, "the")[0];
    expect(first).toEqual({ from: 1, to: 4 });
  });

  test("matches across text split by marks", () => {
    const d = doc(p(text("hello "), text("wor", ["bold"]), text("ld", ["italic"]), text("!")));
    const matches = findMatches(d, "World");
    expect(matches).toEqual([{ from: 7, to: 12 }]);
    expect(d.textBetween(7, 12)).toBe("world");
  });

  test("does not match across paragraphs or hard breaks", () => {
    const d = doc(
      p(text("foo")),
      p(text("bar")),
      p(text("baz"), { type: "hardBreak" }, text("qux")),
    );
    expect(findMatches(d, "foobar")).toEqual([]);
    expect(findMatches(d, "bazqux")).toEqual([]);
    expect(texts(d, "qux")).toEqual(["qux"]);
  });

  test("finds text in nested blocks (lists, headings, code)", () => {
    const d = doc(
      { type: "heading", attrs: { level: 2 }, content: [text("Plan")] },
      {
        type: "bulletList",
        content: [{ type: "listItem", content: [p(text("a plan"))] }],
      },
      { type: "codeBlock", content: [text("plan()")] },
    );
    expect(texts(d, "PLAN")).toEqual(["Plan", "plan", "plan"]);
  });

  test("an inline atom matches whole, by its text", () => {
    const d = doc(
      p(text("see "), { type: "wikiLink", attrs: { target: "Roadmap" } }, text(" now")),
    );
    const [match] = findMatches(d, "road");
    // The link is one position (5..6); a partial match covers the whole atom.
    expect(match).toEqual({ from: 5, to: 6 });
    expect(texts(d, "now")).toEqual(["now"]);
  });

  test("non-overlapping, and nothing for an empty query", () => {
    expect(findMatches(doc(p(text("aaaa"))), "aa")).toHaveLength(2);
    expect(findMatches(doc(p(text("abc"))), "")).toEqual([]);
    expect(findMatches(doc(p(text("abc"))), "x")).toEqual([]);
  });
});

describe("stepMatch and matchAt", () => {
  test("next and previous wrap around", () => {
    expect(stepMatch(0, 3, 1)).toBe(1);
    expect(stepMatch(2, 3, 1)).toBe(0);
    expect(stepMatch(0, 3, -1)).toBe(2);
    expect(stepMatch(1, 3, -1)).toBe(0);
    expect(stepMatch(-1, 3, 1)).toBe(0);
    expect(stepMatch(-1, 3, -1)).toBe(2);
    expect(stepMatch(0, 0, 1)).toBe(-1);
  });

  test("matchAt picks the first match at or after a position, else the first", () => {
    const matches = [
      { from: 2, to: 4 },
      { from: 10, to: 12 },
    ];
    expect(matchAt(matches, 0)).toBe(0);
    expect(matchAt(matches, 5)).toBe(1);
    expect(matchAt(matches, 10)).toBe(1);
    expect(matchAt(matches, 11)).toBe(0);
    expect(matchAt([], 3)).toBe(-1);
  });
});

describe("findPlugin state", () => {
  // The plugin's reducer, driven by stand-in transactions (the state only reads meta, docChanged
  // and the mapping).
  const plugin = findPlugin();
  const spec = plugin.spec.state!;
  const d = doc(p(text("one two one")), p(text("One")));
  const state = { doc: d } as EditorState;
  function apply(prev: FindState, meta?: FindMeta, docChanged = false, shift = 0) {
    const tr = {
      getMeta: (key: unknown) => (key === findKey ? meta : undefined),
      docChanged,
      mapping: { map: (pos: number) => pos + shift },
    } as unknown as Transaction;
    return spec.apply(tr, prev, state, state);
  }
  const initial = spec.init({}, state);

  test("a query finds matches from the anchor and decorates them", () => {
    const s = apply(initial, { query: "one", anchor: 3 });
    expect(s.matches).toHaveLength(3);
    expect(s.current).toBe(1);
    expect(s.decorations.find()).toHaveLength(3);
    // ProseMirror keeps an inline decoration's attributes on its (untyped) `type`.
    const attrs = (x: unknown) => (x as { type: { attrs: Record<string, string> } }).type.attrs;
    const current = s.decorations.find().filter((x) => "data-find-current" in attrs(x));
    expect(current.map((x) => x.from)).toEqual([s.matches[1]!.from]);
  });

  test("steps wrap, and an empty query clears everything", () => {
    let s = apply(initial, { query: "one" });
    expect(s.current).toBe(0);
    s = apply(s, { step: -1 });
    expect(s.current).toBe(2);
    s = apply(s, { step: 1 });
    expect(s.current).toBe(0);
    s = apply(s, { query: "" });
    expect(s.matches).toEqual([]);
    expect(s.decorations.find()).toEqual([]);
  });

  test("unrelated transactions keep the state; edits search again", () => {
    const s = apply(initial, { query: "one" });
    expect(apply(s)).toBe(s);
    let live = EditorState.create({ doc: d, plugins: [plugin] });
    live = live.apply(live.tr.setMeta(findKey, { query: "one" }));
    live = live.apply(live.tr.setMeta(findKey, { step: 1 }));
    // Typed before the second "one" of the first paragraph: still the current match.
    live = live.apply(live.tr.insertText("x ", 9));
    const edited = findKey.getState(live)!;
    expect(edited.matches).toEqual(findMatches(live.doc, "one"));
    expect(edited.current).toBe(1);
  });
});

describe("remapMatches", () => {
  // Random edits to a document full of matches: searching only the touched blocks and moving
  // the other matches gives what a full search gives.
  test("equals a full search after any edit", () => {
    let seed = 7;
    const random = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const words = ["cat", "Cat", "concat", "dog", "ca", "t", "the cat sat"];
    const blocks: JSONContent[] = Array.from({ length: 40 }, (_, i) =>
      i % 7 === 3
        ? {
            type: "bulletList",
            content: [{ type: "listItem", content: [p(text(`item ${words[i % words.length]}`))] }],
          }
        : i % 5 === 0
          ? { type: "heading", attrs: { level: 2 }, content: [text(`H cat ${i}`)] }
          : p(text(`${words[i % words.length]} and ${words[(i * 3) % words.length]}`)),
    );
    let state = EditorState.create({ doc: doc(...blocks) });
    let matches = findMatches(state.doc, "cat");
    for (let round = 0; round < 400; round++) {
      const size = state.doc.content.size;
      const a = 1 + random(size - 1);
      const b = Math.min(size - 1, a + random(12));
      let tr = state.tr;
      try {
        switch (random(6)) {
          case 0:
            tr = tr.insertText(words[random(words.length)]!, a);
            break;
          case 1:
            tr = tr.delete(a, b);
            break;
          case 2:
            tr = tr.split(a);
            break;
          case 3:
            tr = tr.join(a);
            break;
          case 4:
            tr = tr.addMark(a, b, schema.marks.bold!.create());
            break;
          default:
            tr = tr.insertText("c", a).insertText("at", a + 1);
        }
      } catch {
        continue;
      }
      if (!tr.docChanged) continue;
      matches = remapMatches(tr, matches, "cat");
      state = state.apply(tr);
      expect(matches).toEqual(findMatches(state.doc, "cat"));
    }
  });
});
