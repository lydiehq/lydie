import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey, Selection } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";

import { columnShares, MIN_COLUMN_SHARE, resizeColumns } from "./column-layout";

// Column widths on screen, and dragging the gap between two columns to change them
// (`.lydie-column-resize`, styled in editor-content.css). While the pointer moves only the
// drawing changes (a preview in plugin state); the widths are written once, on release, so a
// resize is one undo step and one sync. The same bar is a focusable separator: with a row
// selected (Escape from inside it), Tab focuses its first gap and the arrow keys move it, again
// as a preview written once, when the bar loses focus.

type Preview = { pos: number; shares: number[] };
type WidthsState = { decorations: DecorationSet; preview: Preview | null };

const widthsKey = new PluginKey<WidthsState>("columnWidths");

const widthsOf = (row: ProseMirrorNode) =>
  Array.from({ length: row.childCount }, (_, i) => row.child(i).attrs.width as number | null);

// Each column's share of its row as its flex-grow: a column without a width needs its siblings'
// widths, which renderHTML cannot see.
function widthDecorations(doc: ProseMirrorNode, preview: Preview | null) {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "columnList") return !node.isTextblock && !node.isAtom;
    const shares =
      preview?.pos === pos && preview.shares.length === node.childCount
        ? preview.shares
        : columnShares(widthsOf(node));
    node.forEach((column, offset, i) => {
      decorations.push(
        Decoration.node(pos + 1 + offset, pos + 1 + offset + column.nodeSize, {
          style: `flex-grow: ${String(shares[i])}`,
        }),
      );
    });
    return true;
  });
  return DecorationSet.create(doc, decorations);
}

export const columnWidths = () =>
  new Plugin<WidthsState>({
    key: widthsKey,
    state: {
      init: (_, state) => ({ decorations: widthDecorations(state.doc, null), preview: null }),
      apply(tr, value, _old, state) {
        const meta = tr.getMeta(widthsKey) as Preview | null | undefined;
        if (meta === undefined && !tr.docChanged) return value;
        let preview = meta === undefined ? value.preview : meta;
        if (preview && meta === undefined) {
          const mapped = tr.mapping.mapResult(preview.pos, 1);
          preview = mapped.deleted ? null : { ...preview, pos: mapped.pos };
        }
        return { decorations: widthDecorations(state.doc, preview), preview };
      },
    },
    props: { decorations: (state) => widthsKey.getState(state)?.decorations },
  });

// A narrow editor stacks a row's columns, as share pages do on a narrow screen (LYD-373): the
// root gets `data-columns="stacked"` (editor-content.css draws it) below this width, its own and
// not the viewport's, so a narrow pane stacks too. Stacked, a row has no gaps to resize and no
// block offers a drop beside it (`sideTargetAt`); the widths stay in the document.
export const STACK_BELOW_REM = 40;

const stackedKey = new PluginKey<boolean>("columnsStacked");

export const columnsStacked = (state: EditorState) => stackedKey.getState(state) ?? false;

// What the width observer calls; a host that knows better may too.
export function setColumnsStacked(view: EditorView, stacked: boolean) {
  if (stacked === columnsStacked(view.state)) return;
  view.dispatch(view.state.tr.setMeta(stackedKey, stacked).setMeta("addToHistory", false));
}

export const columnStacking = () =>
  new Plugin<boolean>({
    key: stackedKey,
    state: {
      init: () => false,
      apply: (tr, value) => (tr.getMeta(stackedKey) as boolean | undefined) ?? value,
    },
    props: {
      attributes: (state): Record<string, string> =>
        stackedKey.getState(state) ? { "data-columns": "stacked" } : {},
    },
    view(view) {
      if (typeof ResizeObserver === "undefined") return {};
      // Runs after layout and before paint, so a phone never shows the row side by side first.
      const observer = new ResizeObserver(() => {
        if (view.isDestroyed) return;
        const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const width = view.dom.clientWidth;
        setColumnsStacked(view, width > 0 && width < STACK_BELOW_REM * rem);
      });
      observer.observe(view.dom);
      return { destroy: () => observer.disconnect() };
    },
  });

// How far from the middle of a gap the pointer may be for the handle to show.
const REACH = 8;

// Keyboard steps, in percent of the row.
export const COLUMN_RESIZE_STEP = 2;
export const COLUMN_RESIZE_STEP_LARGE = 10;

