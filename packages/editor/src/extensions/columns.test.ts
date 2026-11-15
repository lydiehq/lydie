import { afterEach, describe, expect, it } from "bun:test";

import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { Slice } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";

import { setColumnsStacked } from "./column-resize";
import { canDropBeside, dropBeside, MAX_COLUMNS, moveBlocks, refusesDrop } from "./columns";
import type { BlockRange, SideTarget } from "./columns";
import { createLydieExtensions } from "./index";

let editor: Editor | undefined;

afterEach(() => {
  editor?.destroy();
  editor = undefined;
});

const text = (value: string): JSONContent => ({ type: "text", text: value });
const p = (value?: string): JSONContent =>
  value ? { type: "paragraph", content: [text(value)] } : { type: "paragraph" };
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });
const column = (...content: JSONContent[]): JSONContent => ({
  type: "column",
  attrs: { width: null },
  content,
});
const row = (...columns: JSONContent[]): JSONContent => ({ type: "columnList", content: columns });
const bullets = (...items: string[]): JSONContent => ({
  type: "bulletList",
  content: items.map((item) => ({ type: "listItem", content: [p(item)] })),
});

function createEditor(content: JSONContent) {
  editor = new Editor({ extensions: createLydieExtensions(), content });
  return editor;
}

// The block (or list item) whose text is `value`: its position and size.
function block(target: Editor, value: string, type?: string): BlockRange {
  let found: BlockRange | null = null;
  target.state.doc.descendants((node, pos) => {
    if (found) return false;
    if ((type ? node.type.name === type : node.isTextblock) && node.textContent === value) {
      found = { from: pos, to: pos + node.nodeSize };
    }
    return true;
  });
  if (!found) throw new Error(`no block "${value}"`);
  return found;
}

const beside = (target: Editor, value: string, side: SideTarget["side"]): SideTarget => ({
  pos: block(target, value).from,
  side,
});

function drop(target: Editor, source: BlockRange, to: SideTarget) {
  const { tr } = target.state;
  const ok = dropBeside(tr, source, to);
  if (ok) target.view.dispatch(tr);
  return ok;
}

function move(target: Editor, source: BlockRange, insert: number) {
  const { tr } = target.state;
  const ok = moveBlocks(tr, source, insert);
  if (ok) target.view.dispatch(tr);
  return ok;
}

// The blocks, without the empty paragraph TrailingNode keeps after a final row.
function content(target: Editor) {
  const blocks = [...((target.getJSON() as JSONContent).content ?? [])];
  const last = blocks.at(-1);
  if (blocks.length > 1 && last?.type === "paragraph" && !last.content) blocks.pop();
  return blocks;
}

describe("insertColumns", () => {
  it("replaces an empty paragraph and puts the caret in the first column", () => {
    const e = createEditor(doc(p("Intro"), p()));
    e.commands.setTextSelection(e.state.doc.content.size - 1);
    expect(e.commands.insertColumns(3)).toBe(true);
    expect(content(e)).toEqual([p("Intro"), row(column(p()), column(p()), column(p()))]);
    const { $from } = e.state.selection;
    expect($from.node(-1).type.name).toBe("column");
    expect($from.index(1)).toBe(0);
  });

  it("goes after a block with text, and after the row when the caret is in a column", () => {
    const e = createEditor(doc(p("Intro")));
    e.commands.setTextSelection(3);
    e.commands.insertColumns(2);
    expect(content(e)).toEqual([p("Intro"), row(column(p()), column(p()))]);
    e.commands.insertContent("x");
    e.commands.insertColumns(2);
    const blocks = content(e)!;
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "columnList", "columnList"]);
  });

  it("makes between two and the maximum", () => {
    const e = createEditor(doc(p()));
    e.commands.setTextSelection(1);
    e.commands.insertColumns(9);
    expect(e.state.doc.firstChild!.childCount).toBe(MAX_COLUMNS);
  });
});

