import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { TableMap } from "@tiptap/pm/tables";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

import {
  canEditTable,
  columnAlign,
  editTable,
  selectTableLine,
  tableSize,
} from "../extensions/table-tools";
import type { TableAxis, TableEdit, TableTarget } from "../extensions/table-tools";
import type { TableHandleAction, TableHandleProps } from "./context";

// Tiptap's Table Node, rebuilt on Lydie's schema: hovering a table shows a grip on the hovered
// column (on its top edge) and row (on its left edge) that opens a menu for that line, and a
// "+" bar along the table's right and bottom edges that adds a column or a row at the end.

type Hover = {
  table: HTMLTableElement;
  cell: HTMLTableCellElement;
  tablePos: number;
  row: number;
  column: number;
};

// How far outside the table the pointer can go (on its way to a handle or a bar) and keep it.
const REACH = 28;
const GRIP_LONG = 24;
const GRIP_SHORT = 14;
const BAR = 16;
const BAR_GAP = 4;

function locate(editor: Editor, cell: HTMLTableCellElement): Hover | null {
  const table = cell.closest("table");
  if (!table || !editor.view.dom.contains(table)) return null;
  let pos: number;
  try {
    pos = editor.view.posAtDOM(cell, 0);
  } catch {
    return null;
  }
  const $pos = editor.state.doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name !== "table") continue;
    const tableNode = $pos.node(depth);
    const tableStart = $pos.start(depth);
    if (depth + 2 > $pos.depth) return null;
    const rect = TableMap.get(tableNode).findCell($pos.before(depth + 2) - tableStart);
    return { table, cell, tablePos: $pos.before(depth), row: rect.top, column: rect.left };
  }
  return null;
}

function sameHover(a: Hover | null, b: Hover | null) {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      a.cell === b.cell &&
      a.tablePos === b.tablePos &&
      a.row === b.row &&
      a.column === b.column)
  );
}

type Box = { left: number; top: number; width: number; height: number };
type Layout = { column: Box | null; row: Box | null; addColumn: Box | null; addRow: Box | null };

// Boxes relative to the container. A table wider than the text column scrolls sideways inside its
// wrapper, so the table is clipped to the wrapper and controls outside the visible part hide.
function measure(container: HTMLElement, hover: Hover): Layout | null {
  const origin = container.getBoundingClientRect();
  const table = hover.table.getBoundingClientRect();
  // Not laid out (a hidden tab, mid-resize): nothing sensible to point at.
  if (table.width === 0 || origin.width === 0) return null;
  const cell = hover.cell.getBoundingClientRect();
  const scroller = hover.table.parentElement?.getBoundingClientRect() ?? table;
  const left = Math.max(table.left, scroller.left);
  const right = Math.min(table.right, scroller.right);
  const x = (value: number) => value - origin.left;
  const y = (value: number) => value - origin.top;
  const cellCentre = (cell.left + cell.right) / 2;
  return {
    column:
      cellCentre >= left && cellCentre <= right
        ? {
            left: x(cellCentre - GRIP_LONG / 2),
            top: y(table.top - GRIP_SHORT / 2),
            width: GRIP_LONG,
            height: GRIP_SHORT,
          }
        : null,
    row: {
      left: x(left - GRIP_SHORT / 2),
      top: y((cell.top + cell.bottom) / 2 - GRIP_LONG / 2),
      width: GRIP_SHORT,
      height: GRIP_LONG,
    },
    addColumn:
      table.right <= scroller.right + 1
        ? { left: x(table.right + BAR_GAP), top: y(table.top), width: BAR, height: table.height }
        : null,
    addRow: {
      left: x(left),
      top: y(table.bottom + BAR_GAP),
      width: right - left,
      height: BAR,
    },
  };
}

function useLayout(container: RefObject<HTMLElement | null>, editor: Editor, hover: Hover | null) {
  const [layout, setLayout] = useState<Layout | null>(null);
  useEffect(() => {
    const root = container.current;
    if (!hover || !root) return;
    // Once per frame, after layout has settled. A resize can report empty boxes mid-way: the
    // controls then stay where they were rather than unmount (and close an open menu).
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setLayout((prev) => measure(root, hover) ?? prev));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(hover.table);
    // Capture: the table's wrapper scrolls sideways, and scroll events do not bubble.
    root.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    editor.on("transaction", update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      root.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      editor.off("transaction", update);
    };
  }, [container, editor, hover]);
  return layout;
}

