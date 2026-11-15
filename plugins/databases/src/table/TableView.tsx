/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/interactive-supports-focus, jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-element-interactions -- virtualised ARIA grid: rows and cells are positioned divs, focus stays on the grid (aria-activedescendant) */
// The table, on the grid engine (`@lydie/plugin-api/grid`). Interaction state (active cell, range,
// editing, picked rows, drags, resizes) lives in an external store that components read through
// selectors, so an arrow key re-renders the two cells it moves between and the overlay; scrolling
// re-renders rows only when the rendered window must move. Geometry comes from the model; the
// selection, fill handle and drop lines are one overlay; one editor floats over the active cell.
// Data comes in windows of the view (`useDatabaseView`, which paints edits optimistically), kept
// apart from the interaction store. Every multi-cell gesture (paste, fill, clear, bulk edit) is
// one operation or one transaction: one undo step.
import { Portal, useApp, useBackend, useOps, useTab } from "@lydie/plugin-api";
import {
  isEditableType,
  isEmptyValue,
  PropertyEditor,
  relatedRows,
  rowValue,
  useDatabaseView,
  useMembers,
} from "@lydie/plugin-api/databases";
import type {
  DatabaseProperty,
  EditorCloseReason,
  GroupKey,
  PropertyValue,
  ViewRow,
} from "@lydie/plugin-api/databases";
import {
  clipboardMatrix,
  columnsSelection,
  createGeometry,
  createGridStore,
  hitTest,
  isRange,
  keyCommand,
  nearestRow,
  pasteTargets,
  rectOf,
  rowsSelection,
  single,
  spacerBefore,
  tabSelection,
  toggledRows,
  toHtmlTable,
  toTsv,
  useStoreSelector,
  windowFor,
} from "@lydie/plugin-api/grid";
import type {
  Cell,
  Geometry,
  GridSelection,
  GridStore,
  Matrix,
  Rect,
  Scroll,
  Viewport,
} from "@lydie/plugin-api/grid";
import { DotsVerticalRegular, ErrorState } from "@lydie/plugin-api/ui";
import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  ClipboardEvent,
  CSSProperties,
  KeyboardEvent,
  MouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";

import { useViewContext } from "../context.tsx";
import { useFilterUi } from "../filter-ui.tsx";
import { PLACEHOLDERS } from "../skeleton.tsx";
import { AnchoredPopover } from "../ui.tsx";
import {
  allColumns,
  movedColumns,
  placeholderItems,
  tableItems,
  visibleColumns,
  withColumn,
} from "../view-model.ts";
import type { Column, TableItem } from "../view-model.ts";
import { BulkBar } from "./BulkBar.tsx";
import { cellText, fillLine, needsRelationLookup, parseCell } from "./cell-values.ts";
import type { Resolvers } from "./cell-values.ts";
import { ExtraItem } from "./GroupRows.tsx";
import { HEADER, HeaderRow, TRAILING } from "./Header.tsx";
import { Overlay } from "./Overlay.tsx";
import { FOOTER, SummaryRow } from "./SummaryRow.tsx";
import { cellId, LEADING, TableRow } from "./TableRow.tsx";

const HEIGHTS = { short: 34, medium: 56, tall: 88, extra: 120 } as const;
// The title column stays in place while scrolling sideways. The view config has no setting for
// more frozen columns; the engine takes any number.
const FROZEN = 1;
const MIN_WIDTH = 60;
const MAX_WIDTH = 1200;

type RowItem = { itemIndex: number; position: number; group: GroupKey };
type ViewWindowGroups = ReturnType<typeof useDatabaseView>["groups"];
type Write = {
  renames: { id: string; title: string }[];
  updates: Map<string, { rowId: string; set: Record<string, PropertyValue> }>;
};