describe("dropping beside a block", () => {
  it("makes a row of a top-level block and the dragged one", () => {
    const e = createEditor(doc(p("A"), p("B"), p("C")));
    expect(drop(e, block(e, "C"), beside(e, "A", "right"))).toBe(true);
    expect(content(e)).toEqual([row(column(p("A")), column(p("C"))), p("B")]);
    expect(drop(e, block(e, "B"), beside(e, "A", "left"))).toBe(true);
    expect(content(e)).toEqual([row(column(p("B")), column(p("A")), column(p("C")))]);
  });

  it("moves several blocks into one new column and selects them", () => {
    const e = createEditor(doc(p("A"), p("B"), p("C")));
    const range = { from: block(e, "B").from, to: block(e, "C").to };
    drop(e, range, beside(e, "A", "right"));
    expect(content(e)).toEqual([row(column(p("A")), column(p("B"), p("C")))]);
    expect(e.state.selection.$from.parent.textContent).toBe("B");
  });

  it("adds a column to a row and shares the row equally again", () => {
    const e = createEditor(
      doc(
        row(
          { ...column(p("A")), attrs: { width: 70 } },
          { ...column(p("B")), attrs: { width: 30 } },
        ),
        p("D"),
      ),
    );
    drop(e, block(e, "D"), beside(e, "B", "left"));
    expect(content(e)).toEqual([row(column(p("A")), column(p("D")), column(p("B")))]);
  });

  it("dissolves the row a column left, keeping the blocks", () => {
    const e = createEditor(doc(row(column(p("A")), column(p("B"))), p("C")));
    drop(e, block(e, "B"), beside(e, "C", "right"));
    expect(content(e)).toEqual([p("A"), row(column(p("C")), column(p("B")))]);
  });

  it("moves a column within its row", () => {
    const e = createEditor(doc(row(column(p("A")), column(p("B")), column(p("C")))));
    drop(e, block(e, "A"), beside(e, "C", "right"));
    expect(content(e)).toEqual([row(column(p("B")), column(p("C")), column(p("A")))]);
  });

  it("wraps list items in their list", () => {
    const e = createEditor(doc(p("A"), bullets("one", "two")));
    drop(e, block(e, "two", "listItem"), beside(e, "A", "right"));
    expect(content(e)).toEqual([row(column(p("A")), column(bullets("two"))), bullets("one")]);
  });

  it("refuses targets that would do nothing or break the layout", () => {
    const e = createEditor(doc(row(column(p("A")), column(p("B"))), p("C"), bullets("x", "y")));
    const { doc: d } = e.state;
    // A column's only block, back beside the column next to it on the same side.
    expect(canDropBeside(d, block(e, "B"), beside(e, "A", "right"))).toBe(false);
    expect(canDropBeside(d, block(e, "B"), beside(e, "A", "left"))).toBe(true);
    // Beside itself, beside the list it is in, or a row into a column.
    expect(canDropBeside(d, block(e, "C"), beside(e, "C", "left"))).toBe(false);
    expect(canDropBeside(d, block(e, "y", "listItem"), beside(e, "x", "right"))).toBe(false);
    const wholeRow = { from: 0, to: d.firstChild!.nodeSize };
    expect(canDropBeside(d, wholeRow, beside(e, "C", "right"))).toBe(false);
  });

  it("stops at the maximum number of columns", () => {
    const names = Array.from({ length: MAX_COLUMNS }, (_, i) => String(i));
    const e = createEditor(doc(row(...names.map((n) => column(p(n)))), p("extra")));
    expect(canDropBeside(e.state.doc, block(e, "extra"), beside(e, "0", "left"))).toBe(false);
    // Moving one of the row's own columns frees its place.
    expect(canDropBeside(e.state.doc, block(e, "4"), beside(e, "0", "left"))).toBe(true);
  });

  it("is one undo step", () => {
    const e = createEditor(doc(p("A"), p("B")));
    drop(e, block(e, "B"), beside(e, "A", "right"));
    e.commands.undo();
    expect(content(e)).toEqual([p("A"), p("B")]);
  });
});

