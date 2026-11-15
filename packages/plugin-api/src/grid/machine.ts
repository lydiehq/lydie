import { fillTarget } from "./fill.ts";
// The grid's interaction state and its transitions: one explicit mode at a time (idle, selecting
// with the pointer, editing, filling, resizing a column, dragging a row or a column), the cell
// selection, and the row selection (rows picked for bulk actions, by id). Pure: `reduce` returns
// the next state, or the same object when nothing changed.
import { clampSelection, rectOf, sameSelection, single } from "./selection.ts";
import type { Cell, GridSelection, GridSize, Rect } from "./selection.ts";

export type Edge = "before" | "after";

export type GridMode =
  | { kind: "idle" }
  | { kind: "selecting" }
  | { kind: "editing"; cell: Cell; initialText?: string }
  | { kind: "filling"; source: Rect; target: Rect | null }
  | { kind: "resizing"; col: number; width: number }
  | { kind: "rowDragging"; row: number; over: { item: number; edge: Edge } | null }
  | { kind: "columnDragging"; col: number; over: number | null };

export type RowSelection = {
  ids: ReadonlySet<string>;
  // The row a Shift+click or Shift+X extends from.
  anchor: number | null;
};

export type GridState = {
  mode: GridMode;
  selection: GridSelection | null;
  rows: RowSelection;
  size: GridSize;
};

export type GridEvent =
  | { type: "select"; selection: GridSelection | null }
  | { type: "pointerDown"; cell: Cell; shift: boolean }
  | { type: "pointerOver"; cell: Cell }
  | { type: "pointerUp" }
  | { type: "startEdit"; cell?: Cell; initialText?: string }
  | { type: "endEdit" }
  | { type: "startFill" }
  | { type: "fillOver"; cell: Cell }
  | { type: "endFill" }
  | { type: "startResize"; col: number; width: number }
  | { type: "resize"; width: number }
  | { type: "endResize" }
  | { type: "startRowDrag"; row: number }
  | { type: "rowDragOver"; item: number; edge: Edge }
  | { type: "startColumnDrag"; col: number }
  | { type: "columnDragOver"; col: number }
  | { type: "endDrag" }
  | { type: "cancel" }
  | { type: "escape" }
  | { type: "setRows"; ids: ReadonlySet<string>; anchor?: number | null }
  | { type: "setSize"; size: GridSize };

export const IDLE: GridMode = Object.freeze({ kind: "idle" });

const NO_ROWS: RowSelection = Object.freeze({ ids: new Set<string>(), anchor: null });

export function initialGridState(size: GridSize = { rows: 0, cols: 0 }): GridState {
  return { mode: IDLE, selection: null, rows: NO_ROWS, size };
}

function withSelection(state: GridState, selection: GridSelection | null): GridState {
  return sameSelection(state.selection, selection) ? state : { ...state, selection };
}

function withMode(state: GridState, mode: GridMode): GridState {
  return state.mode === mode ? state : { ...state, mode };
}