export function TableView({ maxHeight }: { maxHeight?: number }) {
  const ctx = useViewContext();
  const { definition, view, params, databaseId } = ctx;
  const app = useApp();
  const ops = useOps();
  const backend = useBackend();
  const tab = useTab();
  const filterUi = useFilterUi();
  const members = useMembers();
  const [store] = useState(createGridStore);
  const gridId = `g${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const scroller = useRef<HTMLDivElement>(null);
  // A row drag's ghost and the pointer it follows.
  const ghost = useRef<HTMLDivElement>(null);
  const ghostAt = useRef({ x: 0, y: 0 });
  const content = useRef<HTMLDivElement>(null);
  const editorAnchor = useRef<HTMLDivElement>(null);
  const [viewportSize] = useState(() => ({ width: 1000, height: 600 }));
  const [pendingEdit, setPendingEdit] = useState<string | null>(null);
  // The page margin the table starts at and bleeds into when scrolled sideways: a CSS length
  // (`--table-inset`, a function of the width) on the page, measured here in px.
  const insetProbe = useRef<HTMLDivElement>(null);
  const [inset, setInset] = useState(0);
  // Widths saved on release, shown until the view has them.
  const [widthDrafts, setWidthDrafts] = useState<ReadonlyMap<string, number>>(new Map());

  const rowHeight = HEIGHTS[view.config.layout.rowHeight ?? "short"];
  const wrap = view.config.layout.wrapCells ?? false;
  // The same array while the columns are the same (a filter change emits a new definition and
  // view): rows memoised on it then skip re-rendering until their data changes.
  const [columnCache] = useState(() => ({ last: [] as Column[] }));
  const columns = useMemo(() => {
    const next = visibleColumns(definition, view).map((c) => {
      const draft = widthDrafts.get(c.property.id);
      return draft === undefined ? c : { ...c, width: draft };
    });
    const last = columnCache.last;
    const same =
      next.length === last.length &&
      next.every((c, i) => {
        const before = last[i]!;
        // By content: over IPC an unchanged property arrives as a new object.
        return (
          c.width === before.width &&
          (c.property === before.property ||
            (c.property.id === before.property.id &&
              c.property.updatedAt === before.property.updatedAt))
        );
      });
    if (!same) columnCache.last = next;
    return columnCache.last;
  }, [definition, view, columnCache, widthDrafts]);
  useEffect(() => {
    if (widthDrafts.size === 0) return;
    const saved = visibleColumns(definition, view);
    if (
      saved.every(
        (c) => !widthDrafts.has(c.property.id) || widthDrafts.get(c.property.id) === c.width,
      )
    )
      setWidthDrafts(new Map());
  }, [definition, view, widthDrafts]);

  const grouped = view.config.groupBy !== null;
  const groupProperty = definition.properties.find((p) => p.id === view.config.groupBy?.propertyId);
  const manual = view.config.sorts.length === 0;

  // The shape (total and groups) drives the items; it changes only when they do.
  // Until the first result (`pending`) the table draws placeholder rows.
  const [shape, setShape] = useState<{
    total: number;
    groups: ViewWindowGroups;
    pending: boolean;
  }>({ total: 0, groups: [], pending: true });
  const items = useMemo(
    () =>
      shape.pending
        ? placeholderItems(PLACEHOLDERS)
        : tableItems(shape.total, shape.groups, grouped, view.config.groupBy?.collapsed ?? []),
    [shape, grouped, view.config.groupBy?.collapsed],
  );
  const rowItems = useMemo(() => {
    const out: RowItem[] = [];
    items.forEach((item, itemIndex) => {
      if (item.kind === "row") out.push({ itemIndex, position: item.position, group: item.group });
    });
    return out;
  }, [items]);
  // ARIA row index per item (the header is 1; "add" items are not rows).
  const aria = useMemo(() => {
    const index = new Int32Array(items.length);
    let n = 1;
    items.forEach((item, i) => {
      if (item.kind !== "add") index[i] = ++n;
    });
    return { index, count: n };
  }, [items]);

  const frozenLefts = useMemo(() => {
    const out: number[] = [];
    let x = LEADING;
    for (let col = 0; col < FROZEN && col < columns.length; col++) {
      out.push(x);
      x += columns[col]!.width;
    }
    return out;
  }, [columns]);
  const geometry = useMemo(
    () =>
      createGeometry({
        columnWidths: columns.map((c) => c.width),
        frozen: FROZEN,
        rowHeight,
        header: HEADER,
        footer: FOOTER,
        inset,
        leading: LEADING,
        trailing: TRAILING,
        items: items.length,
        rowToItem: rowItems.map((r) => r.itemIndex),
      }),
    [columns, rowHeight, items.length, rowItems, inset],
  );

  // The data window follows the rendered rows (page-aligned, so it changes rarely).
  const win = useStoreSelector(
    store,
    (s) => dataWindow(items, s.viewport, shape.total),
    (a, b) => a.offset === b.offset && a.limit === b.limit,
  );
  const result = useDatabaseView({ ...params, window: win });
  useLayoutEffect(() => {
    if (result.isLoading) return;
    setShape((s) =>
      !s.pending && s.total === result.total && sameGroups(s.groups, result.groups)
        ? s
        : { total: result.total, groups: result.groups, pending: false },
    );
  }, [result]);

  const rowAtPosition = (position: number): ViewRow | undefined =>
    result.rows[position - result.offset];
  const rowAt = (row: number): ViewRow | undefined => rowAtPosition(rowItems[row]?.position ?? -1);
  // The rows of the page open in the panel (more than one when it shows in several groups).
  const peekedRows = useMemo(() => {
    const out: number[] = [];
    if (ctx.peekedId === null) return out;
    rowItems.forEach((r, row) => {
      if (result.rows[r.position - result.offset]?.id === ctx.peekedId) out.push(row);
    });
    return out;
  }, [ctx.peekedId, rowItems, result]);

  // ---- Viewport and geometry

  const readScroll = (): Scroll => {
    const el = scroller.current;
    return {
      top: el?.scrollTop ?? 0,
      left: el?.scrollLeft ?? 0,
      width: viewportSize.width,
      height: viewportSize.height,
    };
  };

  useLayoutEffect(() => {
    store.setGeometry(geometry, readScroll());
  });

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      viewportSize.width = el.clientWidth;
      viewportSize.height = el.clientHeight;
      store.scrolled(readScroll());
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- readScroll reads refs only
  }, [store, viewportSize]);

  useLayoutEffect(() => {
    const el = insetProbe.current;
    if (!el) return;
    const measure = () => setInset(Math.max(0, Math.round(el.getBoundingClientRect().width)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The grid keeps focus; assistive technology follows the active cell.
  useEffect(() => {
    const update = () => {
      const el = scroller.current;
      const s = store.getState();
      if (!el) return;
      if (s.selection)
        el.setAttribute(
          "aria-activedescendant",
          cellId(gridId, s.selection.focus.row, s.selection.focus.col),
        );
      else el.removeAttribute("aria-activedescendant");
    };
    update();
    return store.subscribe(update);
  }, [store, gridId]);

  // At most one window update per frame, in the frame's animation callbacks (rendering inside
  // every scroll event measured slower: p95 frame 21 ms against 17 ms).
  const [scrollFrame] = useState(() => ({ id: 0 }));
  const onScroll = () => {
    if (scrollFrame.id) return;
    scrollFrame.id = requestAnimationFrame(() => {
      scrollFrame.id = 0;
      store.scrolled(readScroll());
    });
  };
  useEffect(() => () => cancelAnimationFrame(scrollFrame.id), [scrollFrame]);

  function reveal(cell: Cell) {
    const el = scroller.current;
    const target = store.revealTarget(cell, readScroll());
    if (!el || !target) return;
    el.scrollTop = target.top;
    el.scrollLeft = target.left;
    // Render the new window now, not at the next scroll event.
    store.scrolled(readScroll());
  }

  function select(selection: GridSelection) {
    store.dispatch({ type: "select", selection });
    reveal(selection.focus);
  }

  // A new row from "+ New": edit its title once it is loaded.
  useEffect(() => {
    if (!pendingEdit) return;
    const index = rowItems.findIndex((r) => rowAtPosition(r.position)?.id === pendingEdit);
    if (index === -1) return;
    setPendingEdit(null);
    select(single({ row: index, col: 0 }));
    requestAnimationFrame(() => startEdit({ row: index, col: 0 }));
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- runs when the new row may have arrived
  }, [pendingEdit, rowItems, result]);

  // ---- Writes

  const failed = (error: unknown) =>
    app.notify({
      title: "Could not save",
      description: error instanceof Error ? error.message : String(error),
      kind: "error",
    });
  const scope = () => tab?.id ?? app.historyScope();

  // One cell; with several pages picked and this one among them, every picked page.
  const writeValue = (row: ViewRow, property: DatabaseProperty, value: PropertyValue) => {
    if (property.type === "title") {
      const title = typeof value === "string" ? value.trim() : "";
      if (title && title !== row.title)
        void ops.doc.rename({ id: row.id, title }, { label: "Rename page" }).catch(failed);
      return;
    }
    const picked = store.getState().rows.ids;
    const many = picked.size > 1 && picked.has(row.id);
    void ops.database
      .setValues(
        { databaseId, rowIds: many ? [...picked] : [row.id], set: { [property.id]: value } },
        many ? { label: "Edit pages" } : undefined,
      )
      .catch(failed);
  };

  const write = (label: string, { renames, updates }: Write) => {
    if (renames.length === 0 && updates.size === 0) return Promise.resolve();
    if (updates.size > 10_000) {
      app.notify({
        title: "Too many pages at once",
        description: "Change at most 10,000 pages in one step.",
      });
      return Promise.resolve();
    }
    if (renames.length === 0)
      return ops.database
        .setValues({ databaseId, updates: [...updates.values()] }, { label })
        .then(() => {});
    return backend
      .transaction(
        label,
        async (tx) => {
          for (const r of renames) await tx.doc.rename(r);
          if (updates.size)
            await tx.database.setValues({ databaseId, updates: [...updates.values()] });
        },
        { scope: scope() },
      )
      .then(() => {});
  };

  const setIn = (w: Write, row: ViewRow, property: DatabaseProperty, value: PropertyValue) => {
    const update = w.updates.get(row.id) ?? { rowId: row.id, set: {} };
    update.set[property.id] = value;
    w.updates.set(row.id, update);
  };

  // Rows [top, bottom] (navigable indexes): from the loaded window, else read in pages.
  async function rowsBetween(top: number, bottom: number): Promise<(ViewRow | undefined)[]> {
    const out: (ViewRow | undefined)[] = [];
    const missing: number[] = [];
    for (let r = top; r <= bottom; r++) {
      const position = rowItems[r]?.position;
      const row = position === undefined ? undefined : rowAtPosition(position);
      out.push(row);
      if (!row && position !== undefined) missing.push(position);
    }
    if (missing.length === 0) return out;
    const fetched = new Map<number, ViewRow>();
    const from = Math.min(...missing);
    const to = Math.max(...missing) + 1;
    for (let offset = from; offset < to; offset += 1000) {
      const page = await backend.query("database.view", {
        ...params,
        window: { offset, limit: Math.min(1000, to - offset) },
      });
      let i = 0;
      for (const item of page) if (item.kind === "row") fetched.set(offset + i++, item.row);
    }
    return out.map((row, i) => row ?? fetched.get(rowItems[top + i]?.position ?? -1));
  }

  // Titles in relation targets and people by name, for pasted and filled text.
  async function resolversFor(properties: readonly DatabaseProperty[]): Promise<Resolvers> {
    const titles = new Map<string, Map<string, string>>();
    for (const property of properties) {
      const target = property.config.relation?.databaseId;
      if (!target || titles.has(target)) continue;
      const byTitle = new Map<string, string>();
      for (let offset = 0; offset < 20_000; offset += 1000) {
        const page = await backend.query("database.view", {
          databaseId: target,
          view: { config: { filter: null, groupBy: null, subGroupBy: null } },
          window: { offset, limit: 1000 },
        });
        const rows = page.filter((i) => i.kind === "row");
        for (const item of rows)
          if (item.kind === "row")
            byTitle.set((item.row.title || "Untitled").toLowerCase(), item.row.id);
        if (rows.length < 1000) break;
      }
      titles.set(target, byTitle);
    }
    const people = new Map<string, string>();
    for (const member of members.values()) {
      people.set(member.userId.toLowerCase(), member.userId);
      if (member.userName) people.set(member.userName.toLowerCase(), member.userId);
      if (member.userEmail) people.set(member.userEmail.toLowerCase(), member.userId);
    }
    return {
      relation: (property, title) =>
        titles.get(property.config.relation?.databaseId ?? "")?.get(title.trim().toLowerCase()) ??
        null,
      person: (text) => people.get(text.trim().toLowerCase()) ?? null,
    };
  }

  function toggleCheckbox(cell: Cell) {
    const column = columns[cell.col];
    const row = rowAt(cell.row);
    if (!column || !row || column.property.type !== "checkbox") return;
    writeValue(row, column.property, rowValue(column.property, row) !== true);
  }

  // Space/Enter on a range: its checkbox cells all checked, or all unchecked when they already
  // are (as in Sheets and Airtable). One undo step.
  async function toggleRange(selection: GridSelection) {
    if (!isRange(selection)) {
      toggleCheckbox(selection.focus);
      return;
    }
    const rect = rectOf(selection);
    const properties = columns
      .slice(rect.left, rect.right + 1)
      .map((c) => c.property)
      .filter((p) => p.type === "checkbox");
    const rows = (await rowsBetween(rect.top, rect.bottom)).filter((r) => r !== undefined);
    const value = rows.some((row) => properties.some((p) => rowValue(p, row) !== true));
    const w: Write = { renames: [], updates: new Map() };
    for (const row of rows) for (const p of properties) setIn(w, row, p, value);
    await write(value ? "Check" : "Uncheck", w);
  }

  function startEdit(cell: Cell, initialText?: string) {
    const column = columns[cell.col];
    if (!column || !rowAt(cell.row)) return;
    if (column.property.type === "checkbox") {
      toggleCheckbox(cell);
      return;
    }
    store.dispatch({
      type: "startEdit",
      cell,
      ...(initialText !== undefined ? { initialText } : {}),
    });
  }

  // Delete/Backspace: the range's editable cells (or the active column of every picked page).
  async function clearRange(selection: GridSelection) {
    const rect = rectOf(selection);
    const unset = columns
      .slice(rect.left, rect.right + 1)
      .map((c) => c.property)
      .filter((p) => p.type !== "title" && isEditableType(p.type))
      .map((p) => p.id);
    if (unset.length === 0) return;
    const picked = store.getState().rows.ids;
    const active = rowAt(selection.focus.row);
    if (!isRange(selection) && active && picked.size > 1 && picked.has(active.id)) {
      await ops.database.setValues(
        { databaseId, rowIds: [...picked], unset },
        { label: "Clear cells" },
      );
      return;
    }
    const rows = await rowsBetween(rect.top, rect.bottom);
    const updates = rows.flatMap((row) => (row ? [{ rowId: row.id, unset }] : []));
    if (updates.length)
      await ops.database.setValues({ databaseId, updates }, { label: "Clear cells" });
  }

  const matrixOf = (rect: Rect, rows: readonly (ViewRow | undefined)[]): string[][] =>
    rows.map((row) =>
      columns.slice(rect.left, rect.right + 1).map((c) => (row ? cellText(c.property, row) : "")),
    );

  async function paste(selection: GridSelection, matrix: Matrix) {
    const targets = pasteTargets(selection, matrix, store.getState().size);
    if (targets.length === 0) return;
    const top = targets[0]!.row;
    const bottom = targets.at(-1)!.row;
    const rows = await rowsBetween(top, bottom);
    const lookups = [
      ...new Set(
        targets.flatMap((t) => {
          const p = columns[t.col]?.property;
          return p && needsRelationLookup(p, t.text) ? [p] : [];
        }),
      ),
    ];
    const resolvers = await resolversFor(lookups);
    const w: Write = { renames: [], updates: new Map() };
    for (const target of targets) {
      const row = rows[target.row - top];
      const property = columns[target.col]?.property;
      if (!row || !property) continue;
      if (property.type === "title") {
        const title = target.text.replace(/\s+/g, " ").trim();
        if (title && title !== row.title) w.renames.push({ id: row.id, title });
        continue;
      }
      const parsed = parseCell(property, target.text, resolvers);
      if (parsed) setIn(w, row, property, parsed.value);
    }
    await write("Paste", w);
  }

  async function fill(source: Rect, target: Rect, label = "Fill") {
    const vertical = target.left === source.left && target.right === source.right;
    const backward = vertical ? target.bottom < source.top : target.right < source.left;
    const top = Math.min(source.top, target.top);
    const rows = await rowsBetween(top, Math.max(source.bottom, target.bottom));
    const rowOf = (r: number) => rows[r - top];
    const order = (from: number, to: number) => {
      const out: number[] = [];
      for (let i = from; i <= to; i++) out.push(i);
      return backward ? out.reverse() : out;
    };
    const resolvers = await resolversFor(
      columns.map((c) => c.property).filter((p) => p.type === "relation"),
    );
    const w: Write = { renames: [], updates: new Map() };
    const apply = (
      row: ViewRow | undefined,
      property: DatabaseProperty,
      result: ReturnType<typeof fillLine>[number],
    ) => {
      if (!row) return;
      if (result.kind === "title" && result.title !== row.title)
        w.renames.push({ id: row.id, title: result.title });
      if (result.kind === "value") setIn(w, row, property, result.value);
    };
    if (vertical) {
      for (let col = source.left; col <= source.right; col++) {
        const property = columns[col]?.property;
        if (!property) continue;
        const cells = order(source.top, source.bottom).map((r) => rowOf(r));
        if (cells.some((row) => !row)) continue;
        const sourceCells = (backward ? cells.reverse() : cells).map((row) => ({
          property,
          row: row!,
        }));
        const targetRows = order(target.top, target.bottom);
        fillLine(
          sourceCells,
          targetRows.map(() => property),
          backward,
          resolvers,
        ).forEach((result, i) => apply(rowOf(targetRows[i]!), property, result));
      }
    } else {
      for (let r = source.top; r <= source.bottom; r++) {
        const row = rowOf(r);
        if (!row) continue;
        const sourceCells = [];
        for (let col = source.left; col <= source.right; col++)
          sourceCells.push({ property: columns[col]!.property, row });
        const targetCols = order(target.left, target.right);
        fillLine(
          sourceCells,
          targetCols.map((c) => columns[c]!.property),
          backward,
          resolvers,
        ).forEach((result, i) => apply(row, columns[targetCols[i]!]!.property, result));
      }
    }
    await write(label, w);
  }

  async function allRowIds(): Promise<string[]> {
    const ids = new Set<string>();
    for (let offset = 0; offset < Math.max(shape.total, 1); offset += 1000) {
      const page = await backend.query("database.view", {
        ...params,
        window: { offset, limit: 1000 },
      });
      for (const item of page) if (item.kind === "row") ids.add(item.row.id);
    }
    return [...ids];
  }

  async function pickRows(row: number, extend: boolean) {
    const s = store.getState();
    const anchor = s.rows.anchor;
    let ids: string[];
    if (extend && anchor !== null) {
      const rows = await rowsBetween(Math.min(anchor, row), Math.max(anchor, row));
      ids = rows.flatMap((r) => (r ? [r.id] : []));
    } else {
      const r = rowAt(row);
      ids = r ? [r.id] : [];
    }
    if (ids.length === 0) return;
    const next = toggledRows(
      store.getState().rows,
      ids,
      extend && anchor !== null ? anchor : row,
      extend,
    );
    store.dispatch({ type: "setRows", ids: next.ids, anchor: next.anchor });
  }

  const pickAll = async (all: boolean) =>
    store.dispatch({ type: "setRows", ids: new Set(all ? await allRowIds() : []), anchor: null });

  // ---- Editor

  const closeEditor = (reason: EditorCloseReason) => {
    const mode = store.getState().mode;
    store.dispatch({ type: "endEdit" });
    rescue.until = performance.now() + 250;
    // Back to the grid, also after the popover's own focus restore (it has no focusable trigger).
    const refocus = () => scroller.current?.focus({ preventScroll: true });
    refocus();
    const check = () => {
      const active = document.activeElement;
      if (!active || active === document.body) refocus();
    };
    requestAnimationFrame(() => requestAnimationFrame(check));
    setTimeout(check, 60);
    if (mode.kind === "editing" && (reason === "tab" || reason === "shiftTab"))
      select(tabSelection(single(mode.cell), store.getState().size, reason === "shiftTab"));
  };

  // ---- Keyboard

  const page = Math.max(1, Math.floor((viewportSize.height - HEADER - FOOTER) / rowHeight) - 1);

  // `rescued`: a key that reached the page body in the frame after an editor closed (LYD-257).
  const onKeyDown = (
    event: KeyboardEvent<HTMLDivElement> | globalThis.KeyboardEvent,
    rescued = false,
  ) => {
    const state = store.getState();
    if (state.mode.kind === "editing" || (!rescued && event.target !== scroller.current)) return;
    const command = keyCommand(event, state, {
      page,
      editable: (col) => {
        const type = columns[col]?.property.type;
        return type !== undefined && isEditableType(type);
      },
      checkbox: (col) => columns[col]?.property.type === "checkbox",
      isBlank: (cell) => {
        const row = rowAt(cell.row);
        const column = columns[cell.col];
        return row && column ? isEmptyValue(rowValue(column.property, row)) : undefined;
      },
    });
    if (!command) return;
    event.preventDefault();
    const focus = state.selection?.focus;
    const activeRow = focus ? rowAt(focus.row) : undefined;
    switch (command.type) {
      case "select":
        select(command.selection);
        break;
      case "edit":
        if (focus) startEdit(focus, command.initialText);
        break;
      case "toggle":
        if (state.selection) void toggleRange(state.selection).catch(failed);
        break;
      case "open":
        if (activeRow) ctx.openRow(activeRow.id, event);
        break;
      case "peek":
        if (activeRow) ctx.peekRow(activeRow.id);
        break;
      case "clear":
        if (state.selection) void clearRange(state.selection).catch(failed);
        break;
      case "toggleRow":
        if (focus) void pickRows(focus.row, command.extend);
        break;
      case "selectAllRows":
        void pickAll(true);
        break;
      case "escape":
        // The open page is the topmost thing to dismiss; the selection unwinds after it.
        if (ctx.peekedId) ctx.closePeek();
        else store.dispatch({ type: "escape" });
        break;
      case "filter":
        filterUi.setMenuOpen(true);
        break;
      case "fill": {
        const down = command.target.left === command.source.left;
        void fill(command.source, command.target, down ? "Fill down" : "Fill right").catch(failed);
        break;
      }
      case "ignore":
        break;
    }
  };

  // Keys typed right after an editor closes can arrive before focus is back on the grid (the
  // popover restores focus a frame later, to the body): handle them as the grid's.
  const [rescue] = useState(() => ({ until: 0, handle: onKeyDown }));
  useLayoutEffect(() => {
    rescue.handle = onKeyDown;
  });
  useEffect(() => {
    const listener = (event: globalThis.KeyboardEvent) => {
      if (performance.now() > rescue.until || event.defaultPrevented) return;
      const active = document.activeElement;
      if (active && active !== document.body) return;
      scroller.current?.focus({ preventScroll: true });
      rescue.handle(event, true);
    };
    document.addEventListener("keydown", listener, true);
    return () => document.removeEventListener("keydown", listener, true);
  }, [rescue]);

  // ---- Clipboard (TSV and an HTML table; rows outside the loaded window are read first)

  const onCopy = (event: ClipboardEvent<HTMLDivElement>, cut = false) => {
    const state = store.getState();
    if (state.mode.kind === "editing" || !state.selection || event.target !== scroller.current)
      return;
    event.preventDefault();
    const selection = state.selection;
    const rect = rectOf(selection);
    const loaded: (ViewRow | undefined)[] = [];
    for (let r = rect.top; r <= rect.bottom; r++) loaded.push(rowAt(r));
    if (loaded.every(Boolean)) {
      const matrix = matrixOf(rect, loaded);
      event.clipboardData.setData("text/plain", toTsv(matrix));
      event.clipboardData.setData("text/html", toHtmlTable(matrix));
    } else {
      void rowsBetween(rect.top, rect.bottom)
        .then((rows) => {
          const matrix = matrixOf(rect, rows);
          return navigator.clipboard.write([
            new ClipboardItem({
              "text/plain": new Blob([toTsv(matrix)], { type: "text/plain" }),
              "text/html": new Blob([toHtmlTable(matrix)], { type: "text/html" }),
            }),
          ]);
        })
        .catch(failed);
    }
    if (cut) void clearRange(selection).catch(failed);
  };

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const state = store.getState();
    if (state.mode.kind === "editing" || !state.selection || event.target !== scroller.current)
      return;
    event.preventDefault();
    const matrix = clipboardMatrix({
      html: event.clipboardData.getData("text/html"),
      text: event.clipboardData.getData("text/plain"),
    });
    void paste(state.selection, matrix).catch(failed);
  };

  // ---- Pointer gestures (positions from the geometry, not from the cells)

  const hitAt = (clientX: number, clientY: number, box: DOMRect) =>
    hitTest(geometry, clientX - box.left, clientY - box.top, readScroll());

  // Window listeners for one drag; scrolls when the pointer leaves the body.
  function track(
    onMove: (event: PointerEvent, box: DOMRect) => void,
    onUp: (event: PointerEvent) => void,
  ) {
    const el = scroller.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const move = (event: PointerEvent) => {
      if (event.clientY < box.top + HEADER) el.scrollTop -= rowHeight;
      else if (event.clientY > box.bottom - FOOTER) el.scrollTop += rowHeight;
      onMove(event, box);
    };
    const up = (event: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      onUp(event);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  const cellUnder = (event: PointerEvent, box: DOMRect): Cell | null => {
    const hit = hitAt(event.clientX, event.clientY, box);
    const size = store.getState().size;
    if (size.rows === 0) return null;
    const row =
      hit.row >= 0
        ? hit.row
        : hit.item === -2
          ? size.rows - 1
          : hit.item === -1
            ? 0
            : nearestRow(geometry, hit.item);
    const col = hit.col === -1 ? 0 : hit.col === -2 ? size.cols - 1 : hit.col;
    return { row, col };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const el = event.target as HTMLElement;
    if (el.closest("[role=columnheader], [data-fill-handle], [data-resize-handle]")) return;
    const box = scroller.current!.getBoundingClientRect();
    const hit = hitAt(event.clientX, event.clientY, box);
    if (el.closest("[data-drag-handle]") && hit.row >= 0) {
      event.preventDefault();
      ghostAt.current = { x: event.clientX, y: event.clientY };
      startRowDrag(hit.row, box);
      return;
    }
    if (el.closest("[data-row-select]") && hit.row >= 0) {
      event.preventDefault();
      void pickRows(hit.row, event.shiftKey);
      return;
    }
    if (el.closest("a,button,input") || hit.row < 0) return;
    event.preventDefault();
    scroller.current?.focus({ preventScroll: true });
    const state = store.getState();
    if (hit.col === -1) {
      // The gutter: whole rows.
      const anchor = event.shiftKey && state.selection ? state.selection.anchor.row : hit.row;
      store.dispatch({
        type: "select",
        selection: rowsSelection(anchor, hit.row, state.size),
      });
      return;
    }
    if (hit.col < 0) return;
    store.dispatch({
      type: "pointerDown",
      cell: { row: hit.row, col: hit.col },
      shift: event.shiftKey,
    });
    track(
      (move, b) => {
        const cell = cellUnder(move, b);
        if (cell) store.dispatch({ type: "pointerOver", cell });
      },
      () => store.dispatch({ type: "pointerUp" }),
    );
  };

  function startRowDrag(row: number, box: DOMRect) {
    store.dispatch({ type: "startRowDrag", row });
    if (store.getState().mode.kind !== "rowDragging") return;
    const cursor = document.body.style.cursor;
    document.body.style.cursor = "grabbing";
    track(
      (move) => {
        ghostAt.current = { x: move.clientX, y: move.clientY };
        // Moved here, not through React: the ghost follows every pointer event.
        if (ghost.current) ghost.current.style.transform = ghostTransform(ghostAt.current);
        const hit = hitAt(move.clientX, move.clientY, box);
        if (hit.item >= 0) store.dispatch({ type: "rowDragOver", item: hit.item, edge: hit.edge });
      },
      () => {
        document.body.style.cursor = cursor;
        const mode = store.getState().mode;
        store.dispatch({ type: "endDrag" });
        if (mode.kind === "rowDragging" && mode.over)
          void dropRow(mode.row, mode.over.item, mode.over.edge);
      },
    );
  }

  async function dropRow(from: number, itemIndex: number, edge: "before" | "after") {
    const row = rowAt(from);
    const fromGroup = rowItems[from]?.group ?? null;
    const over = items[itemIndex];
    if (!row || !over) return;
    let input: Parameters<typeof ctx.moveRow>[0] | null = null;
    if (over.kind === "row") {
      const overRow = rowAtPosition(over.position);
      if (!overRow || overRow.id === row.id) return;
      const changesGroup = grouped && over.group !== fromGroup;
      if (!manual && !changesGroup) {
        app.notify({
          title: "Sorted views keep their order",
          description: "Remove the sorts to reorder by hand.",
        });
        return;
      }
      input = {
        row,
        ...(manual ? (edge === "before" ? { beforeId: overRow.id } : { afterId: overRow.id }) : {}),
        ...(changesGroup ? { group: over.group, fromGroup } : {}),
      };
    } else {
      const group = over.kind === "group" ? over.group.key : over.group;
      if (!grouped || group === undefined || group === fromGroup) return;
      input = { row, group, fromGroup };
    }
    await ctx.moveRow(input, { label: "Move page" }).catch(failed);
  }

  const onHeaderPointerDown = (col: number, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("[data-resize-handle]")) return;
    const state = store.getState();
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      // Whole columns; the property menu stays closed.
      event.preventDefault();
      event.stopPropagation();
      scroller.current?.focus({ preventScroll: true });
      const anchor = event.shiftKey && state.selection ? state.selection.anchor.col : col;
      store.dispatch({ type: "select", selection: columnsSelection(anchor, col, state.size) });
      return;
    }
    if (col < FROZEN) return;
    const startX = event.clientX;
    let started = false;
    track(
      (move, box) => {
        if (!started && Math.abs(move.clientX - startX) < 5) return;
        if (!started) {
          started = true;
          store.dispatch({ type: "startColumnDrag", col });
        }
        const hit = hitAt(move.clientX, box.top + HEADER / 2, box);
        const over = hit.col === -2 ? columns.length - 1 : hit.col;
        if (over >= FROZEN) store.dispatch({ type: "columnDragOver", col: over });
      },
      () => {
        if (!started) return;
        const mode = store.getState().mode;
        store.dispatch({ type: "endDrag" });
        if (mode.kind !== "columnDragging" || mode.over === null || mode.over === col) return;
        const moving = columns[col]!.property.id;
        const beforeId =
          mode.over > col
            ? (columns[mode.over + 1]?.property.id ?? null)
            : columns[mode.over]!.property.id;
        // Every column, so hidden ones keep their place.
        ctx.updateView(
          { columns: movedColumns(allColumns(definition, view), moving, beforeId) },
          { label: "Move column" },
        );
      },
    );
  };

  const onResizeStart = (col: number, event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const column = columns[col];
    const el = content.current;
    if (!column || !el) return;
    const startX = event.clientX;
    const startWidth = column.width;
    let width = startWidth;
    store.dispatch({ type: "startResize", col, width });
    // Paint through CSS variables while the pointer moves; save once on release.
    const paint = (w: number) => {
      el.style.setProperty(`--c${col}`, `${w}px`);
      el.style.setProperty("--grid-w", `${geometry.totalWidth + w - startWidth}px`);
    };
    track(
      (move) => {
        width = Math.max(
          MIN_WIDTH,
          Math.min(MAX_WIDTH, Math.round(startWidth + move.clientX - startX)),
        );
        paint(width);
        store.dispatch({ type: "resize", width });
      },
      () => {
        store.dispatch({ type: "endResize" });
        if (width === startWidth) {
          paint(startWidth);
          return;
        }
        setWidthDrafts((drafts) => new Map(drafts).set(column.property.id, width));
        ctx.updateView(
          { columns: withColumn(allColumns(definition, view), column.property.id, { width }) },
          { label: "Resize column" },
        );
      },
    );
  };

  const onFillStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    store.dispatch({ type: "startFill" });
    track(
      (move, box) => {
        const cell = cellUnder(move, box);
        if (cell) store.dispatch({ type: "fillOver", cell });
      },
      () => {
        const mode = store.getState().mode;
        store.dispatch({ type: "endFill" });
        if (mode.kind === "filling" && mode.target)
          void fill(mode.source, mode.target).catch(failed);
      },
    );
  };

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const el = event.target as HTMLElement;
    const peek = el.closest<HTMLElement>("[data-peek-row]");
    if (peek) {
      event.preventDefault();
      ctx.peekRow(peek.dataset.peekRow!);
      return;
    }
    if (event.shiftKey || event.metaKey || event.ctrlKey) return;
    if (el.closest("a,button,input,[role=columnheader]")) return;
    const cell = el.closest<HTMLElement>("[data-cell]");
    const rowEl = el.closest<HTMLElement>("[data-r]");
    if (!cell || !rowEl) return;
    const at = { row: Number(rowEl.dataset.r), col: Number(cell.dataset.c) };
    const type = columns[at.col]?.property.type;
    // A plain click edits the cell (a checkbox flips). Not the end of a drag over several cells,
    // and not a computed value: those are only selected.
    const selection = store.getState().selection;
    if (!type || !isEditableType(type) || !selection) return;
    const rect = rectOf(selection);
    if (rect.top !== at.row || rect.bottom !== at.row) return;
    if (rect.left !== at.col || rect.right !== at.col) return;
    startEdit(at);
  };

  // ---- Render

  if (result.error && result.rows.length === 0) {
    return <ErrorState title="Could not load this view" error={result.error} />;
  }

  const widths: Record<string, string> = {
    "--grid-w": `${geometry.totalWidth}px`,
    "--inset": `${inset}px`,
  };
  columns.forEach((c, i) => (widths[`--c${i}`] = `${c.width}px`));
  const spacerFor = (colStart: number) => spacerBefore(geometry, Math.max(colStart, FROZEN));

  return (
    <div className="relative flex min-h-0 grow flex-col" data-testid="table-view">
      <div
        ref={insetProbe}
        aria-hidden
        className="h-0 shrink-0"
        style={{ width: "var(--table-inset, 0px)" }}
      />
      <PickedBar store={store} onSelectAll={() => void pickAll(true)} />
      <RowGhost store={store} rowAt={rowAt} at={ghostAt} ghost={ghost} />
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a grid takes focus to navigate its cells */}
      <div
        ref={scroller}
        role="grid"
        aria-label="Table"
        aria-rowcount={aria.count}
        aria-colcount={columns.length + 1}
        aria-multiselectable
        aria-busy={shape.pending}
        tabIndex={0}
        onScroll={onScroll}
        // A popover that closes gives focus back to where it opened from: keep it on the grid.
        onFocus={(event) => {
          if (
            event.target !== scroller.current &&
            (event.target as HTMLElement).hasAttribute("data-cell")
          )
            scroller.current?.focus({ preventScroll: true });
        }}
        onKeyDown={onKeyDown}
        onCopy={onCopy}
        onCut={(event) => onCopy(event, true)}
        onPaste={onPaste}
        onPointerDown={onPointerDown}
        onClick={onClick}
        className="relative min-h-0 grow overflow-auto outline-none"
        style={maxHeight ? { maxHeight } : undefined}
      >
        <div
          ref={content}
          className="relative"
          style={{
            ...(widths as CSSProperties),
            height: geometry.totalHeight,
            width: "var(--grid-w)",
          }}
        >
          <PickAllHeader
            store={store}
            total={shape.total}
            columns={columns}
            frozenLefts={frozenLefts}
            spacerFor={spacerFor}
            onPickAll={(all) => void pickAll(all)}
            onResizeStart={onResizeStart}
            onHeaderPointerDown={onHeaderPointerDown}
          />
          <Body
            store={store}
            gridId={gridId}
            items={items}
            rowItems={rowItems}
            ariaIndex={aria.index}
            rows={result.rows}
            offset={result.offset}
            columns={columns}
            frozenLefts={frozenLefts}
            geometry={geometry}
            wrap={wrap}
            manual={manual || grouped}
            peekedId={ctx.peekedId}
            groupProperty={groupProperty}
            onAdd={async (group) => {
              const id = await ctx.createRow(group === undefined ? {} : { group });
              setPendingEdit(id);
            }}
          />
          {/* Keeps the footer's place after the body, so it sticks to the bottom only while the
              body is taller than the viewport. */}
          <div aria-hidden style={{ height: geometry.bodyHeight }} />
          <SummaryRow
            store={store}
            columns={columns}
            frozen={FROZEN}
            frozenLefts={frozenLefts}
            spacerFor={spacerFor}
          />
          <Overlay
            store={store}
            editorAnchor={editorAnchor}
            onFillStart={onFillStart}
            canFill={columns.some((c) => isEditableType(c.property.type))}
            peekedRows={peekedRows}
          />
        </div>
      </div>
      <CellEditor
        store={store}
        anchor={editorAnchor}
        height={rowHeight}
        columns={columns}
        rowAt={rowAt}
        onChange={writeValue}
        onClose={closeEditor}
      />
    </div>
  );
}

// The data window for the rendered items: the positions they show, a page either side.
function dataWindow(items: readonly TableItem[], viewport: Viewport, total: number) {
  let first = Number.POSITIVE_INFINITY;
  let last = 0;
  for (let i = viewport.rowStart; i < viewport.rowEnd; i++) {
    const item = items[i];
    if (item?.kind === "row") {
      first = Math.min(first, item.position);
      last = Math.max(last, item.position + 1);
    }
  }
  if (first === Number.POSITIVE_INFINITY) first = 0;
  return windowFor(first, Math.max(last, first + 1), total || undefined);
}

function sameGroups(a: ViewWindowGroups, b: ViewWindowGroups) {
  return (
    a.length === b.length &&
    a.every(
      (g, i) =>
        g.key === b[i]!.key &&
        g.subKey === b[i]!.subKey &&
        g.count === b[i]!.count &&
        g.start === b[i]!.start,
    )
  );
}

// ---- Parts that subscribe to one slice of the store

// The grip sits under the pointer, at the card's left.
const ghostTransform = (at: { x: number; y: number }) =>
  `translate(${at.x - 14}px, ${at.y - 16}px)`;

// The page being dragged, as a card under the pointer. On the body: an embed's editor or a
// scrolled table would clip it. Positioned by the drag itself (`ghost.style.transform`).
function RowGhost({
  store,
  rowAt,
  at,
  ghost,
}: {
  store: GridStore;
  rowAt: (row: number) => ViewRow | undefined;
  at: RefObject<{ x: number; y: number }>;
  ghost: RefObject<HTMLDivElement | null>;
}) {
  const row = useStoreSelector(store, (s) => (s.mode.kind === "rowDragging" ? s.mode.row : -1));
  if (row < 0) return null;
  const title = rowAt(row)?.title;
  return (
    <Portal container={document.body}>
      <div
        ref={ghost}
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 z-[100] flex h-8 max-w-72 items-center gap-1.5 rounded-lg bg-elevated pr-3 pl-1.5 text-sm font-medium text-gray-900 opacity-95 shadow-popover"
        style={{ transform: ghostTransform(at.current) }}
      >
        <DotsVerticalRegular aria-hidden className="size-3 shrink-0 rotate-90 text-gray-400" />
        <span className="truncate">{title || <span className="text-gray-400">Untitled</span>}</span>
      </div>
    </Portal>
  );
}

function PickedBar({ store, onSelectAll }: { store: GridStore; onSelectAll: () => void }) {
  const picked = useStoreSelector(store, (s) => s.rows.ids);
  if (picked.size === 0) return null;
  return (
    <BulkBar
      ids={picked}
      onClear={() => store.dispatch({ type: "setRows", ids: new Set(), anchor: null })}
      onSelectAll={onSelectAll}
    />
  );
}

function PickAllHeader({
  store,
  total,
  ...props
}: Omit<Parameters<typeof HeaderRow>[0], "allPicked" | "somePicked" | "frozen"> & {
  total: number;
}) {
  const count = useStoreSelector(store, (s) => s.rows.ids.size);
  return (
    <HeaderRow
      store={store}
      frozen={FROZEN}
      allPicked={count > 0 && count >= total}
      somePicked={count > 0}
      {...props}
    />
  );
}

type BodyProps = {
  store: GridStore;
  gridId: string;
  items: readonly TableItem[];
  rowItems: readonly RowItem[];
  ariaIndex: Int32Array;
  rows: readonly ViewRow[];
  offset: number;
  columns: readonly Column[];
  frozenLefts: readonly number[];
  geometry: Geometry;
  wrap: boolean;
  manual: boolean;
  peekedId: string | null;
  groupProperty: DatabaseProperty | undefined;
  onAdd: (group: GroupKey | undefined) => void;
};

// The rendered window of body items. Re-renders when the window moves or the data changes.
const Body = memo(function Body({
  store,
  gridId,
  items,
  ariaIndex,
  rows,
  offset,
  columns,
  frozenLefts,
  geometry,
  wrap,
  manual,
  peekedId,
  groupProperty,
  onAdd,
}: BodyProps) {
  const viewport = useStoreSelector(store, (s) => s.viewport);
  const spacer = spacerBefore(geometry, Math.max(viewport.colStart, FROZEN));
  const out = [];
  for (
    let itemIndex = viewport.rowStart;
    itemIndex < Math.min(viewport.rowEnd, items.length);
    itemIndex++
  ) {
    const item = items[itemIndex]!;
    const top = HEADER + itemIndex * geometry.rowHeight;
    if (item.kind !== "row") {
      out.push(
        <ExtraItem
          key={`${item.kind}:${item.kind === "group" ? JSON.stringify(item.group.key) : JSON.stringify(item.group ?? "all")}`}
          item={item}
          ariaIndex={ariaIndex[itemIndex]!}
          top={top}
          height={geometry.rowHeight}
          groupProperty={groupProperty}
          onAdd={onAdd}
        />,
      );
      continue;
    }
    const row = rows[item.position - offset];
    const index = geometry.itemToRow[itemIndex]!;
    out.push(
      <TableRow
        key={row ? `${row.id}:${JSON.stringify(item.group)}` : `p:${item.position}`}
        store={store}
        gridId={gridId}
        row={row}
        index={index}
        ariaIndex={ariaIndex[itemIndex]!}
        columns={columns}
        frozen={FROZEN}
        frozenLefts={frozenLefts}
        colStart={viewport.colStart}
        colEnd={viewport.colEnd}
        spacer={spacer}
        top={top}
        height={geometry.rowHeight}
        wrap={wrap}
        draggable={manual}
        peeked={row !== undefined && row.id === peekedId}
      />,
    );
  }
  return out;
});

// The one editor, over the active cell while editing (the shared PropertyEditor).
function CellEditor({
  store,
  anchor,
  height,
  columns,
  rowAt,
  onChange,
  onClose,
}: {
  store: GridStore;
  anchor: RefObject<HTMLDivElement | null>;
  height: number;
  columns: readonly Column[];
  rowAt: (row: number) => ViewRow | undefined;
  onChange: (row: ViewRow, property: DatabaseProperty, value: PropertyValue) => void;
  onClose: (reason: EditorCloseReason) => void;
}) {
  const mode = useStoreSelector(store, (s) => s.mode);
  if (mode.kind !== "editing") return null;
  const column = columns[mode.cell.col];
  const row = rowAt(mode.cell.row);
  if (!column || !row) return null;
  return (
    <AnchoredPopover
      anchor={anchor}
      label={`Edit ${column.property.name}`}
      onClose={() => onClose("commit")}
      cover={height}
      strong={column.property.type === "title"}
    >
      <PropertyEditor
        property={column.property}
        value={rowValue(column.property, row)}
        related={relatedRows(column.property, row)}
        rowId={row.id}
        {...(mode.initialText !== undefined ? { initialText: mode.initialText } : {})}
        onChange={(value) => onChange(row, column.property, value)}
        onClose={onClose}
      />
    </AnchoredPopover>
  );
}
