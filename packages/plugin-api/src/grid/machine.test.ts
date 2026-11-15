import { describe, expect, test } from "bun:test";

import { createGeometry } from "./geometry.ts";
import { isTypingKey, keyCommand } from "./keys.ts";
import type { KeyInput } from "./keys.ts";
import { initialGridState, reduce, toggledRows } from "./machine.ts";
import type { GridState } from "./machine.ts";
import { single } from "./selection.ts";
import { createGridStore } from "./store.ts";

const base = (): GridState => ({ ...initialGridState({ rows: 10, cols: 4 }) });

describe("state machine", () => {
  test("pointer selection: down, drag over, up", () => {
    let s = reduce(base(), { type: "pointerDown", cell: { row: 1, col: 1 }, shift: false });
    expect(s.mode.kind).toBe("selecting");
    s = reduce(s, { type: "pointerOver", cell: { row: 3, col: 2 } });
    expect(s.selection).toEqual({ anchor: { row: 1, col: 1 }, focus: { row: 3, col: 2 } });
    s = reduce(s, { type: "pointerUp" });
    expect(s.mode.kind).toBe("idle");
    // Shift+click extends from the anchor.
    s = reduce(s, { type: "pointerDown", cell: { row: 5, col: 0 }, shift: true });
    expect(s.selection!.anchor).toEqual({ row: 1, col: 1 });
  });

  test("editing blocks other gestures until it ends", () => {
    let s = reduce(base(), { type: "select", selection: single({ row: 2, col: 1 }) });
    s = reduce(s, { type: "startEdit", initialText: "a" });
    expect(s.mode).toEqual({ kind: "editing", cell: { row: 2, col: 1 }, initialText: "a" });
    expect(reduce(s, { type: "startFill" })).toBe(s);
    expect(reduce(s, { type: "select", selection: single({ row: 0, col: 0 }) })).toBe(s);
    s = reduce(s, { type: "endEdit" });
    expect(s.mode.kind).toBe("idle");
  });

  test("fill: the target follows the pointer; the selection grows to it", () => {
    let s = reduce(base(), {
      type: "select",
      selection: { anchor: { row: 1, col: 1 }, focus: { row: 2, col: 1 } },
    });
    s = reduce(s, { type: "startFill" });
    s = reduce(s, { type: "fillOver", cell: { row: 5, col: 1 } });
    expect(s.mode).toMatchObject({ kind: "filling", target: { top: 3, bottom: 5 } });
    const same = reduce(s, { type: "fillOver", cell: { row: 5, col: 0 } });
    expect(same).toBe(s);
    s = reduce(s, { type: "endFill" });
    expect(s.selection).toEqual({ anchor: { row: 1, col: 1 }, focus: { row: 5, col: 1 } });
  });

  test("resize and drags are modes of their own", () => {
    let s = reduce(base(), { type: "startResize", col: 2, width: 180 });
    s = reduce(s, { type: "resize", width: 220 });
    expect(s.mode).toEqual({ kind: "resizing", col: 2, width: 220 });
    s = reduce(s, { type: "endResize" });
    s = reduce(s, { type: "startRowDrag", row: 3 });
    s = reduce(s, { type: "rowDragOver", item: 6, edge: "after" });
    expect(s.mode).toEqual({ kind: "rowDragging", row: 3, over: { item: 6, edge: "after" } });
    s = reduce(s, { type: "endDrag" });
    expect(s.mode.kind).toBe("idle");
  });

  test("Escape unwinds one thing at a time", () => {
    let s = reduce(base(), {
      type: "select",
      selection: { anchor: { row: 0, col: 0 }, focus: { row: 2, col: 2 } },
    });
    s = reduce(s, { type: "setRows", ids: new Set(["a"]), anchor: 0 });
    s = reduce(s, { type: "escape" });
    expect(s.selection).toEqual(single({ row: 2, col: 2 }));
    s = reduce(s, { type: "escape" });
    expect(s.rows.ids.size).toBe(0);
    s = reduce(s, { type: "escape" });
    expect(s.selection).toBeNull();
  });

  test("a smaller grid clamps the selection and ends an edit outside it", () => {
    let s = reduce(base(), { type: "startEdit", cell: { row: 9, col: 3 } });
    s = reduce(s, { type: "setSize", size: { rows: 5, cols: 4 } });
    expect(s.mode.kind).toBe("idle");
    expect(s.selection!.focus).toEqual({ row: 4, col: 3 });
  });

  test("row picking toggles, Shift extends", () => {
    const rows = { ids: new Set(["a"]), anchor: 0 };
    expect([...toggledRows(rows, ["a"], 0, false).ids]).toEqual([]);
    expect([...toggledRows(rows, ["b", "c"], 2, true).ids]).toEqual(["a", "b", "c"]);
  });
});

