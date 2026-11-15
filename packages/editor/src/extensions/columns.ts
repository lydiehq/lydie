import { mergeAttributes, Node } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import type { Node as ProseMirrorNode, Slice } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { dropPoint } from "@tiptap/pm/transform";
import type { EditorView } from "@tiptap/pm/view";

import { sideHit } from "./column-layout";
import type { Box, LayoutBlock, Point, Side } from "./column-layout";
import { columnResize, columnsStacked, columnStacking, columnWidths } from "./column-resize";

// Blocks side by side, as in Notion: a `columnList` row of `column`s, stored in Markdown as
// `::::columns` / `:::column{width="40%"}` directives (@lydie/markdown). Rows are made by dropping
// a block beside another one or with `insertColumns`; a row left with one column dissolves.

export type ColumnAttrs = { width: number | null };
export type BlockRange = { from: number; to: number };
export type SideTarget = { pos: number; side: Side };

// More would leave each column too narrow for text in the page's width.
export const MAX_COLUMNS = 5;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    columns: {
      // A row of `count` empty columns, in place of an empty paragraph or after the caret's block.
      insertColumns: (count: number) => ReturnType;
    };
  }
}

const isColumn = (node: ProseMirrorNode | null | undefined) => node?.type.name === "column";
const isColumnList = (node: ProseMirrorNode | null | undefined) => node?.type.name === "columnList";

function containsColumns(content: Fragment) {
  let found = false;
  content.descendants((node) => {
    if (isColumnList(node)) found = true;
    return !found && !node.isTextblock;
  });
  return found;
}

// The depth of the innermost column around `pos`, or -1.
function columnDepth(doc: ProseMirrorNode, pos: number) {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth--) {
    if (isColumn($pos.node(depth))) return depth;
  }
  return -1;
}

// The dragged blocks: whole nodes of one parent (a NodeSelection or TipTap's NodeRangeSelection).
export function blockSource(state: EditorState): BlockRange | null {
  const { from, to } = state.selection;
  if (from >= to) return null;
  const $from = state.doc.resolve(from);
  const $to = state.doc.resolve(to);
  if ($from.depth !== $to.depth || !$from.sameParent($to) || $from.parent.inlineContent) {
    return null;
  }
  return { from, to };
}

// What a column holds when `source` moves into one: the blocks themselves, or list items and the
// like wrapped in a copy of their own parent.
function columnContent(doc: ProseMirrorNode, source: BlockRange): Fragment | null {
  const column = doc.type.schema.nodes.column!;
  const content = doc.slice(source.from, source.to).content;
  if (column.validContent(content)) return content;
  const parent = doc.resolve(source.from).parent;
  const wrapped = Fragment.from(parent.type.create(parent.attrs, content));
  return column.validContent(wrapped) ? wrapped : null;
}

// Whether `source` can be dropped beside the block at `target.pos`: a top-level block or a block
// in a column, not one of the dragged blocks or around them, no columns inside columns, and room
// for another column. Dropping a column's only content next to where it already is does nothing,
// so that is not a target either.
export function canDropBeside(doc: ProseMirrorNode, source: BlockRange, target: SideTarget) {
  const node = doc.nodeAt(target.pos);
  if (!node || !node.isBlock || isColumnList(node) || isColumn(node)) return false;
  const end = target.pos + node.nodeSize;
  if (target.pos < source.to && end > source.from) return false;
  const $target = doc.resolve(target.pos);
  const inColumn = isColumn($target.parent);
  if (!inColumn && $target.depth !== 0) return false;
  const content = columnContent(doc, source);
  if (!content || containsColumns(content)) return false;
  if (!inColumn) return true;

  const list = $target.node($target.depth - 1);
  const index = $target.index($target.depth - 1);
  const $source = doc.resolve(source.from);
  const wholeColumn =
    isColumn($source.parent) &&
    source.from === $source.start() &&
    source.to === $source.end() &&
    $source.node($source.depth - 1) === list &&
    $source.before($source.depth - 1) === $target.before($target.depth - 1);
  if (wholeColumn) {
    const sourceIndex = $source.index($source.depth - 1);
    if (sourceIndex === (target.side === "left" ? index - 1 : index + 1)) return false;
    return true;
  }
  return list.childCount < MAX_COLUMNS;
}

// Deletes whole blocks; a column (or row) they were all of goes with them.
export function removeBlocks(tr: Transaction, from: number, to: number) {
  const $from = tr.doc.resolve(from);
  for (let depth = $from.depth; depth > 0; depth--) {
    const parent = $from.node(depth);
    if (!isColumn(parent) && !isColumnList(parent)) break;
    if (from !== $from.start(depth) || to !== $from.end(depth)) break;
    from = $from.before(depth);
    to = $from.after(depth);
  }
  tr.delete(from, to);
}

