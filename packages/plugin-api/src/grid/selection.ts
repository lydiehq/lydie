// Cell selection for a spreadsheet-like grid: an anchor and a focus (the active cell) span a
// rectangle; arrows move, Shift extends, Mod jumps to the edge of the data. Rows and columns are
// indexes into what the grid shows (navigable rows, visible columns). Pure functions.

export type Cell = { row: number; col: number };
export type GridSelection = { anchor: Cell; focus: Cell };
export type Rect = { top: number; left: number; bottom: number; right: number };
export type GridSize = { rows: number; cols: number };

// Whether a cell holds no value; undefined when the grid does not know (not loaded).
export type IsBlank = (cell: Cell) => boolean | undefined;

export function single(cell: Cell): GridSelection {
  return { anchor: cell, focus: cell };
}

export function rectOf(selection: GridSelection): Rect {
  const { anchor, focus } = selection;
  return {
    top: Math.min(anchor.row, focus.row),
    bottom: Math.max(anchor.row, focus.row),
    left: Math.min(anchor.col, focus.col),
    right: Math.max(anchor.col, focus.col),
  };
}

export function isRange(selection: GridSelection): boolean {
  return (
    selection.anchor.row !== selection.focus.row || selection.anchor.col !== selection.focus.col
  );
}

export function inRect(rect: Rect, row: number, col: number): boolean {
  return row >= rect.top && row <= rect.bottom && col >= rect.left && col <= rect.right;
}

export function rectSize(rect: Rect): { rows: number; cols: number } {
  return { rows: rect.bottom - rect.top + 1, cols: rect.right - rect.left + 1 };
}

export function sameSelection(a: GridSelection | null, b: GridSelection | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.anchor.row === b.anchor.row &&
    a.anchor.col === b.anchor.col &&
    a.focus.row === b.focus.row &&
    a.focus.col === b.focus.col
  );
}

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));

export function clampSelection(selection: GridSelection, size: GridSize): GridSelection | null {
  if (size.rows === 0 || size.cols === 0) return null;
  const fit = (c: Cell) => ({ row: clamp(c.row, size.rows - 1), col: clamp(c.col, size.cols - 1) });
  const next = { anchor: fit(selection.anchor), focus: fit(selection.focus) };
  return sameSelection(next, selection) ? selection : next;
}

// Every cell of rows [from, to] (whole-row selection); the active cell goes to the first column.
export function rowsSelection(from: number, to: number, size: GridSize): GridSelection {
  return { anchor: { row: from, col: Math.max(0, size.cols - 1) }, focus: { row: to, col: 0 } };
}

// Every cell of columns [from, to] (whole-column selection); the active cell goes to the first row.
export function columnsSelection(from: number, to: number, size: GridSize): GridSelection {
  return { anchor: { row: Math.max(0, size.rows - 1), col: from }, focus: { row: 0, col: to } };
}

export function allSelection(size: GridSize): GridSelection {
  return { anchor: { row: 0, col: 0 }, focus: { row: size.rows - 1, col: size.cols - 1 } };
}

// Whole rows / whole columns: a range covering every column / every row.
export function isWholeRows(selection: GridSelection, size: GridSize): boolean {
  const rect = rectOf(selection);
  return rect.left === 0 && rect.right === size.cols - 1 && size.cols > 1;
}

export function isWholeColumns(selection: GridSelection, size: GridSize): boolean {
  const rect = rectOf(selection);
  return rect.top === 0 && rect.bottom === size.rows - 1 && size.rows > 1;
}

// Cmd/Ctrl+arrow, as spreadsheets do it: from a filled cell with a filled neighbour, to the last
// filled cell of that run; otherwise to the next filled cell; otherwise to the edge. A cell whose
// state is unknown (not loaded) ends the search at the edge.
export function dataEdge(
  from: Cell,
  dRow: number,
  dCol: number,
  size: GridSize,
  isBlank?: IsBlank,
): Cell {
  const lastRow = size.rows - 1;
  const lastCol = size.cols - 1;
  const edge: Cell = {
    row: dRow < 0 ? 0 : dRow > 0 ? lastRow : from.row,
    col: dCol < 0 ? 0 : dCol > 0 ? lastCol : from.col,
  };
  if (!isBlank) return edge;
  const inside = (c: Cell) => c.row >= 0 && c.row <= lastRow && c.col >= 0 && c.col <= lastCol;
  const step = (c: Cell): Cell => ({ row: c.row + dRow, col: c.col + dCol });
  let next = step(from);
  if (!inside(next)) return from;
  const here = isBlank(from);
  const ahead = isBlank(next);
  if (here === undefined || ahead === undefined) return edge;
  if (!here && !ahead) {
    // Along the filled run.
    let at = next;
    for (;;) {
      const n = step(at);
      if (!inside(n)) return at;
      const blank = isBlank(n);
      if (blank === undefined) return edge;
      if (blank) return at;
      at = n;
    }
  }
  // To the next filled cell.
  for (;;) {
    const blank = isBlank(next);
    if (blank === undefined) return edge;
    if (!blank) return next;
    const n = step(next);
    if (!inside(n)) return next;
    next = n;
  }
}

// Arrow keys, Home/End and PageUp/PageDown; Mod jumps to the data edge, Shift extends the range
// from the anchor. Returns null for keys it does not handle.
export function moveSelection(
  selection: GridSelection,
  key: string,
  size: GridSize & { page?: number },
  modifiers: { shift?: boolean; mod?: boolean } = {},
  isBlank?: IsBlank,
): GridSelection | null {
  if (size.rows === 0 || size.cols === 0) return null;
  const from = selection.focus;
  let { row, col } = from;
  const lastRow = size.rows - 1;
  const lastCol = size.cols - 1;
  const page = size.page ?? 10;
  const arrow = (dRow: number, dCol: number) => {
    if (modifiers.mod) ({ row, col } = dataEdge(from, dRow, dCol, size, isBlank));
    else {
      row += dRow;
      col += dCol;
    }
  };
  switch (key) {
    case "ArrowUp":
      arrow(-1, 0);
      break;
    case "ArrowDown":
      arrow(1, 0);
      break;
    case "ArrowLeft":
      arrow(0, -1);
      break;
    case "ArrowRight":
      arrow(0, 1);
      break;
    case "Home":
      col = 0;
      if (modifiers.mod) row = 0;
      break;
    case "End":
      col = lastCol;
      if (modifiers.mod) row = lastRow;
      break;
    case "PageUp":
      row -= page;
      break;
    case "PageDown":
      row += page;
      break;
    default:
      return null;
  }
  const focus = { row: clamp(row, lastRow), col: clamp(col, lastCol) };
  return modifiers.shift ? { anchor: selection.anchor, focus } : single(focus);
}

// Tab and Shift+Tab: next/previous cell, wrapping to the next/previous row.
export function tabSelection(
  selection: GridSelection,
  size: GridSize,
  back: boolean,
): GridSelection {
  let { row, col } = selection.focus;
  if (back) {
    if (col > 0) col--;
    else if (row > 0) {
      row--;
      col = size.cols - 1;
    }
  } else if (col < size.cols - 1) col++;
  else if (row < size.rows - 1) {
    row++;
    col = 0;
  }
  return single({ row, col });
}