const AXIS_WORDS = {
  row: { before: "above", after: "below", moveBefore: "up", moveAfter: "down" },
  column: { before: "left", after: "right", moveBefore: "left", moveAfter: "right" },
} as const;

function actionsFor(editor: Editor, target: TableTarget): TableHandleAction[] {
  const words = AXIS_WORDS[target.axis];
  const noun = target.axis === "row" ? "row" : "column";
  const run = (edit: TableEdit) => () => {
    const tr = editTable(editor.state, target, edit);
    if (tr) editor.view.dispatch(tr);
    // The menu hands focus back to the grip as it closes; the editor takes it after.
    requestAnimationFrame(() => {
      if (!editor.isDestroyed) editor.view.focus();
    });
  };
  const item = (
    id: string,
    label: string,
    icon: TableHandleAction["icon"],
    section: TableHandleAction["section"],
    edit: TableEdit,
    extra: Partial<TableHandleAction> = {},
  ): TableHandleAction => ({
    id,
    label,
    icon,
    section,
    isDisabled: !canEditTable(editor.state, target, edit),
    onAction: run(edit),
    ...extra,
  });
  const actions = [
    item("insert-before", `Insert ${words.before}`, "insert-before", "insert", {
      kind: "insert",
      side: "before",
    }),
    item("insert-after", `Insert ${words.after}`, "insert-after", "insert", {
      kind: "insert",
      side: "after",
    }),
    item("move-before", `Move ${words.moveBefore}`, "move-before", "move", {
      kind: "move",
      side: "before",
    }),
    item("move-after", `Move ${words.moveAfter}`, "move-after", "move", {
      kind: "move",
      side: "after",
    }),
  ];
  if (target.axis === "column") {
    const current = columnAlign(editor.state.doc, target.tablePos, target.index);
    for (const align of ["left", "center", "right"] as const) {
      const selected = current === align;
      // Picking the current alignment again clears it (Markdown's plain `---`).
      actions.push(
        item(
          `align-${align}`,
          `Align ${align}`,
          `align-${align}`,
          "align",
          { kind: "align", align: selected ? null : align },
          { isSelected: selected },
        ),
      );
    }
  }
  actions.push(
    item("duplicate", "Duplicate", "duplicate", "edit", { kind: "duplicate" }),
    item("clear", "Clear contents", "clear", "edit", { kind: "clear" }),
    item("delete", `Delete ${noun}`, "delete", "delete", { kind: "delete" }, { destructive: true }),
  );
  return actions;
}

// Adds a line at the end and puts the caret in its first cell (a new column's header, so it can
// be named straight away).
function appendLine(editor: Editor, tablePos: number, axis: TableAxis) {
  const size = tableSize(editor.state.doc, tablePos);
  if (!size) return;
  const index = axis === "row" ? size.rows - 1 : size.columns - 1;
  const tr = editTable(editor.state, { tablePos, axis, index }, { kind: "insert", side: "after" });
  if (!tr) return;
  const table = tr.doc.nodeAt(tablePos);
  if (table) {
    const map = TableMap.get(table);
    const cell =
      axis === "row"
        ? map.positionAt(map.height - 1, 0, table)
        : map.positionAt(0, map.width - 1, table);
    tr.setSelection(TextSelection.near(tr.doc.resolve(tablePos + 1 + cell + 1)));
  }
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
}

type Props = {
  editor: Editor;
  container: RefObject<HTMLElement | null>;
  renderHandle: ((props: TableHandleProps) => ReactNode) | undefined;
};