// A row down to one column becomes that column's blocks.
function dissolveRowAt(tr: Transaction, pos: number | null) {
  if (pos === null) return;
  const node = tr.doc.nodeAt(pos);
  if (!isColumnList(node) || node!.childCount !== 1) return;
  tr.replaceWith(pos, pos + node!.nodeSize, node!.firstChild!.content);
}

function rowOf(doc: ProseMirrorNode, pos: number): number | null {
  const depth = columnDepth(doc, pos);
  return depth > 0 ? doc.resolve(pos).before(depth - 1) : null;
}

function mapped(tr: Transaction, from: number, pos: number | null) {
  if (pos === null) return null;
  const result = tr.mapping.slice(from).mapResult(pos, 1);
  return result.deleted ? null : result.pos;
}

// Puts the selection on the moved blocks, starting at `pos`.
function selectMoved(tr: Transaction, pos: number, count: number) {
  const $pos = tr.doc.resolve(pos);
  const node = $pos.nodeAfter;
  if (count === 1 && node && NodeSelection.isSelectable(node)) {
    tr.setSelection(NodeSelection.create(tr.doc, pos));
  } else {
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(pos + 1, tr.doc.content.size))));
  }
}

// Moves `source` into a new column beside the block at `target.pos`: a new row around a
// top-level block, or one more column in the row the block is in (all columns then share the
// row equally again).
export function dropBeside(tr: Transaction, source: BlockRange, target: SideTarget): boolean {
  const { doc } = tr;
  if (!canDropBeside(doc, source, target)) return false;
  const { column, columnList } = doc.type.schema.nodes;
  const content = columnContent(doc, source)!;
  const count = content.childCount;
  const sourceRow = rowOf(doc, source.from);
  const node = doc.nodeAt(target.pos)!;
  const $target = doc.resolve(target.pos);
  const start = tr.steps.length;
  let columnPos: number;

  if (isColumn($target.parent)) {
    const depth = $target.depth;
    columnPos = target.side === "left" ? $target.before(depth) : $target.after(depth);
    tr.insert(columnPos, column!.create(null, content));
    const rowPos = $target.before(depth - 1);
    tr.doc.nodeAt(rowPos)!.forEach((child, offset) => {
      if (child.attrs.width !== null) tr.setNodeAttribute(rowPos + 1 + offset, "width", null);
    });
  } else {
    const dragged = column!.create(null, content);
    const existing = column!.create(null, node);
    const left = target.side === "left";
    tr.replaceWith(
      target.pos,
      target.pos + node.nodeSize,
      columnList!.create(null, left ? [dragged, existing] : [existing, dragged]),
    );
    columnPos = left ? target.pos + 1 : target.pos + 1 + existing.nodeSize;
  }

  const afterInsert = tr.steps.length;
  const moved = tr.mapping.slice(start);
  removeBlocks(tr, moved.map(source.from, 1), moved.map(source.to, -1));
  dissolveRowAt(tr, mapped(tr, start, sourceRow));
  selectMoved(tr, tr.mapping.slice(afterInsert).map(columnPos + 1, 1), count);
  return true;
}

// Moves `source` to `insert` (a drop between blocks), clearing up a column it leaves empty.
export function moveBlocks(tr: Transaction, source: BlockRange, insert: number): boolean {
  if (insert >= source.from && insert <= source.to) return false;
  const { doc } = tr;
  const content = doc.slice(source.from, source.to).content;
  if (containsColumns(content) && columnDepth(doc, insert) > 0) return false;
  const sourceRow = rowOf(doc, source.from);
  const start = tr.steps.length;
  tr.insert(insert, content);
  const inserted = tr.mapping.slice(start).map(insert, -1);
  const afterInsert = tr.steps.length;
  const moved = tr.mapping.slice(start);
  removeBlocks(tr, moved.map(source.from, 1), moved.map(source.to, -1));
  dissolveRowAt(tr, mapped(tr, start, sourceRow));
  selectMoved(tr, tr.mapping.slice(afterInsert).map(inserted, 1), content.childCount);
  return true;
}

// Whether a drop between blocks at `pos` must be refused: a row cannot go inside a column.
export function refusesDrop(doc: ProseMirrorNode, pos: number, slice: Slice) {
  return containsColumns(slice.content) && columnDepth(doc, pos) > 0;
}

// The content box of a block's DOM node (top-level blocks carry the page's padding).
function contentBox(dom: HTMLElement): Box {
  const box = dom.getBoundingClientRect();
  const style = getComputedStyle(dom);
  return {
    left: box.left + (Number.parseFloat(style.paddingLeft) || 0),
    right: box.right - (Number.parseFloat(style.paddingRight) || 0),
    top: box.top,
    bottom: box.bottom,
  };
}