describe("moving blocks between blocks", () => {
  it("removes the column a moved block leaves empty, and the row with it", () => {
    const e = createEditor(doc(row(column(p("A")), column(p("B"))), p("C")));
    expect(move(e, block(e, "B"), e.state.doc.content.size)).toBe(true);
    expect(content(e)).toEqual([p("A"), p("C"), p("B")]);
  });

  it("keeps a column that still has blocks", () => {
    const e = createEditor(doc(row(column(p("A"), p("A2")), column(p("B"))), p("C")));
    move(e, block(e, "A2"), e.state.doc.content.size);
    expect(content(e)).toEqual([row(column(p("A")), column(p("B"))), p("C"), p("A2")]);
  });

  it("moves into a column", () => {
    const e = createEditor(doc(row(column(p("A")), column(p("B"))), p("C")));
    move(e, block(e, "C"), block(e, "B").to);
    expect(content(e)).toEqual([row(column(p("A")), column(p("B"), p("C")))]);
  });

  it("refuses a row inside a column, and a drop onto itself", () => {
    const e = createEditor(doc(row(column(p("A")), column(p("B"))), p("C")));
    const { doc: d } = e.state;
    const wholeRow = { from: 0, to: d.firstChild!.nodeSize };
    const slice = new Slice(d.slice(wholeRow.from, wholeRow.to).content, 0, 0);
    expect(refusesDrop(d, block(e, "B").to, slice)).toBe(true);
    expect(refusesDrop(d, d.content.size, slice)).toBe(false);
    expect(move(e, block(e, "C"), block(e, "C").from)).toBe(false);
  });
});

describe("dropping from the block handle", () => {
  // No layout in happy-dom: each top-level block gets a box (100…500 wide, 40 tall, 10 apart)
  // and the pointer resolves into the block on its line.
  function layOut(target: Editor) {
    const { view } = target;
    const tops: { pos: number; top: number }[] = [];
    view.state.doc.forEach((node, pos, i) => {
      const dom = view.nodeDOM(pos) as HTMLElement;
      const top = i * 50;
      tops.push({ pos, top });
      dom.getBoundingClientRect = () => new DOMRect(100, top, 400, 40);
    });
    view.posAtCoords = ({ top }) => {
      const hit = [...tops].reverse().find((t) => t.top <= top) ?? tops[0]!;
      return { pos: hit.pos + 1, inside: hit.pos };
    };
  }

  function dragAndDrop(target: Editor, source: BlockRange, x: number, y: number) {
    const { view } = target;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, source.from)));
    const slice = view.state.selection.content();
    view.dragging = { slice, move: true };
    // happy-dom's DragEvent drops the coordinates; handleDrop reads only these.
    const event = new MouseEvent("drop", { clientX: x, clientY: y }) as DragEvent;
    return view.someProp("handleDrop", (f) => f(view, event, slice, true));
  }

  it("drops beside a block at its right edge", () => {
    const e = createEditor(doc(p("A"), p("B")));
    layOut(e);
    expect(dragAndDrop(e, block(e, "B"), 490, 20)).toBe(true);
    expect(content(e)).toEqual([row(column(p("A")), column(p("B")))]);
  });

  it("makes no row in an editor that stacks its rows (narrow)", () => {
    const e = createEditor(doc(p("A"), p("B")));
    layOut(e);
    setColumnsStacked(e.view, true);
    expect(dragAndDrop(e, block(e, "B"), 490, 20)).toBeFalsy();
    expect(content(e)).toEqual([p("A"), p("B")]);
  });

  it("leaves a drop in the middle of a block to ProseMirror", () => {
    const e = createEditor(doc(p("A"), p("B")));
    layOut(e);
    expect(dragAndDrop(e, block(e, "B"), 300, 20)).toBeFalsy();
    expect(content(e)).toEqual([p("A"), p("B")]);
  });
});

describe("schema", () => {
  it("keeps a row's columns isolated from each other", () => {
    const e = createEditor(doc(row(column(p("A")), column(p("B")))));
    e.commands.setTextSelection(block(e, "B").from + 1);
    e.commands.joinBackward();
    expect(content(e)).toEqual([row(column(p("A")), column(p("B")))]);
  });

  it("round-trips through HTML (copy and paste)", () => {
    const e = createEditor(doc(row({ ...column(p("A")), attrs: { width: 40 } }, column(p("B")))));
    const html = e.getHTML();
    const other = new Editor({ extensions: createLydieExtensions(), content: html });
    expect(other.getJSON().content as unknown).toEqual(content(e));
    other.destroy();
  });
});
