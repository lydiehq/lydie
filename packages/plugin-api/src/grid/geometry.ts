import type { Cell, Rect } from "./selection.ts";
// Grid geometry from the model, never from the DOM: column offsets, frozen (sticky) leading columns,
// fixed-height body items (rows, group headers, "add" rows), the rendered window and hit testing.
// Content coordinates: x from the left edge of the scrolled content, y from its top (the sticky
// header is the first `header` pixels). Pure functions.
import { indexAt, prefixSums, visibleColumns } from "./virtual.ts";

export type GeometryInput = {
  columnWidths: readonly number[];
  // Leading columns that stay in place while scrolling sideways.
  frozen: number;
  rowHeight: number;
  // Sticky header and footer heights.
  header: number;
  footer: number;
  // Scrolled space before everything (a page margin the table bleeds into when scrolled
  // sideways); then a sticky gutter before column 0 (row handles), and a trailing column.
  inset?: number;
  leading: number;
  trailing: number;
  // Body items, each `rowHeight` tall.
  items: number;
  // Navigable row index → item index (rows skip group headers and "add" items).
  rowToItem: readonly number[];
};

export type Geometry = GeometryInput & {
  inset: number;
  offsets: readonly number[];
  // Item index → navigable row index, or -1.
  itemToRow: Int32Array;
  frozenWidth: number;
  totalWidth: number;
  bodyHeight: number;
  totalHeight: number;
};

export function createGeometry(input: GeometryInput): Geometry {
  const offsets = prefixSums(input.columnWidths);
  const itemToRow = new Int32Array(input.items).fill(-1);
  input.rowToItem.forEach((item, row) => {
    if (item < input.items) itemToRow[item] = row;
  });
  const frozen = Math.min(input.frozen, input.columnWidths.length);
  const bodyHeight = input.items * input.rowHeight;
  const inset = Math.max(0, input.inset ?? 0);
  return {
    ...input,
    inset,
    frozen,
    offsets,
    itemToRow,
    frozenWidth: offsets[frozen] ?? 0,
    totalWidth: inset + input.leading + (offsets.at(-1) ?? 0) + input.trailing,
    bodyHeight,
    totalHeight: input.header + bodyHeight + input.footer,
  };
}

// The same geometry with one column's width changed (a resize drag).
export function withColumnWidth(g: Geometry, col: number, width: number): Geometry {
  if (g.columnWidths[col] === width) return g;
  const columnWidths = g.columnWidths.slice();
  columnWidths[col] = width;
  return createGeometry({ ...g, columnWidths });
}

export function columnCount(g: Geometry): number {
  return g.columnWidths.length;
}

export function itemTop(g: Geometry, item: number): number {
  return g.header + item * g.rowHeight;
}

export function rowTop(g: Geometry, row: number): number {
  return itemTop(g, g.rowToItem[row] ?? 0);
}

export function isFrozen(g: Geometry, col: number): boolean {
  return col < g.frozen;
}

// x in content coordinates (frozen columns: where they sit before scrolling; they stick once the
// inset has scrolled away).
export function columnLeft(g: Geometry, col: number): number {
  return g.inset + g.leading + (g.offsets[col] ?? 0);
}

// Where the sticky gutter starts in the viewport: at the inset, then pinned at the left edge.
export function stickyStart(g: Geometry, scrollLeft: number): number {
  return Math.max(0, g.inset - scrollLeft);
}

export function columnWidth(g: Geometry, col: number): number {
  return g.columnWidths[col] ?? 0;
}

// Width of the gap the grid leaves for columns [frozen, start) that are not rendered.
export function spacerBefore(g: Geometry, start: number): number {
  return Math.max(0, (g.offsets[start] ?? g.frozenWidth) - g.frozenWidth);
}

export type Box = { x: number; y: number; width: number; height: number };

export function cellBox(g: Geometry, cell: Cell): Box {
  return {
    x: columnLeft(g, cell.col),
    y: rowTop(g, cell.row),
    width: columnWidth(g, cell.col),
    height: g.rowHeight,
  };
}

// A range as up to two boxes: the part over frozen columns (drawn in the sticky layer) and the
// part over scrolling columns. Rows of a range are contiguous items unless group headers sit
// between them; the box spans from the first row's top to the last row's bottom.
export function rangeBoxes(g: Geometry, rect: Rect): { frozen: Box | null; scrolling: Box | null } {
  const y = rowTop(g, rect.top);
  const height = rowTop(g, rect.bottom) + g.rowHeight - y;
  const part = (from: number, to: number): Box | null => {
    if (from > to) return null;
    const x = columnLeft(g, from);
    return { x, y, width: columnLeft(g, to) + columnWidth(g, to) - x, height };
  };
  return {
    frozen: part(rect.left, Math.min(rect.right, g.frozen - 1)),
    scrolling: part(Math.max(rect.left, g.frozen), rect.right),
  };
}

export type Scroll = { top: number; left: number; width: number; height: number };

// The rendered window: body items [rowStart, rowEnd) and scrolling columns [colStart, colEnd).
export type Viewport = { rowStart: number; rowEnd: number; colStart: number; colEnd: number };

