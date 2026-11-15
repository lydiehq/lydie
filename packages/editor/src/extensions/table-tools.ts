import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import {
  addColumn,
  addRow,
  CellSelection,
  moveTableColumn,
  moveTableRow,
  removeColumn,
  removeRow,
  TableMap,
} from "@tiptap/pm/tables";
import type { TableRect } from "@tiptap/pm/tables";

// Edits on one row or column of a table, addressed by the table's position and an index rather
// than by the selection, so the table handles can act on the row or column under the pointer.
// Markdown pins the shape: the first row is always the header (it is what `| --- |` follows), so
// nothing here moves a row into or out of it, and a column's alignment is its cells' `align`.

export type TableAxis = "row" | "column";
export type TableAlign = "left" | "center" | "right";

export type TableTarget = { tablePos: number; axis: TableAxis; index: number };

export type TableEdit =
  | { kind: "insert"; side: "before" | "after" }
  | { kind: "move"; side: "before" | "after" }
  | { kind: "duplicate" }
  | { kind: "clear" }
  | { kind: "delete" }
  | { kind: "align"; align: TableAlign | null };

function tableRect(doc: ProseMirrorNode, tablePos: number): TableRect | null {
  const table = doc.nodeAt(tablePos);
  if (!table || table.type.name !== "table") return null;
  const map = TableMap.get(table);
  return {
    map,
    table,
    tableStart: tablePos + 1,
    left: 0,
    top: 0,
    right: map.width,
    bottom: map.height,
  };
}

// Positions (relative to the table start) of the distinct cells in a row or column.
function cellsOf(rect: TableRect, axis: TableAxis, index: number): number[] {
  const { map } = rect;
  const cells =
    axis === "row"
      ? map.cellsInRect({ left: 0, right: map.width, top: index, bottom: index + 1 })
      : map.cellsInRect({ left: index, right: index + 1, top: 0, bottom: map.height });
  return cells;
}

// A merged cell spanning the line makes duplicating and moving ambiguous; Markdown tables have
// none, so those edits are only offered on plain lines.
function hasSpans(rect: TableRect, cells: number[]) {
  return cells.some((pos) => {
    const attrs = rect.table.nodeAt(pos)?.attrs;
    return attrs ? attrs.colspan > 1 || attrs.rowspan > 1 : false;
  });
}

export function tableSize(doc: ProseMirrorNode, tablePos: number) {
  const rect = tableRect(doc, tablePos);
  return rect ? { rows: rect.map.height, columns: rect.map.width } : null;
}

// The alignment shared by every cell of a column, or null when they differ or have none.
export function columnAlign(doc: ProseMirrorNode, tablePos: number, index: number) {
  const rect = tableRect(doc, tablePos);
  if (!rect || index >= rect.map.width) return null;
  const aligns = new Set(
    cellsOf(rect, "column", index).map((pos) => rect.table.nodeAt(pos)?.attrs.align),
  );
  return aligns.size === 1 ? ((aligns.values().next().value as TableAlign | null) ?? null) : null;
}

export function canEditTable(state: EditorState, target: TableTarget, edit: TableEdit): boolean {
  const rect = tableRect(state.doc, target.tablePos);
  if (!rect) return false;
  const { axis, index } = target;
  const size = axis === "row" ? rect.map.height : rect.map.width;
  if (index < 0 || index >= size) return false;
  const header = axis === "row" && index === 0;
  switch (edit.kind) {
    case "insert":
      return !(header && edit.side === "before");
    case "move": {
      const to = edit.side === "before" ? index - 1 : index + 1;
      const first = axis === "row" ? 1 : 0;
      return !header && to >= first && to < size && !hasSpans(rect, cellsOf(rect, axis, index));
    }
    case "duplicate":
      return !header && !hasSpans(rect, cellsOf(rect, axis, index));
    case "clear":
      return true;
    case "delete":
      return !header && size > 1;
    case "align":
      return axis === "column";
  }
}

export function editTable(
  state: EditorState,
  target: TableTarget,
  edit: TableEdit,
): Transaction | null {
  if (!canEditTable(state, target, edit)) return null;
  const rect = tableRect(state.doc, target.tablePos);
  if (!rect) return null;
  const { axis, index } = target;
  const { tableStart, table } = rect;
  const tr = state.tr;

  switch (edit.kind) {
    case "insert": {
      const at = edit.side === "before" ? index : index + 1;
      return axis === "row" ? addRow(tr, rect, at) : addColumn(tr, rect, at);
    }
    case "move": {
      // prosemirror-tables finds the line through the selection: select it first. The moved line
      // stays selected, so it can be moved again.
      const selecting = selectTableLine(state, target);
      if (!selecting) return null;
      const to = edit.side === "before" ? index - 1 : index + 1;
      const move = axis === "row" ? moveTableRow : moveTableColumn;
      const result: { tr: Transaction | null } = { tr: null };
      move({ from: index, to, select: true, pos: tableStart })(state.apply(selecting), (moved) => {
        result.tr = moved;
      });
      return result.tr;
    }
    case "duplicate": {
      if (axis === "row") {
        let rowPos = tableStart;
        for (let i = 0; i <= index; i++) rowPos += table.child(i).nodeSize;
        return tr.insert(rowPos, table.child(index).copy(table.child(index).content));
      }
      // Each copy goes in right after its original; positions are mapped as earlier rows grow.
      for (const pos of cellsOf(rect, "column", index)) {
        const cell = table.nodeAt(pos);
        if (!cell) continue;
        tr.insert(tr.mapping.map(tableStart + pos + cell.nodeSize), cell.copy(cell.content));
      }
      return tr;
    }
    case "clear": {
      // Back to front, so earlier positions stay valid.
      for (const pos of [...cellsOf(rect, axis, index)].reverse()) {
        const cell = table.nodeAt(pos);
        const empty = cell?.type.createAndFill(cell.attrs);
        if (!cell || !empty) continue;
        tr.replaceWith(tableStart + pos + 1, tableStart + pos + cell.nodeSize - 1, empty.content);
      }
      return tr;
    }
    case "delete": {
      if (axis === "row") removeRow(tr, rect, index);
      else removeColumn(tr, rect, index);
      return tr;
    }
    case "align": {
      for (const pos of cellsOf(rect, "column", index)) {
        tr.setNodeAttribute(tableStart + pos, "align", edit.align);
      }
      return tr;
    }
  }
}

// Selects a whole row or column, so the user sees what a handle's menu acts on.
export function selectTableLine(state: EditorState, target: TableTarget): Transaction | null {
  const rect = tableRect(state.doc, target.tablePos);
  if (!rect) return null;
  const cells = cellsOf(rect, target.axis, target.index);
  const first = cells[0];
  const last = cells.at(-1);
  if (first === undefined || last === undefined) return null;
  const $anchor = state.doc.resolve(rect.tableStart + first);
  const $head = state.doc.resolve(rect.tableStart + last);
  const selection =
    target.axis === "row"
      ? CellSelection.rowSelection($anchor, $head)
      : CellSelection.colSelection($anchor, $head);
  return state.tr.setSelection(selection);
}