type Row = { pos: number; dom: HTMLElement; columns: HTMLElement[] };
type Hover = { row: Row; index: number };

const isRow = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLElement && el.dataset.type === "column-list";

const columnsOf = (row: HTMLElement) =>
  [...row.children].filter(
    (c): c is HTMLElement => c instanceof HTMLElement && c.dataset.type === "column",
  );

class ColumnResizeView {
  private readonly handle: HTMLElement;
  private hover: Hover | null = null;
  private dragging = false;
  // The gap the bar has keyboard focus on. Its row is the preview's position, which follows
  // edits; the preview exists for as long as the bar has focus.
  private focused: number | null = null;
  private readonly root: HTMLElement;

  constructor(private readonly view: EditorView) {
    this.root = view.dom.parentElement ?? view.dom;
    this.handle = document.createElement("div");
    this.handle.className = "lydie-column-resize";
    this.handle.setAttribute("role", "separator");
    this.handle.setAttribute("aria-orientation", "vertical");
    // Reached from the selected row (Tab), not in the page's tab order: it shows only there.
    this.handle.tabIndex = -1;
    this.handle.hidden = true;
    this.handle.addEventListener("pointerdown", this.onPointerDown);
    this.handle.addEventListener("keydown", this.onKeyDown);
    this.handle.addEventListener("blur", this.onBlur);
    this.root.addEventListener("pointermove", this.onPointerMove);
    this.root.addEventListener("pointerleave", this.onPointerLeave);
  }

  destroy() {
    this.root.removeEventListener("pointermove", this.onPointerMove);
    this.root.removeEventListener("pointerleave", this.onPointerLeave);
    this.focused = null;
    this.handle.remove();
  }

  update() {
    if (!this.view.editable || columnsStacked(this.view.state)) {
      if (this.focused !== null) this.abandon();
      this.hide();
    } else if (this.focused !== null) {
      const preview = widthsKey.getState(this.view.state)?.preview;
      const row = preview && this.rowAt(preview.pos);
      // The row went, or gained or lost a column, under the bar (someone else's edit).
      if (!row || row.columns.length !== preview.shares.length) return this.abandon();
      this.hover = { row, index: this.focused };
      this.place(this.hover);
    } else if (this.hover && !this.dragging) this.place(this.hover);
  }

  // Drops a keyboard run without writing it. Called from update(), so the clean-up (a dispatch)
  // waits for the update to finish.
  private abandon() {
    this.focused = null;
    this.hide();
    queueMicrotask(() => {
      const { view } = this;
      if (view.isDestroyed) return;
      if (widthsKey.getState(view.state)?.preview) this.preview(null);
      if (document.activeElement === this.handle && view.editable) view.focus();
    });
  }

  // Gives the gap after column `index` of the row at `pos` keyboard focus.
  focusGap(pos: number, index: number) {
    if (columnsStacked(this.view.state)) return false;
    const row = this.rowAt(pos);
    if (!row || index < 0 || index >= row.columns.length - 1) return false;
    const preview = widthsKey.getState(this.view.state)?.preview;
    if (preview?.pos !== pos) this.preview({ pos, shares: this.sharesAt(pos) });
    this.focused = index;
    this.hover = { row, index };
    this.place(this.hover);
    this.handle.focus();
    return true;
  }

  private rowAt(pos: number): Row | null {
    if (this.view.state.doc.nodeAt(pos)?.type.name !== "columnList") return null;
    const dom = this.view.nodeDOM(pos);
    if (!isRow(dom as Element | null)) return null;
    const row = dom as HTMLElement;
    return { pos, dom: row, columns: columnsOf(row) };
  }

  // The row's shares as drawn: the preview while there is one, else its widths.
  private sharesAt(pos: number) {
    const preview = widthsKey.getState(this.view.state)?.preview;
    const node = this.view.state.doc.nodeAt(pos);
    if (preview?.pos === pos && preview.shares.length === node?.childCount) return preview.shares;
    return node ? columnShares(widthsOf(node)) : [];
  }

  private preview(next: Preview | null) {
    this.view.dispatch(this.view.state.tr.setMeta(widthsKey, next).setMeta("addToHistory", false));
  }

