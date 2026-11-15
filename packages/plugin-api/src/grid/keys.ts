// What a key does on a grid that has focus and is not editing: one command, decided from the key,
// the modifiers and the state. The caller carries it out (writes, opening rows) so this stays pure.
import { fillShortcut } from "./fill.ts";
import type { GridState } from "./machine.ts";
import {
  allSelection,
  columnsSelection,
  moveSelection,
  rectOf,
  rowsSelection,
  single,
  tabSelection,
} from "./selection.ts";
import type { GridSelection, IsBlank, Rect } from "./selection.ts";

export type KeyInput = {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  isComposing?: boolean;
};

export type GridCommand =
  | { type: "select"; selection: GridSelection }
  | { type: "edit"; initialText?: string }
  // Space on a checkbox cell.
  | { type: "toggle" }
  // Mod+Enter: open the active row.
  | { type: "open" }
  // Space: open the active row beside (peek).
  | { type: "peek" }
  // Delete/Backspace.
  | { type: "clear" }
  // X / Shift+X: pick the active row for bulk actions / extend the picked rows to it.
  | { type: "toggleRow"; extend: boolean }
  // Mod+A: every row of the view.
  | { type: "selectAllRows" }
  | { type: "escape" }
  // Shift+F: add a filter.
  | { type: "filter" }
  // Mod+D / Mod+R: fill down / right (copy `source` into `target`, see `fillShortcut`).
  | { type: "fill"; source: Rect; target: Rect }
  // A grid shortcut with nothing to do here (Mod+D on the first row): handled only so the
  // browser's own action (bookmark, reload) does not run.
  | { type: "ignore" };

export type KeyContext = {
  // Rows that fit on a screen (PageUp/PageDown).
  page: number;
  // The active cell's column takes typing / is a checkbox.
  editable: (col: number) => boolean;
  checkbox: (col: number) => boolean;
  isBlank?: IsBlank;
};

// A key that starts editing with its character (type-to-edit).
export function isTypingKey(
  event: Pick<KeyInput, "key" | "metaKey" | "ctrlKey" | "altKey">,
): boolean {
  return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
}

export function keyCommand(
  event: KeyInput,
  state: GridState,
  context: KeyContext,
): GridCommand | null {
  if (event.isComposing) return null;
  const { size } = state;
  const mod = event.metaKey || event.ctrlKey;
  const selection = state.selection;
  if (!selection) {
    if ((event.key.startsWith("Arrow") || event.key === "Tab") && size.rows > 0 && size.cols > 0)
      return { type: "select", selection: single({ row: 0, col: 0 }) };
    if (mod && event.key.toLowerCase() === "a" && !event.shiftKey) return { type: "selectAllRows" };
    if (event.key === "Escape") return { type: "escape" };
    if (event.key === "F" && event.shiftKey && !mod && !event.altKey) return { type: "filter" };
    return null;
  }
  const moved = moveSelection(
    selection,
    event.key,
    { ...size, page: context.page },
    { shift: event.shiftKey, mod },
    context.isBlank,
  );
  if (moved && !event.altKey) return { type: "select", selection: moved };
  const { row, col } = selection.focus;
  switch (event.key) {
    case "Tab":
      if (mod || event.altKey) return null;
      return { type: "select", selection: tabSelection(selection, size, event.shiftKey) };
    case "Enter":
      if (mod) return { type: "open" };
      if (event.shiftKey || event.altKey) return null;
      return context.checkbox(col) ? { type: "toggle" } : { type: "edit" };
    case "F2":
      return context.checkbox(col) ? { type: "toggle" } : { type: "edit" };
    case "Escape":
      return { type: "escape" };
    case "Backspace":
    case "Delete":
      return mod || event.altKey ? null : { type: "clear" };
    case " ":
      if (event.shiftKey && !mod)
        return { type: "select", selection: rowsSelection(row, row, size) };
      if (event.ctrlKey && !event.metaKey)
        return { type: "select", selection: columnsSelection(col, col, size) };
      if (mod || event.altKey) return null;
      return context.checkbox(col) ? { type: "toggle" } : { type: "peek" };
  }
  if (mod && !event.altKey && event.key.toLowerCase() === "a") {
    return event.shiftKey
      ? { type: "select", selection: allSelection(size) }
      : { type: "selectAllRows" };
  }
  const letter = event.key.toLowerCase();
  if (mod && !event.shiftKey && !event.altKey && (letter === "d" || letter === "r")) {
    const fill = fillShortcut(rectOf(selection), letter === "d" ? "down" : "right");
    return fill ? { type: "fill", ...fill } : { type: "ignore" };
  }
  if (!mod && !event.altKey && (event.key === "x" || event.key === "X"))
    return { type: "toggleRow", extend: event.shiftKey };
  if (!mod && !event.altKey && event.key === "F" && event.shiftKey) return { type: "filter" };
  if (isTypingKey(event) && context.editable(col) && !context.checkbox(col))
    return { type: "edit", initialText: event.key };
  return null;
}