// The blocks near the pointer that a drop could go beside: the top-level blocks around the one
// under it, and for a row, the blocks in its columns.
function nearbyBlocks(view: EditorView, point: Point): LayoutBlock<number>[] {
  const { doc } = view.state;
  const hit = view.posAtCoords({ left: point.x, top: point.y });
  if (!hit || doc.childCount === 0) return [];
  const index = Math.min(doc.resolve(hit.pos).index(0), doc.childCount - 1);
  const blocks: LayoutBlock<number>[] = [];
  let pos = 0;
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i);
    if (Math.abs(i - index) <= 1) {
      if (isColumnList(child)) {
        child.forEach((column, columnOffset) => {
          column.forEach((block, blockOffset) => {
            const blockPos = pos + 1 + columnOffset + 1 + blockOffset;
            const dom = view.nodeDOM(blockPos);
            if (dom instanceof HTMLElement) blocks.push({ box: contentBox(dom), key: blockPos });
          });
        });
      } else {
        const dom = view.nodeDOM(pos);
        if (dom instanceof HTMLElement) blocks.push({ box: contentBox(dom), key: pos });
      }
    }
    pos += child.nodeSize;
  }
  return blocks;
}

// Where an internal block drag at `point` would land beside a block, if anywhere (nowhere while
// the editor stacks its rows).
export function sideTargetAt(
  view: EditorView,
  point: Point,
): { target: SideTarget; box: Box } | null {
  if (!view.dragging?.move || columnsStacked(view.state)) return null;
  const source = blockSource(view.state);
  if (!source) return null;
  const hit = sideHit(nearbyBlocks(view, point), point);
  if (!hit) return null;
  const target = { pos: hit.key, side: hit.side };
  return canDropBeside(view.state.doc, source, target) ? { target, box: hit.box } : null;
}

// Drops from the block handle: beside a block (columns), or between blocks when columns are
// involved (a column left empty goes, a row cannot go inside a column). Other drops are
// ProseMirror's own.
const columnDrops = () =>
  new Plugin({
    key: new PluginKey("columnDrops"),
    props: {
      handleDrop(view, event, slice, moved) {
        if (!moved || !view.dragging || !view.editable) return false;
        const source = blockSource(view.state);
        if (!source) return false;
        const point = { x: event.clientX, y: event.clientY };
        const { tr, doc } = view.state;
        const side = sideTargetAt(view, point);
        if (side) {
          if (!dropBeside(tr, source, side.target)) return false;
        } else {
          const fromColumn = columnDepth(doc, source.from) > 0;
          if (!fromColumn && !containsColumns(slice.content)) return false;
          const hit = view.posAtCoords({ left: point.x, top: point.y });
          if (!hit) return false;
          const insert = dropPoint(doc, hit.pos, slice) ?? hit.pos;
          if (refusesDrop(doc, insert, slice)) return true;
          if (!moveBlocks(tr, source, insert)) return true;
        }
        view.focus();
        view.dispatch(tr.scrollIntoView().setMeta("uiEvent", "drop"));
        return true;
      },
    },
  });

export const ColumnList = Node.create({
  name: "columnList",
  group: "block",
  content: "column+",
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-type="column-list"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "column-list" }), 0];
  },

  addCommands() {
    return {
      insertColumns:
        (count) =>
        ({ state, tr, dispatch }) => {
          const { column, columnList, paragraph } = state.schema.nodes;
          const n = Math.min(Math.max(Math.round(count), 2), MAX_COLUMNS);
          const row = columnList!.create(
            null,
            Array.from({ length: n }, () => column!.create(null, paragraph!.create())),
          );
          const { selection } = state;
          const { $from } = selection;
          // Rows live at the top level: next to the top-level block the caret is in.
          const from = $from.depth === 0 ? selection.from : $from.before(1);
          const block = state.doc.nodeAt(from);
          if (!block) return false;
          if (!dispatch) return true;
          const empty = block.type === paragraph && block.content.size === 0;
          const at = empty ? from : from + block.nodeSize;
          if (empty) tr.replaceWith(from, from + block.nodeSize, row);
          else tr.insert(at, row);
          // Inside the row, the first column, its paragraph.
          tr.setSelection(TextSelection.create(tr.doc, at + 3)).scrollIntoView();
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [columnWidths(), columnStacking(), columnDrops(), columnResize()];
  },
});

export const Column = Node.create({
  name: "column",
  content: "block+",
  isolating: true,

  addAttributes() {
    return {
      width: {
        default: null,
        parseHTML: (el) => {
          const width = Number.parseFloat(el.getAttribute("data-width") ?? "");
          return Number.isFinite(width) && width > 0 ? width : null;
        },
        renderHTML: (attrs) =>
          attrs.width === null ? {} : { "data-width": String(attrs.width as number) },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "column" }), 0];
  },
});