  // Writes the previewed widths, if they differ from the row's: one undo step. While the bar
  // keeps focus the preview stays (now equal to the widths), so its row keeps being followed.
  private commit() {
    const { view } = this;
    if (view.isDestroyed) return;
    const preview = widthsKey.getState(view.state)?.preview;
    if (!preview) return;
    const node = view.state.doc.nodeAt(preview.pos);
    const keep = this.focused === null ? null : preview;
    if (node?.type.name !== "columnList" || node.childCount !== preview.shares.length) {
      return this.preview(null);
    }
    const current = columnShares(widthsOf(node));
    if (preview.shares.every((s, i) => s === current[i])) {
      if (!keep) this.preview(null);
      return;
    }
    const tr = view.state.tr.setMeta(widthsKey, keep);
    node.forEach((_column, offset, i) => {
      tr.setNodeAttribute(
        preview.pos + 1 + offset,
        "width",
        Math.round(preview.shares[i]! * 10) / 10,
      );
    });
    view.dispatch(tr);
  }

  private hide() {
    if (this.dragging || this.focused !== null) return;
    this.hover = null;
    this.handle.hidden = true;
  }

  private readonly onPointerLeave = () => this.hide();

  private readonly onPointerMove = (event: PointerEvent) => {
    if (this.dragging || this.focused !== null || event.buttons !== 0) return;
    if (!this.view.editable || this.view.dragging || columnsStacked(this.view.state)) {
      return this.hide();
    }
    if (event.target === this.handle) return;
    const hover = this.find(event);
    if (!hover) return this.hide();
    this.hover = hover;
    this.place(hover);
  };

  // The column gap under the pointer: halfway between two neighbouring columns of a row.
  private find(event: PointerEvent): Hover | null {
    const target = event.target instanceof Element ? event.target : null;
    let el: Element | null = target?.closest('[data-type="column-list"]') ?? null;
    // Directly over the gap the target is the row itself; over a column, its nearest row.
    while (el && !isRow(el)) el = el.parentElement?.closest('[data-type="column-list"]') ?? null;
    if (!el || !this.view.dom.contains(el)) return null;
    const row = el;
    const columns = columnsOf(row);
    for (let i = 0; i < columns.length - 1; i++) {
      const a = columns[i]!.getBoundingClientRect();
      const b = columns[i + 1]!.getBoundingClientRect();
      const middle = (a.right + b.left) / 2;
      const reach = Math.max((b.left - a.right) / 2, REACH);
      if (Math.abs(event.clientX - middle) > reach) continue;
      const pos = this.view.posAtDOM(row, 0) - 1;
      if (this.view.state.doc.nodeAt(pos)?.type.name !== "columnList") return null;
      return { row: { pos, dom: row, columns }, index: i };
    }
    return null;
  }

  private place({ row, index }: Hover) {
    const parent = this.handle.offsetParent ?? this.root;
    if (!this.handle.isConnected) this.root.append(this.handle);
    const a = row.columns[index]!.getBoundingClientRect();
    const b = row.columns[index + 1]!.getBoundingClientRect();
    const box = row.dom.getBoundingClientRect();
    const origin = parent.getBoundingClientRect();
    const scrollTop = parent instanceof HTMLElement ? parent.scrollTop : 0;
    const scrollLeft = parent instanceof HTMLElement ? parent.scrollLeft : 0;
    Object.assign(this.handle.style, {
      left: `${String((a.right + b.left) / 2 - origin.left + scrollLeft)}px`,
      top: `${String(box.top - origin.top + scrollTop)}px`,
      height: `${String(box.height)}px`,
    });
    this.describe(this.sharesAt(row.pos), index);
    this.handle.hidden = false;
  }

