import { describe, expect, test } from "bun:test";

import { anchorAt, docText, rangeOf } from "./text.ts";

// Just enough of a ProseMirror node for `docText`: paragraphs of text, and one inline atom.
type Inline = string | { atom: string };
function doc(...paragraphs: Inline[][]) {
  let pos = 0;
  const blocks = paragraphs.map((inlines) => {
    const blockPos = pos;
    let offset = 0;
    const children = inlines.map((inline) => {
      const at = offset;
      const size = typeof inline === "string" ? inline.length : 1;
      offset += size;
      return typeof inline === "string"
        ? { node: { isText: true, isLeaf: true, text: inline, nodeSize: size }, at }
        : {
            node: {
              isText: false,
              isLeaf: true,
              nodeSize: 1,
              type: { name: "mention", spec: { leafText: () => inline.atom } },
            },
            at,
          };
    });
    pos += offset + 2;
    return {
      blockPos,
      node: {
        isTextblock: true,
        content: { size: offset },
        descendants(fn: (node: unknown, offset: number) => unknown) {
          for (const child of children) fn(child.node, child.at);
        },
      },
    };
  });
  return {
    descendants(fn: (node: unknown, pos: number) => unknown) {
      for (const block of blocks) fn(block.node, block.blockPos);
    },
  } as never;
}

describe("docText", () => {
  test("joins blocks with a line break and skips empty ones", () => {
    const text = docText(doc(["One two"], [], ["three"]));
    expect(text.text).toBe("One two\nthree");
    // "One two" starts at 1 (inside the first paragraph); "three" inside the third.
    expect(text.starts[0]).toBe(1);
    expect(text.starts[text.text.indexOf("three")]).toBe(12);
  });

  test("counts an inline atom as its text, at one position", () => {
    const text = docText(doc(["See ", { atom: "Atlas" }, " now"]));
    expect(text.text).toBe("See Atlas now");
    expect(rangeOf(text, { quote: "Atlas", prefix: "", suffix: "" })).toEqual({ from: 5, to: 6 });
  });
});

describe("anchors", () => {
  const text = docText(doc(["A filter on the cloud sync peer."], ["A filter too."]));

  test("a quote becomes a range and back", () => {
    const range = rangeOf(text, { quote: "cloud sync", prefix: "", suffix: "" })!;
    expect(range).toEqual({ from: 17, to: 27 });
    expect(anchorAt(text, range)).toEqual({
      quote: "cloud sync",
      prefix: "A filter on the ",
      suffix: " peer.\nA filter too.",
    });
  });

  test("the text around a quote picks the right repeat", () => {
    const second = rangeOf(text, { quote: "A filter", prefix: "", suffix: " too" })!;
    expect(second.from).toBe(35);
  });

  test("a selection is trimmed, and one without text is no anchor", () => {
    expect(anchorAt(text, { from: 16, to: 28 })?.quote).toBe("cloud sync");
    expect(anchorAt(text, { from: 16, to: 17 })).toBeNull();
    expect(anchorAt(text, { from: 33, to: 34 })).toBeNull();
  });

  test("a passage that is gone has no range", () => {
    expect(rangeOf(text, { quote: "nowhere", prefix: "", suffix: "" })).toBeNull();
  });
});