export function reduce(state: GridState, event: GridEvent): GridState {
  const { mode } = state;
  switch (event.type) {
    case "select":
      if (mode.kind === "editing") return state;
      return withSelection(state, event.selection);
    case "pointerDown": {
      if (mode.kind !== "idle") return state;
      const selection =
        event.shift && state.selection
          ? { anchor: state.selection.anchor, focus: event.cell }
          : single(event.cell);
      return { ...withSelection(state, selection), mode: { kind: "selecting" } };
    }
    case "pointerOver":
      if (mode.kind === "selecting" && state.selection)
        return withSelection(state, { anchor: state.selection.anchor, focus: event.cell });
      if (mode.kind === "filling") {
        const target = fillTarget(mode.source, event.cell);
        const same =
          target === mode.target ||
          (target &&
            mode.target &&
            target.top === mode.target.top &&
            target.bottom === mode.target.bottom &&
            target.left === mode.target.left &&
            target.right === mode.target.right);
        return same ? state : withMode(state, { ...mode, target });
      }
      return state;
    case "pointerUp":
      return mode.kind === "selecting" ? withMode(state, IDLE) : state;
    case "startEdit": {
      if (mode.kind !== "idle" && mode.kind !== "selecting") return state;
      const cell = event.cell ?? state.selection?.focus;
      if (!cell) return state;
      return {
        ...state,
        selection:
          event.cell && !sameSelection(state.selection, single(cell))
            ? single(cell)
            : state.selection,
        mode: {
          kind: "editing",
          cell,
          ...(event.initialText !== undefined ? { initialText: event.initialText } : {}),
        },
      };
    }
    case "endEdit":
      return mode.kind === "editing" ? withMode(state, IDLE) : state;
    case "startFill":
      if (mode.kind !== "idle" || !state.selection) return state;
      return withMode(state, { kind: "filling", source: rectOf(state.selection), target: null });
    case "fillOver":
      return reduce(state, { type: "pointerOver", cell: event.cell });
    case "endFill": {
      if (mode.kind !== "filling") return state;
      const { source, target } = mode;
      // The selection grows to what was filled.
      const selection = target
        ? {
            anchor: {
              row: Math.min(source.top, target.top),
              col: Math.min(source.left, target.left),
            },
            focus: {
              row: Math.max(source.bottom, target.bottom),
              col: Math.max(source.right, target.right),
            },
          }
        : state.selection;
      return { ...withSelection(state, selection), mode: IDLE };
    }
    case "startResize":
      if (mode.kind !== "idle") return state;
      return withMode(state, { kind: "resizing", col: event.col, width: event.width });
    case "resize":
      if (mode.kind !== "resizing" || mode.width === event.width) return state;
      return withMode(state, { ...mode, width: event.width });
    case "endResize":
      return mode.kind === "resizing" ? withMode(state, IDLE) : state;
    case "startRowDrag":
      if (mode.kind !== "idle") return state;
      return withMode(state, { kind: "rowDragging", row: event.row, over: null });
    case "rowDragOver":
      if (mode.kind !== "rowDragging") return state;
      if (mode.over?.item === event.item && mode.over.edge === event.edge) return state;
      return withMode(state, { ...mode, over: { item: event.item, edge: event.edge } });
    case "startColumnDrag":
      if (mode.kind !== "idle") return state;
      return withMode(state, { kind: "columnDragging", col: event.col, over: null });
    case "columnDragOver":
      if (mode.kind !== "columnDragging" || mode.over === event.col) return state;
      return withMode(state, { ...mode, over: event.col });
    case "endDrag":
      return mode.kind === "rowDragging" || mode.kind === "columnDragging"
        ? withMode(state, IDLE)
        : state;
    case "cancel":
      return withMode(state, IDLE);
    case "escape": {
      // One thing at a time: a gesture, then a range, then the picked rows, then the active cell.
      if (mode.kind !== "idle") return withMode(state, IDLE);
      const { selection } = state;
      if (selection && !sameSelection(selection, single(selection.focus)))
        return withSelection(state, single(selection.focus));
      if (state.rows.ids.size > 0) return { ...state, rows: NO_ROWS };
      return withSelection(state, null);
    }
    case "setRows": {
      const anchor = event.anchor === undefined ? state.rows.anchor : event.anchor;
      if (event.ids === state.rows.ids && anchor === state.rows.anchor) return state;
      return {
        ...state,
        rows: event.ids.size === 0 && anchor === null ? NO_ROWS : { ids: event.ids, anchor },
      };
    }
    case "setSize": {
      const { size } = event;
      if (size.rows === state.size.rows && size.cols === state.size.cols) return state;
      const selection = state.selection ? clampSelection(state.selection, size) : null;
      const editing =
        mode.kind === "editing" && (mode.cell.row >= size.rows || mode.cell.col >= size.cols);
      return { ...state, size, selection, mode: editing ? IDLE : mode };
    }
  }
}

// Row selection helpers (Linear-style: X toggles the highlighted row, Shift extends from the
// anchor, Cmd/Ctrl+A picks every row).
export function toggledRows(
  rows: RowSelection,
  ids: readonly string[],
  anchor: number,
  extend: boolean,
): RowSelection {
  const next = new Set(rows.ids);
  const adding = extend || !ids.every((id) => next.has(id));
  for (const id of ids) {
    if (adding) next.add(id);
    else next.delete(id);
  }
  return { ids: next, anchor };
}

// Selectors for subscribers that show one part of the state.
export const selectRows = (state: GridState) => state.rows;
export const selectMode = (state: GridState) => state.mode;
export const selectSelection = (state: GridState) => state.selection;
export const isEditing = (state: GridState) => state.mode.kind === "editing";