describe("keys", () => {
  const key = (k: string, mods: Partial<KeyInput> = {}): KeyInput => ({
    key: k,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    ...mods,
  });
  const ctx = { page: 5, editable: (c: number) => c !== 3, checkbox: (c: number) => c === 2 };
  const at = (row: number, col: number) =>
    reduce(base(), { type: "select", selection: single({ row, col }) });

  test("typing keys start editing; shortcuts do not", () => {
    expect(isTypingKey(key("a"))).toBe(true);
    expect(isTypingKey(key("a", { metaKey: true }))).toBe(false);
    expect(keyCommand(key("7"), at(1, 1), ctx)).toEqual({ type: "edit", initialText: "7" });
    expect(keyCommand(key("7"), at(1, 3), ctx)).toBeNull();
    expect(keyCommand(key("7", { isComposing: true }), at(1, 1), ctx)).toBeNull();
  });

  test("navigation, editing, clearing, opening", () => {
    expect(keyCommand(key("ArrowDown"), at(1, 1), ctx)).toEqual({
      type: "select",
      selection: single({ row: 2, col: 1 }),
    });
    expect(keyCommand(key("Enter"), at(1, 1), ctx)).toEqual({ type: "edit" });
    expect(keyCommand(key("Enter"), at(1, 2), ctx)).toEqual({ type: "toggle" });
    expect(keyCommand(key("Enter", { metaKey: true }), at(1, 1), ctx)).toEqual({ type: "open" });
    expect(keyCommand(key("Delete"), at(1, 1), ctx)).toEqual({ type: "clear" });
    expect(keyCommand(key("z", { metaKey: true }), at(1, 1), ctx)).toBeNull();
    // No active cell yet: an arrow picks the first cell.
    expect(keyCommand(key("ArrowRight"), base(), ctx)).toEqual({
      type: "select",
      selection: single({ row: 0, col: 0 }),
    });
  });

  test("the Linear layer: X, Shift+X, Mod+A, Space, Shift+F", () => {
    expect(keyCommand(key("x"), at(1, 1), ctx)).toEqual({ type: "toggleRow", extend: false });
    expect(keyCommand(key("X", { shiftKey: true }), at(1, 1), ctx)).toEqual({
      type: "toggleRow",
      extend: true,
    });
    expect(keyCommand(key("a", { metaKey: true }), at(1, 1), ctx)).toEqual({
      type: "selectAllRows",
    });
    expect(keyCommand(key(" "), at(1, 1), ctx)).toEqual({ type: "peek" });
    expect(keyCommand(key(" "), at(1, 2), ctx)).toEqual({ type: "toggle" });
    expect(keyCommand(key("F", { shiftKey: true }), at(1, 1), ctx)).toEqual({ type: "filter" });
  });

  test("Mod+D / Mod+R fill down / right", () => {
    const range = reduce(base(), {
      type: "select",
      selection: { anchor: { row: 5, col: 2 }, focus: { row: 2, col: 1 } },
    });
    expect(keyCommand(key("d", { metaKey: true }), range, ctx)).toEqual({
      type: "fill",
      source: { top: 2, bottom: 2, left: 1, right: 2 },
      target: { top: 3, bottom: 5, left: 1, right: 2 },
    });
    expect(keyCommand(key("r", { ctrlKey: true }), range, ctx)).toEqual({
      type: "fill",
      source: { top: 2, bottom: 5, left: 1, right: 1 },
      target: { top: 2, bottom: 5, left: 2, right: 2 },
    });
    // One cell: from the cell above / to the left.
    expect(keyCommand(key("d", { ctrlKey: true }), at(4, 1), ctx)).toEqual({
      type: "fill",
      source: { top: 3, bottom: 3, left: 1, right: 1 },
      target: { top: 4, bottom: 4, left: 1, right: 1 },
    });
    // Nothing to copy from: still the grid's key, so the browser does not bookmark or reload.
    expect(keyCommand(key("d", { metaKey: true }), at(0, 1), ctx)).toEqual({ type: "ignore" });
    expect(keyCommand(key("r", { metaKey: true }), at(3, 0), ctx)).toEqual({ type: "ignore" });
    // Other modifiers, and no selection, leave the keys alone.
    expect(keyCommand(key("D", { metaKey: true, shiftKey: true }), at(4, 1), ctx)).toBeNull();
    expect(keyCommand(key("r", { metaKey: true, altKey: true }), at(4, 1), ctx)).toBeNull();
    expect(keyCommand(key("d", { metaKey: true }), base(), ctx)).toBeNull();
    // Without Mod they type.
    expect(keyCommand(key("d"), at(4, 1), ctx)).toEqual({ type: "edit", initialText: "d" });
  });

  test("whole rows and columns from the keyboard", () => {
    const row = keyCommand(key(" ", { shiftKey: true }), at(4, 1), ctx);
    expect(row).toEqual({
      type: "select",
      selection: { anchor: { row: 4, col: 3 }, focus: { row: 4, col: 0 } },
    });
    const col = keyCommand(key(" ", { ctrlKey: true }), at(4, 1), ctx);
    expect(col).toEqual({
      type: "select",
      selection: { anchor: { row: 9, col: 1 }, focus: { row: 0, col: 1 } },
    });
  });
});

describe("store", () => {
  test("listeners run only on change; the window moves only when it must", () => {
    const store = createGridStore();
    let calls = 0;
    store.subscribe(() => calls++);
    const g = createGeometry({
      columnWidths: [200, 100],
      frozen: 1,
      rowHeight: 30,
      header: 30,
      footer: 30,
      leading: 40,
      trailing: 48,
      items: 100,
      rowToItem: Array.from({ length: 100 }, (_, i) => i),
    });
    const scroll = { top: 0, left: 0, width: 400, height: 360 };
    store.setGeometry(g, scroll);
    expect(store.getState().size).toEqual({ rows: 100, cols: 2 });
    store.scrolled({ ...scroll, top: 31 });
    const viewport = store.getState().viewport;
    calls = 0;
    store.scrolled({ ...scroll, top: 59 });
    expect(store.getState().viewport).toBe(viewport);
    expect(calls).toBe(0);
    store.dispatch({ type: "pointerUp" });
    expect(calls).toBe(0);
    store.dispatch({ type: "select", selection: single({ row: 30, col: 1 }) });
    expect(calls).toBe(1);
    expect(store.revealTarget({ row: 30, col: 1 }, scroll)).toEqual({ top: 630, left: 0 });
    expect(store.revealTarget({ row: 0, col: 1 }, scroll)).toBeNull();
  });
});