  // The separator's value is the left column's width in percent of the row (WAI-ARIA window
  // splitter), bounded by the minimum share either column keeps.
  private describe(shares: readonly number[], index: number) {
    const sum = shares.reduce((a, b) => a + b, 0) || 100;
    const left = ((shares[index] ?? 0) / sum) * 100;
    const pair = left + ((shares[index + 1] ?? 0) / sum) * 100;
    const min = Math.min(MIN_COLUMN_SHARE, pair / 2);
    const set = (name: string, value: number) =>
      this.handle.setAttribute(name, String(Math.round(value)));
    set("aria-valuenow", left);
    set("aria-valuemin", min);
    set("aria-valuemax", pair - min);
    this.handle.setAttribute("aria-label", `Resize columns ${index + 1} and ${index + 2}`);
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    const index = this.focused;
    const pos = widthsKey.getState(this.view.state)?.preview?.pos;
    if (index === null || pos === undefined || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    const step = event.shiftKey ? COLUMN_RESIZE_STEP_LARGE : COLUMN_RESIZE_STEP;
    const count = this.sharesAt(pos).length;
    const move = (dx: number) =>
      // `total` 100: dx is in percent of the row; resizeColumns keeps the minimum.
      this.preview({ pos, shares: resizeColumns(this.sharesAt(pos), index, dx, 100) });
    switch (event.key) {
      case "ArrowLeft":
        move(-step);
        break;
      case "ArrowRight":
        move(step);
        break;
      case "Home":
        move(-100);
        break;
      case "End":
        move(100);
        break;
      // Through the row's gaps, then back into its text: never a trap.
      case "Tab":
        if (event.shiftKey) {
          if (index > 0) this.focusGap(pos, index - 1);
          else this.returnToText(index);
        } else if (index < count - 2) this.focusGap(pos, index + 1);
        else this.returnToText(index + 1);
        break;
      case "Escape":
        this.returnToText(index);
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  private readonly onBlur = () => {
    if (this.focused === null) return;
    this.focused = null;
    this.commit();
    this.hide();
  };

  // Ends the keyboard run (one undo step) and puts the caret at the end of column `column`.
  private returnToText(column: number) {
    const { view } = this;
    const pos = widthsKey.getState(view.state)?.preview?.pos;
    this.focused = null;
    this.commit();
    this.hide();
    if (view.isDestroyed) return;
    const row = pos === undefined ? null : view.state.doc.nodeAt(pos);
    if (pos !== undefined && row?.type.name === "columnList") {
      let end = -1;
      row.forEach((node, offset, i) => {
        if (i === column) end = pos + 1 + offset + node.nodeSize - 1;
      });
      if (end >= 0) {
        const selection = Selection.near(view.state.doc.resolve(end), -1);
        view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
      }
    }
    view.focus();
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    const hover = this.hover;
    if (!hover || event.button !== 0 || !this.view.editable) return;
    const { view } = this;
    const { row, index } = hover;
    // A keyboard run on this bar ends here, as its own undo step.
    if (this.focused !== null) this.commit();
    const node = view.state.doc.nodeAt(row.pos);
    if (node?.type.name !== "columnList") return;
    event.preventDefault();
    const start = columnShares(widthsOf(node));
    const total = row.columns.reduce((sum, c) => sum + c.getBoundingClientRect().width, 0);
    const startX = event.clientX;
    this.dragging = true;
    this.handle.dataset.active = "";
    this.handle.setPointerCapture(event.pointerId);

    const move = (e: PointerEvent) => {
      const shares = resizeColumns(start, index, e.clientX - startX, total);
      const pos = widthsKey.getState(view.state)?.preview?.pos ?? row.pos;
      this.preview({ pos, shares });
      this.place(hover);
    };
    const end = () => {
      this.handle.removeEventListener("pointermove", move);
      this.handle.removeEventListener("pointerup", end);
      this.handle.removeEventListener("pointercancel", end);
      this.dragging = false;
      delete this.handle.dataset.active;
      this.commit();
    };
    this.handle.addEventListener("pointermove", move);
    this.handle.addEventListener("pointerup", end);
    this.handle.addEventListener("pointercancel", end);
  };
}

export const columnResize = () => {
  let resizer: ColumnResizeView | null = null;
  return new Plugin({
    key: new PluginKey("columnResize"),
    view: (view) => (resizer = new ColumnResizeView(view)),
    props: {
      handleDOMEvents: {
        // Tab on a selected row moves to its first gap. A DOM handler, so it comes before every
        // keymap's Tab (the indent handler would put a tab character in place of the row).
        keydown(view, event) {
          if (event.key !== "Tab" || event.shiftKey || event.metaKey || event.ctrlKey) return false;
          const { selection } = view.state;
          if (!(selection instanceof NodeSelection)) return false;
          if (selection.node.type.name !== "columnList" || !view.editable) return false;
          // A stacked row has no bar to go to; Tab still stops here, since the indent handler
          // would replace the selected row with a tab character.
          if (!resizer?.focusGap(selection.from, 0) && !columnsStacked(view.state)) return false;
          event.preventDefault();
          return true;
        },
      },
    },
  });
};
