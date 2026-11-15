import { afterEach, describe, expect, it } from "bun:test";

import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";

import { createLydieExtensions } from "./index";

let editor: Editor | undefined;

afterEach(() => {
  editor?.destroy();
  editor = undefined;
});

const text = (value: string): JSONContent => ({ type: "text", text: value });
const p = (value: string): JSONContent => ({ type: "paragraph", content: [text(value)] });
const item = (value: string, ...nested: JSONContent[]): JSONContent => ({
  type: "listItem",
  content: [p(value), ...nested],
});
const bullets = (...items: JSONContent[]): JSONContent => ({ type: "bulletList", content: items });
const cell = (type: "tableHeader" | "tableCell", value: string): JSONContent => ({
  type,
  attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null },
  content: [p(value)],
});

// Blocks a click, Escape or the drag handle can select as a whole.
const selectable: [string, JSONContent][] = [
  ["paragraph", p("words")],
  ["heading", { type: "heading", attrs: { level: 2 }, content: [text("title")] }],
  ["code block", { type: "codeBlock", attrs: { language: "ts" }, content: [text("let a")] }],
  ["blockquote", { type: "blockquote", content: [p("quoted")] }],
  [
    "callout",
    { type: "callout", attrs: { kind: "note", title: null, fold: null }, content: [p("noted")] },
  ],
  ["bullet list", bullets(item("one"), item("two"))],
  [
    "task list",
    {
      type: "taskList",
      content: [{ type: "taskItem", attrs: { checked: false }, content: [p("todo")] }],
    },
  ],
  ["image", { type: "image", attrs: { src: "a.png", alt: "a", title: null } }],
  [
    "embed",
    { type: "embed", attrs: { target: "Note", heading: null, blockId: null, alias: null } },
  ],
  ["math block", { type: "mathBlock", content: [text("x^2")] }],
  ["horizontal rule", { type: "horizontalRule" }],
  [
    "row of columns",
    {
      type: "columnList",
      content: [
        { type: "column", attrs: { width: null }, content: [p("left")] },
        { type: "column", attrs: { width: null }, content: [p("right")] },
      ],
    },
  ],
  [
    "table",
    {
      type: "table",
      content: [
        { type: "tableRow", content: [cell("tableHeader", "h1"), cell("tableHeader", "h2")] },
        { type: "tableRow", content: [cell("tableCell", "c1"), cell("tableCell", "c2")] },
      ],
    },
  ],
];

function createEditor(...content: JSONContent[]) {
  editor = new Editor({ extensions: createLydieExtensions(), content: { type: "doc", content } });
  return editor;
}

const blocks = (target: Editor) => (target.getJSON() as JSONContent).content ?? [];

// Presses a key through the editor's keydown handlers, as notion-shortcuts.test.ts does.
function press(target: Editor, key: string, shiftKey = false) {
  const event = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
  const { view } = target;
  return view.someProp("handleKeyDown", (f) => f(view, event)) ?? false;
}

function selectNode(target: Editor, pos: number) {
  target.view.dispatch(target.state.tr.setSelection(NodeSelection.create(target.state.doc, pos)));
}

// The position of the first node of `type` whose text is `value`.
function posOf(target: Editor, type: string, value: string) {
  let found = -1;
  target.state.doc.descendants((node, pos) => {
    if (found === -1 && node.type.name === type && node.textContent === value) found = pos;
  });
  if (found === -1) throw new Error(`no ${type} "${value}"`);
  return found;
}

describe("Tab on a selected block", () => {
  // LYD-378: the indent handler typed a tab over the selection, which replaced the block.
  it.each(selectable)("never replaces a selected %s", (_name, block) => {
    const target = createEditor(p("before"), block, p("after"));
    const before = blocks(target);
    selectNode(target, target.state.doc.child(0).nodeSize);
    press(target, "Tab");
    expect(blocks(target)).toEqual(before);
    press(target, "Tab", true);
    expect(blocks(target)).toEqual(before);
  });

  it("never replaces the first block of the document", () => {
    const list = bullets(item("one"), item("two"));
    const target = createEditor(list, p("after"));
    selectNode(target, 0);
    press(target, "Tab");
    expect(blocks(target)).toEqual([list, p("after")]);
  });

  it("indents a selected list item under the one above, and Shift-Tab brings it back", () => {
    const target = createEditor(bullets(item("one"), item("two")), p("after"));
    selectNode(target, posOf(target, "listItem", "two"));
    expect(press(target, "Tab")).toBe(true);
    expect(blocks(target)).toEqual([bullets(item("one", bullets(item("two")))), p("after")]);
    // Still the item that is selected, so Tab and Shift-Tab can go on moving it.
    expect(target.state.selection).toBeInstanceOf(NodeSelection);
    expect((target.state.selection as NodeSelection).node.textContent).toBe("two");
    expect(press(target, "Tab", true)).toBe(true);
    expect(blocks(target)).toEqual([bullets(item("one"), item("two")), p("after")]);
  });

  it("keeps a first list item, which has nothing to indent under", () => {
    const target = createEditor(bullets(item("one"), item("two")), p("after"));
    selectNode(target, posOf(target, "listItem", "one"));
    expect(press(target, "Tab")).toBe(true);
    expect(blocks(target)).toEqual([bullets(item("one"), item("two")), p("after")]);
  });

  // Selecting a table selects all of its cells (prosemirror-tables); the table's own Tab added a row.
  it("moves into a selected table's first cell", () => {
    const table = selectable.find(([name]) => name === "table")![1];
    const target = createEditor(p("before"), table, p("after"));
    selectNode(target, target.state.doc.child(0).nodeSize);
    expect(press(target, "Tab")).toBe(true);
    expect(blocks(target)).toEqual([p("before"), table, p("after")]);
    const { $from } = target.state.selection;
    expect(target.state.selection.empty).toBe(true);
    expect($from.parent.textContent).toBe("h1");
  });

  it("puts the tab after a selected wiki link, which stays", () => {
    const link = {
      type: "wikiLink",
      attrs: { target: "Note", heading: null, blockId: null, alias: null },
    };
    const target = createEditor({ type: "paragraph", content: [text("see "), link] });
    selectNode(target, 5);
    press(target, "Tab");
    expect(blocks(target)).toEqual([
      { type: "paragraph", content: [text("see "), link, text("\t")] },
    ]);
  });

  it("still types a tab into text", () => {
    const target = createEditor(p("ab"));
    target.commands.setTextSelection(2);
    press(target, "Tab");
    expect(blocks(target)).toEqual([p("a\tb")]);
  });
});