export const EMPTY_VIEWPORT: Viewport = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 };

export function sameViewport(a: Viewport, b: Viewport): boolean {
  return (
    a.rowStart === b.rowStart &&
    a.rowEnd === b.rowEnd &&
    a.colStart === b.colStart &&
    a.colEnd === b.colEnd
  );
}

function bodyViewport(g: Geometry, scroll: Scroll): number {
  return Math.max(g.rowHeight, scroll.height - g.header - g.footer);
}

// Items and scrolling columns actually on screen (no overscan).
export function onScreen(g: Geometry, scroll: Scroll): Viewport {
  const rows = g.items;
  const first = Math.max(0, Math.min(rows, Math.floor(scroll.top / g.rowHeight)));
  const last = Math.max(
    first,
    Math.min(rows, Math.ceil((scroll.top + bodyViewport(g, scroll)) / g.rowHeight)),
  );
  const cols = columnCount(g);
  // Scrolling columns show between the sticky part and the right edge (offsets coordinates).
  const from = Math.max(0, scroll.left - g.inset) + g.frozenWidth;
  const to = scroll.left + scroll.width - g.inset - g.leading;
  const range = visibleColumns(g.offsets, from, Math.max(0, to - from), 0);
  const colStart = Math.max(g.frozen, Math.min(range.start, cols));
  return {
    rowStart: first,
    rowEnd: last,
    colStart,
    colEnd: Math.max(colStart, Math.min(cols, range.end)),
  };
}

// The window to render: the screen plus overscan. `previous` is returned while the window is the
// same, so scrolling within a row re-renders nothing and a fling adds a few rows per frame
// (rendering in larger jumps made single frames long).
export function nextViewport(
  g: Geometry,
  scroll: Scroll,
  previous: Viewport,
  overscan: { rows: number; cols: number } = { rows: 8, cols: 2 },
): Viewport {
  const screen = onScreen(g, scroll);
  const cols = columnCount(g);
  const next = {
    rowStart: Math.max(0, screen.rowStart - overscan.rows),
    rowEnd: Math.min(g.items, screen.rowEnd + overscan.rows),
    colStart: Math.max(g.frozen, screen.colStart - overscan.cols),
    colEnd: Math.min(cols, screen.colEnd + overscan.cols),
  };
  return sameViewport(next, previous) ? previous : next;
}

// The scroll position that shows a cell whole (frozen columns never scroll sideways).
export function reveal(g: Geometry, cell: Cell, scroll: Scroll): { top: number; left: number } {
  let { top, left } = scroll;
  const y = rowTop(g, cell.row) - g.header;
  const visible = bodyViewport(g, scroll);
  if (y < top) top = y;
  else if (y + g.rowHeight > top + visible) top = y + g.rowHeight - visible;
  if (cell.col >= g.frozen) {
    const x = g.offsets[cell.col] ?? 0;
    const w = columnWidth(g, cell.col);
    // Hidden under the sticky columns (possible only once the inset has scrolled away).
    if (left > g.inset && left > x + g.inset - g.frozenWidth) left = x + g.inset - g.frozenWidth;
    const right = g.inset + g.leading + x + w;
    if (right > left + scroll.width)
      left = Math.min(x + g.inset - g.frozenWidth, right - scroll.width);
  }
  return { top: Math.max(0, top), left: Math.max(0, left) };
}

export type Hit = {
  // Body item under the point, or -1 in the header / -2 below the body.
  item: number;
  // Navigable row of that item, or -1.
  row: number;
  // Column, or -1 over the leading gutter / -2 past the last column.
  col: number;
  // Which half of the item the point is in.
  edge: "before" | "after";
};

// What is under a point given relative to the grid's viewport (its client box).
export function hitTest(g: Geometry, x: number, y: number, scroll: Scroll): Hit {
  let item: number;
  let edge: Hit["edge"] = "before";
  if (y < g.header) item = -1;
  else {
    const body = y - g.header + scroll.top;
    item = Math.floor(body / g.rowHeight);
    edge = body - item * g.rowHeight < g.rowHeight / 2 ? "before" : "after";
    if (item >= g.items) item = -2;
  }
  let col: number;
  const sticky = stickyStart(g, scroll.left);
  if (x < sticky + g.leading) col = -1;
  else if (x < sticky + g.leading + g.frozenWidth) col = indexAt(g.offsets, x - sticky - g.leading);
  else {
    const contentX = x + scroll.left - g.inset - g.leading;
    col = contentX >= (g.offsets.at(-1) ?? 0) ? -2 : indexAt(g.offsets, contentX);
  }
  return { item, row: item >= 0 ? (g.itemToRow[item] ?? -1) : -1, col, edge };
}

// The nearest navigable row to an item (for drags over group headers and past the ends).
export function nearestRow(g: Geometry, item: number): number {
  if (g.rowToItem.length === 0) return -1;
  if (item < 0) return 0;
  for (let i = Math.min(item, g.items - 1); i >= 0; i--) {
    const row = g.itemToRow[i]!;
    if (row >= 0) return row;
  }
  return 0;
}
