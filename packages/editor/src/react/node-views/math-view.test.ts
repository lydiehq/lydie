import { afterEach, describe, expect, it } from "bun:test";

import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

import { createLydieExtensions } from "../../extensions";
import { loadKatex, mathBlockView, mathInlineView } from "./math-view";

let editor: Editor | undefined;

afterEach(() => {
  editor?.destroy();
  editor = undefined;
});

const text = (value: string) => ({ type: "text", text: value });

// Positions: paragraph "ab" 1-3, mathBlock "x^2" 5-8, then paragraph "c$y$d" from 10, the
// inline math node at 11 with "y" at 12-13.
const DOC: JSONContent = {
  type: "doc",
  content: [
    { type: "paragraph", content: [text("ab")] },
    { type: "mathBlock", content: [text("x^2")] },
    {
      type: "paragraph",
      content: [text("c"), { type: "mathInline", content: [text("y")] }, text("d")],
    },
    { type: "mathBlock" },
  ],
};

function createEditor(withViews = true) {
  editor = new Editor({
    extensions: createLydieExtensions(
      withViews ? { nodeViews: { mathBlock: mathBlockView, mathInline: mathInlineView } } : {},
    ),
    content: DOC,
  });
  return editor;
}

function select(target: Editor, pos: number) {
  const { state } = target.view;
  target.view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)));
}

function press(target: Editor, key: string) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  const { view } = target;
  return view.someProp("handleKeyDown", (f) => f(view, event)) ?? false;
}

const parentAtHead = (target: Editor) => target.state.selection.$head.parent.type.name;
const blocks = (target: Editor) =>
  [...target.view.dom.querySelectorAll<HTMLElement>('[data-type="math-block"]')] as const;

describe("math view", () => {
  it("typesets the LaTeX once KaTeX has loaded", async () => {
    const target = createEditor();
    await loadKatex();
    const [block] = blocks(target);
    expect(block?.querySelector("[data-math-preview] .katex")).not.toBeNull();
    expect(block?.querySelector("[data-math-source]")?.textContent).toBe("x^2");
    const inline = target.view.dom.querySelector('[data-type="math-inline"]');
    expect(inline?.querySelector("[data-math-preview] .katex")).not.toBeNull();
  });

  it("marks an empty equation instead of typesetting nothing", () => {
    const target = createEditor();
    const empty = blocks(target)[1];
    expect(empty?.querySelector("[data-math-preview]")?.hasAttribute("data-empty")).toBe(true);
  });

  it("re-renders when the source changes", async () => {
    const target = createEditor();
    await loadKatex();
    const before = blocks(target)[0]?.querySelector("[data-math-preview]")?.innerHTML;
    target.view.dispatch(target.state.tr.insertText("+1", 8));
    const after = blocks(target)[0]?.querySelector("[data-math-preview]")?.innerHTML;
    expect(after).not.toBe(before);
    expect(target.state.doc.child(1).textContent).toBe("x^2+1");
  });

  it("marks the node the caret is in as editing", () => {
    const target = createEditor();
    select(target, 2);
    expect(blocks(target)[0]?.hasAttribute("data-editing")).toBe(false);
    select(target, 6);
    expect(blocks(target)[0]?.hasAttribute("data-editing")).toBe(true);
    select(target, 2);
    expect(blocks(target)[0]?.hasAttribute("data-editing")).toBe(false);
  });

  it("edits the source when the typeset form is clicked", () => {
    const target = createEditor();
    select(target, 2);
    const preview = blocks(target)[0]?.querySelector("[data-math-preview]");
    preview?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    expect(parentAtHead(target)).toBe("mathBlock");
    expect(target.state.selection.head).toBe(8);
  });

  it("leaves a read-only editor's selection alone on click", () => {
    const target = createEditor();
    target.setEditable(false);
    select(target, 2);
    const preview = blocks(target)[0]?.querySelector("[data-math-preview]");
    preview?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    expect(target.state.selection.head).toBe(2);
  });
});

describe("arrow keys into math", () => {
  it("enters a math block from the end of the block before it", () => {
    const target = createEditor();
    select(target, 3);
    expect(press(target, "ArrowRight")).toBe(true);
    expect(parentAtHead(target)).toBe("mathBlock");
    expect(target.state.selection.head).toBe(5);
  });

  it("enters a math block at its end from the start of the block after it", () => {
    const target = createEditor();
    select(target, 10);
    expect(press(target, "ArrowLeft")).toBe(true);
    expect(target.state.selection.head).toBe(8);
  });

  it("enters inline math from either side", () => {
    const target = createEditor();
    select(target, 11);
    expect(press(target, "ArrowRight")).toBe(true);
    expect(target.state.selection.head).toBe(12);
    expect(parentAtHead(target)).toBe("mathInline");
    select(target, 14);
    expect(press(target, "ArrowLeft")).toBe(true);
    expect(target.state.selection.head).toBe(13);
  });

  it("leaves other moves to ProseMirror and the browser", () => {
    const target = createEditor();
    select(target, 2);
    expect(press(target, "ArrowRight")).toBe(false);
    select(target, 6);
    expect(press(target, "ArrowRight")).toBe(false);
  });

  it("works without the view too: the decoration is headless", () => {
    const target = createEditor(false);
    select(target, 6);
    const block = target.view.dom.querySelector('[data-type="math-block"]');
    expect(block?.hasAttribute("data-editing")).toBe(true);
    expect(block?.querySelector("[data-math-preview]")).toBeNull();
  });
});