export function TableControls({ editor, container, renderHandle }: Props) {
  const [hover, setHover] = useState<Hover | null>(null);
  const [menu, setMenu] = useState<TableAxis | null>(null);
  // For the pointer listeners, which are attached once.
  const menuOpen = useRef<TableAxis | null>(null);
  useEffect(() => {
    menuOpen.current = menu;
  }, [menu]);

  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const onMove = (event: PointerEvent) => {
      if (menuOpen.current || !(event.target instanceof Element)) return;
      if (event.target.closest("[data-table-control]")) return;
      const cell = event.target.closest("td, th");
      if (cell instanceof HTMLTableCellElement && editor.view.dom.contains(cell)) {
        const next = locate(editor, cell);
        setHover((prev) => (sameHover(prev, next) ? prev : next));
        return;
      }
      setHover((prev) => {
        if (!prev?.table.isConnected) return null;
        const box = prev.table.getBoundingClientRect();
        const near =
          event.clientX >= box.left - REACH &&
          event.clientX <= box.right + REACH &&
          event.clientY >= box.top - REACH &&
          event.clientY <= box.bottom + REACH;
        return near ? prev : null;
      });
    };
    const onLeave = () => {
      if (!menuOpen.current) setHover(null);
    };
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerleave", onLeave);
    return () => {
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
    };
  }, [container, editor]);

  // Edits move cells around: re-read the hovered cell's place, or drop it once it is gone.
  useEffect(() => {
    const onTransaction = () => {
      setHover((prev) => {
        if (!prev) return prev;
        const next = prev.cell.isConnected ? locate(editor, prev.cell) : null;
        return sameHover(prev, next) ? prev : next;
      });
    };
    editor.on("transaction", onTransaction);
    return () => {
      editor.off("transaction", onTransaction);
    };
  }, [editor]);

  const layout = useLayout(container, editor, hover);
  if (!hover || !layout) return null;

  const handle = (axis: TableAxis, box: Box | null) => {
    if (!box || (menu !== null && menu !== axis)) return null;
    const target: TableTarget = {
      tablePos: hover.tablePos,
      axis,
      index: axis === "row" ? hover.row : hover.column,
    };
    const props: TableHandleProps = {
      axis,
      actions: actionsFor(editor, target),
      onOpenChange: (open) => {
        // Closing reports from the other handle too (when it unmounts): only this one's counts.
        setMenu((current) => (open ? axis : current === axis ? null : current));
        if (!open) return;
        const tr = selectTableLine(editor.state, target);
        if (tr) editor.view.dispatch(tr);
      },
    };
    return (
      <HandleSlot key={axis} axis={axis} box={box} onUnmount={() => props.onOpenChange(false)}>
        {renderHandle ? renderHandle(props) : <DefaultTableHandle {...props} />}
      </HandleSlot>
    );
  };

  const bar = (axis: TableAxis, box: Box | null) => {
    if (!box || menu !== null) return null;
    const label = axis === "row" ? "Add row" : "Add column";
    return (
      // @lydie/editor cannot use @lydie/ui's WithTooltip; the native `title` is the tooltip.
      // oxlint-disable-next-line lydie/icon-button-tooltip
      <button
        type="button"
        data-table-control={`add-${axis}`}
        aria-label={label}
        title={label}
        // Keeps the caret where it is until the click lands.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => appendLine(editor, hover.tablePos, axis)}
        className="lydie-table-add absolute z-10"
        style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 3.5v9M3.5 8h9" />
        </svg>
      </button>
    );
  };

  return (
    <>
      {handle("column", layout.column)}
      {handle("row", layout.row)}
      {bar("column", layout.addColumn)}
      {bar("row", layout.addRow)}
    </>
  );
}

// A menu unmounted while open (its table deleted, say) never reports closing: the slot does, or
// the controls would stay frozen.
function HandleSlot({
  axis,
  box,
  onUnmount,
  children,
}: {
  axis: TableAxis;
  box: Box;
  onUnmount: () => void;
  children: ReactNode;
}) {
  const latest = useRef(onUnmount);
  useLayoutEffect(() => {
    latest.current = onUnmount;
  });
  useEffect(() => () => latest.current(), []);
  return (
    <div
      data-table-control={axis}
      className="absolute z-10 flex"
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
    >
      {children}
    </div>
  );
}

// Without a host renderer: a plain grip and list, enough to use the actions.
function DefaultTableHandle({ axis, actions, onOpenChange }: TableHandleProps) {
  const [open, setOpen] = useState(false);
  const toggle = (next: boolean) => {
    setOpen(next);
    onOpenChange(next);
  };
  return (
    <div className="relative flex size-full">
      <button
        type="button"
        aria-label={axis === "row" ? "Row options" : "Column options"}
        aria-expanded={open}
        title={axis === "row" ? "Row options" : "Column options"}
        onClick={() => toggle(!open)}
        className="lydie-table-grip size-full"
        data-axis={axis}
      />
      {open && (
        <div
          role="menu"
          className="absolute top-full left-0 z-20 mt-1 flex min-w-40 flex-col rounded-lg bg-elevated p-1 text-sm shadow-popover"
        >
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              disabled={action.isDisabled}
              onClick={() => {
                action.onAction();
                toggle(false);
              }}
              className="rounded px-2 py-1 text-left hover:bg-gray-100 disabled:opacity-40"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
