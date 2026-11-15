import {
  atTop,
  DocIcon,
  docIdOf,
  documentMenuItems,
  DRAG_TYPES,
  moveToTrash,
  runDocumentMenuAction,
  useActiveTab,
  useApp,
  useBackend,
  useContributions,
  useDocPrefetch,
  useOps,
  useTab,
} from "@lydie/plugin-api";
import type {
  ChildEntry,
  DocumentRef,
  DocumentTreeDropTarget,
  DocumentTreeProps,
  OpenGesture,
} from "@lydie/plugin-api";
import { VIEW_ICONS } from "@lydie/plugin-api/databases";
import {
  AddRegular,
  Button,
  CollapseArrow,
  ContextMenu,
  LoadingState,
  More1Regular,
  useHoverCard,
  WithTooltip,
} from "@lydie/plugin-api/ui";
import type { ContextMenuItem } from "@lydie/plugin-api/ui";
import { memo, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { DragEvent, KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from "react";

import { DocHoverCard } from "./DocHoverCard.tsx";
import { placements, rangeIds, topmost, withinAny } from "./selection.ts";
import { SyncingRows, useAwaitingFirstSync } from "./SyncingRows.tsx";
import { createTreeModel } from "./tree-model.ts";
import type { DocRow, TreeModel, TreeRow, ViewRow } from "./tree-model.ts";

// The slot of one row: v1's 30 px row and the 2 px between rows.
export const ROW_HEIGHT = 32;
// v1's indent: 8 px, and 8 px more per level.
const indentOf = (depth: number) => 8 + depth * 8;
const OVERSCAN = 12;
// How long a drag rests on a closed folder before it opens.
const HOVER_EXPAND_MS = 600;

type DropTarget = { id: string; where: "before" | "after" | "inside" } | { id: null; where: "end" };

function useTreeModel(props: DocumentTreeProps): TreeModel {
  const backend = useBackend();
  const app = useApp();
  const workspaceId = backend.info.workspaceId;
  const key = props.expandedKey ?? `document-tree:expanded:${workspaceId}`;
  const [model] = useState(() =>
    createTreeModel(
      backend,
      workspaceId,
      app.storage.get<string[]>(key) ?? [],
      (ids) => app.storage.set(key, ids),
      { ...(props.space ? { space: props.space } : {}), rootFilter: props.filterRoot ?? null },
    ),
  );
  useLayoutEffect(() => model.setRootFilter(props.filterRoot ?? null), [model, props.filterRoot]);
  return model;
}

// Drags carry the tree they started in as a type (types, unlike data, are readable on dragover).
const DRAG_KEY_PREFIX = "application/x-lydie-tree-";
const dragKeyType = (key: string) => `${DRAG_KEY_PREFIX}${key.toLowerCase()}`;
// A drag of several selected documents carries all their ids; `DRAG_TYPES.doc` stays the grabbed
// row, so a drop on a tab group opens that one.
const DRAG_IDS_TYPE = "application/x-lydie-doc-ids";

function draggedIds(transfer: Pick<DataTransfer, "getData">): string[] {
  const many = transfer.getData(DRAG_IDS_TYPE);
  if (many) {
    try {
      const ids: unknown = JSON.parse(many);
      if (Array.isArray(ids)) return ids.filter((id): id is string => typeof id === "string");
    } catch {
      // Not ours: fall back to the single id.
    }
  }
  const id = transfer.getData(DRAG_TYPES.doc);
  return id ? [id] : [];
}

// The drag image for several documents: a small count instead of the grabbed row alone.
function setDragBadge(transfer: DataTransfer, text: string) {
  const badge = document.createElement("div");
  badge.textContent = text;
  badge.className =
    "fixed -top-96 left-0 rounded-lg bg-elevated px-2.5 py-1 text-sm font-medium text-gray-900 shadow-popover";
  document.body.append(badge);
  try {
    transfer.setDragImage(badge, -10, -10);
  } catch {
    // Test DOMs leave it unimplemented; the browser's default image is fine there.
  }
  // The browser copies the image during dragstart.
  setTimeout(() => badge.remove(), 0);
}

const EMPTY: ReadonlySet<string> = new Set();

const isDoc = (row: TreeRow | undefined): row is DocRow => row?.kind === "doc";

const refOf = (doc: ChildEntry): DocumentRef => ({
  id: doc.id,
  title: doc.title,
  parentId: doc.parentId,
});

const DROP_LINE = "pointer-events-none absolute right-1 h-0.5 rounded-full bg-gray-950/40";

function scrollParentOf(el: HTMLElement): HTMLElement | null {
  const marked = el.parentElement?.closest<HTMLElement>("[data-scroll-root]");
  if (marked) return marked;
  for (let p = el.parentElement; p; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowY;
    if (overflow === "auto" || overflow === "scroll") return p;
  }
  return null;
}

// By arithmetic rather than the row element: a row out of view is not rendered.
function scrollRowIntoView(
  index: number,
  scroll: "self" | "parent",
  scroller: HTMLElement | null,
  tree: HTMLElement | null,
) {
  if (index < 0) return;
  if (scroll === "parent") {
    if (!tree) return;
    const parent = scrollParentOf(tree);
    const top = tree.getBoundingClientRect().top + index * ROW_HEIGHT;
    const view = parent?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
    const by =
      top < view.top
        ? top - view.top
        : top + ROW_HEIGHT > view.bottom
          ? top + ROW_HEIGHT - view.bottom
          : 0;
    if (by !== 0) (parent ?? window).scrollBy({ top: by });
    return;
  }
  if (!scroller) return;
  const top = index * ROW_HEIGHT;
  if (top < scroller.scrollTop) scroller.scrollTop = top;
  else if (top + ROW_HEIGHT > scroller.scrollTop + scroller.clientHeight) {
    scroller.scrollTop = top + ROW_HEIGHT - scroller.clientHeight;
  }
}

// The sidebar section: the whole workspace.
export function SidebarDocumentTree() {
  return <DocumentTree />;
}

export function DocumentTree(props: DocumentTreeProps) {
  const { label = "Documents", scroll = "self", dragKey = "", onForeignDrop } = props;
  const app = useApp();
  const ops = useOps();
  const backend = useBackend();
  const model = useTreeModel(props);
  const rows = useSyncExternalStore(model.subscribe, model.rows, model.rows);
  const loading = useSyncExternalStore(model.subscribe, model.loading, model.loading);
  const awaitingFirstSync = useAwaitingFirstSync();
  const activeTab = useActiveTab();
  const activeDocId = docIdOf(activeTab?.path);
  const menuItems = useContributions("documentMenu");
  const tabId = useTab()?.id ?? null;
  const historyScope = () => tabId ?? app.historyScope();

  const scroller = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const [menu, setMenu] = useState<{ doc: ChildEntry; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState<ReadonlySet<string>>(EMPTY);
  // Mod+click, Shift+click, Shift+arrows. Empty: actions apply to the row they start on.
  const [selected, setSelected] = useState<ReadonlySet<string>>(EMPTY);
  // Where Shift ranges start: the last row clicked, toggled or moved to without Shift.
  const anchor = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (scroll !== "self") return;
    const el = scroller.current;
    if (!el) return;
    setHeight(el.clientHeight || 600);
    const observer = new ResizeObserver(() => setHeight(el.clientHeight || 600));
    observer.observe(el);
    return () => observer.disconnect();
  }, [scroll]);

  // "parent": the window is the part of this tree inside the scrolling ancestor's viewport. It
  // moves when the ancestor scrolls or when something above this tree changes size.
  const hasRows = rows.length > 0;
  useLayoutEffect(() => {
    if (scroll !== "parent") return;
    const tree = treeRef.current;
    if (!tree) return;
    const parent = scrollParentOf(tree);
    const update = () => {
      const top = parent?.getBoundingClientRect().top ?? 0;
      setScrollTop(Math.max(0, top - tree.getBoundingClientRect().top));
      setHeight(parent?.clientHeight ?? window.innerHeight);
    };
    update();
    const target: HTMLElement | Window = parent ?? window;
    target.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    if (parent) {
      observer.observe(parent);
      for (const child of parent.children) observer.observe(child);
    }
    return () => {
      target.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [scroll, hasRows]);

  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((scrollTop + height) / ROW_HEIGHT) + OVERSCAN);
  const visible = rows.slice(first, last);
  const focusedIndex = focusedId ? rows.findIndex((r) => r.id === focusedId) : -1;
  // Only rows on screen count: a selected page inside a folder that was closed drops out.
  const selectedRows =
    selected.size > 0 ? rows.filter((r): r is DocRow => isDoc(r) && selected.has(r.id)) : [];
  const selecting = selectedRows.length > 0;

  // What an action on a row applies to: the whole selection when the row is part of it.
  const targetsOf = (doc: ChildEntry): { all: ChildEntry[]; top: ChildEntry[] } =>
    selectedRows.length > 1 && selected.has(doc.id)
      ? { all: selectedRows.map((r) => r.doc), top: topmost(rows, selected) }
      : { all: [doc], top: [doc] };

  const select = (ids: Iterable<string>) => setSelected(new Set(ids));
  const clearSelection = () => setSelected(EMPTY);
  // Mod+click starts from the row already open (or last clicked), as in Finder.
  const toggle = (id: string, seed: boolean) => {
    const base = selecting
      ? selectedRows.map((r) => r.doc.id)
      : [anchor.current ?? activeDocId].filter(
          (s): s is string => seed && s !== null && rows.some((r) => isDoc(r) && r.id === s),
        );
    select(base.includes(id) ? base.filter((s) => s !== id) : [...base, id]);
    anchor.current = id;
  };
  const extendTo = (id: string) => {
    const from = anchor.current ?? focusedId ?? activeDocId ?? id;
    anchor.current = from;
    select(rangeIds(rows, from, id));
  };

  const scrollToIndex = (index: number) =>
    scrollRowIntoView(index, scroll, scroller.current, treeRef.current);

  // The open document is always findable: its folders open and its row scrolls into view, once
  // per change of document (collapsing a folder above it afterwards sticks).
  const revealing = useRef<string | null>(null);
  useEffect(() => {
    if (!activeDocId || loading) return;
    let current = true;
    // A page inside a collection is not listed: the collection's row stands for it.
    void model.reveal(activeDocId).then((found) => {
      if (!current || !found) return;
      setFocusedId(found);
      const index = model.rows().findIndex((r) => r.id === found);
      if (index === -1) revealing.current = found;
      else scrollRowIntoView(index, scroll, scroller.current, treeRef.current);
    });
    return () => {
      current = false;
    };
  }, [model, activeDocId, loading, scroll]);
  useLayoutEffect(() => {
    if (!revealing.current) return;
    const index = rows.findIndex((r) => r.id === revealing.current);
    if (index === -1) return;
    revealing.current = null;
    scrollRowIntoView(index, scroll, scroller.current, treeRef.current);
  }, [rows, scroll]);

  // A drag resting on a closed folder opens it, so a page can be dropped among its children.
  const hoverExpand = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const cancelHoverExpand = () => {
    if (hoverExpand.current) clearTimeout(hoverExpand.current.timer);
    hoverExpand.current = null;
  };
  // Not a collection: opened, it shows views, which take no drops.
  const expandOnHover = (row: DocRow, target: DropTarget) => {
    if (target.where !== "inside" || row.expanded || !row.expandable || row.collection) {
      cancelHoverExpand();
      return;
    }
    if (hoverExpand.current?.id === row.doc.id) return;
    cancelHoverExpand();
    const id = row.doc.id;
    hoverExpand.current = {
      id,
      timer: setTimeout(() => {
        hoverExpand.current = null;
        model.setExpanded(id, true);
      }, HOVER_EXPAND_MS),
    };
  };
  useEffect(() => cancelHoverExpand, []);

  // No hover cards while the tree is busy with something else.
  const busy = menu !== null || renamingId !== null || drop !== null;

  const open = (doc: ChildEntry, event?: OpenGesture) => {
    app.openDoc(doc.id, { mode: event ? app.modeFor(event) : "replace" });
  };

  // Through the collections plugin, which knows where its page keeps the open view; without it,
  // the collection's page.
  const openView = (row: ViewRow, event?: OpenGesture) => {
    const mode = event ? app.modeFor(event) : "replace";
    const databaseId = row.collection.id;
    app
      .runCommand("databases.openView", { databaseId, viewId: row.view.id, mode })
      .catch(() => app.openDoc(databaseId, { mode }));
  };

  // Opening a folder after adding or dropping a page into it. A collection lists views, not the page.
  const expandToShow = (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (!isDoc(row) || !row.collection) model.setExpanded(id, true);
  };

  // Mod+click selects instead of opening a tab (Mod+Shift+click and middle-click still do), and
  // Shift+click selects a range.
  const press = (row: DocRow, event: MouseEvent) => {
    setFocusedId(row.doc.id);
    const mod = app.modeFor(event) === "tab" && event.button === 0;
    if (event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
      extendTo(row.doc.id);
    } else if (mod && !event.shiftKey) {
      toggle(row.doc.id, true);
    } else {
      anchor.current = row.doc.id;
      clearSelection();
      open(row.doc, event);
    }
  };

  // Changes paint before they are written; when one fails it is rolled back on screen, and said.
  const failed = (what: string) => (error: unknown) =>
    app.notify({
      title: `Could not ${what}`,
      description: error instanceof Error ? error.message : String(error),
      kind: "error",
    });

  const createIn = (parentId: string | null) =>
    createInRaw(parentId).catch(failed("create the page"));
  const createInRaw = async (parentId: string | null) => {
    const workspaceId = backend.info.workspaceId;
    const doc = await ops.doc.create({
      ...(parentId === null ? props.createInput : undefined),
      workspaceId,
      parentId,
      title: "Untitled",
      ...(await atTop(backend, workspaceId, parentId)),
    });
    if (parentId) expandToShow(parentId);
    app.openDoc(doc.id, { state: { focusTitle: true } });
  };

  // Several documents go in one transaction, so one undo brings them all back. Asks first when one
  // of them has content.
  const remove = async ({ all, top }: { all: ChildEntry[]; top: ChildEntry[] }) => {
    if (await moveToTrash(app, top, { total: all.length, scope: historyScope() })) clearSelection();
  };

  const rename = async (doc: ChildEntry, title: string) => {
    setRenamingId(null);
    const next = title.trim();
    if (next && next !== doc.title)
      await ops.doc.rename({ id: doc.id, title: next }).catch(failed("rename it"));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (renamingId) return;
    const index = focusedIndex === -1 ? 0 : focusedIndex;
    const row = rows[index];
    // With Shift the selection runs from the anchor to the new row; without, it is dropped.
    const move = (to: number, extend = false) => {
      const target = rows[Math.max(0, Math.min(rows.length - 1, to))];
      if (!target) return;
      setFocusedId(target.id);
      scrollToIndex(rows.indexOf(target));
      if (extend) extendTo(target.id);
      else {
        anchor.current = target.id;
        clearSelection();
      }
    };
    const mod = event.metaKey || event.ctrlKey;
    switch (event.key) {
      case "ArrowDown":
        move(focusedIndex === -1 ? 0 : index + 1, event.shiftKey);
        break;
      case "ArrowUp":
        move(index - 1, event.shiftKey);
        break;
      case "Home":
        move(0, event.shiftKey);
        break;
      case "End":
        move(rows.length - 1, event.shiftKey);
        break;
      case " ":
        if (isDoc(row)) toggle(row.doc.id, false);
        break;
      case "a":
        if (!mod || event.shiftKey || event.altKey) return;
        select(rows.filter(isDoc).map((r) => r.id));
        break;
      case "Escape":
        if (!selecting) return;
        clearSelection();
        break;
      case "ArrowRight":
        if (!isDoc(row)) return;
        if (row.expandable && !row.expanded) model.setExpanded(row.doc.id, true);
        else if (row.expanded) move(index + 1);
        break;
      case "ArrowLeft": {
        if (!row) return;
        if (isDoc(row) && row.expanded) model.setExpanded(row.doc.id, false);
        else {
          const parent = rows.findLastIndex((r, i) => i < index && r.depth < row.depth);
          if (parent !== -1) move(parent);
        }
        break;
      }
      case "Enter":
        if (isDoc(row)) open(row.doc, event);
        else if (row) openView(row, event);
        break;
      case "F2":
        if (isDoc(row)) setRenamingId(row.doc.id);
        break;
      case "Delete":
      case "Backspace":
        if (isDoc(row) && (event.key === "Delete" || event.metaKey))
          void remove(targetsOf(row.doc));
        else return;
        break;
      case "F10":
      case "ContextMenu": {
        if (!isDoc(row) || (event.key === "F10" && !event.shiftKey)) return;
        const el = document.getElementById(`tree-row-${row.doc.id}`);
        const rect = el?.getBoundingClientRect();
        openMenu(row.doc, rect?.left ?? 0, rect?.bottom ?? 0);
        break;
      }
      default:
        return;
    }
    event.preventDefault();
  };

  const dropTargetFor = (event: DragEvent<HTMLElement>, row: DocRow): DropTarget => {
    const rect = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - rect.top;
    if (y < rect.height * 0.25) return { id: row.doc.id, where: "before" };
    if (y > rect.height * 0.75 && !row.expanded) return { id: row.doc.id, where: "after" };
    return { id: row.doc.id, where: "inside" };
  };

  // Where a drop lands, as `doc.move` placement.
  const placementOf = (target: DropTarget): DocumentTreeDropTarget | null => {
    if (target.id === null) return { parentId: null };
    const row = rows.find((r) => r.id === target.id);
    if (!isDoc(row)) return null;
    if (target.where === "inside") return { parentId: row.doc.id };
    return {
      parentId: row.doc.parentId,
      ...(target.where === "before" ? { beforeId: row.doc.id } : { afterId: row.doc.id }),
    };
  };

  // Whether a drag can be dropped here: a page from this tree, or from another with a handler.
  const accepts = (types: readonly string[]) => {
    if (!types.includes(DRAG_TYPES.doc)) return false;
    const from = types.find((t) => t.startsWith(DRAG_KEY_PREFIX));
    return !from || from === dragKeyType(dragKey) || Boolean(onForeignDrop);
  };

  const startDrag = (row: DocRow, event: DragEvent<HTMLElement>) => {
    const { all, top } = targetsOf(row.doc);
    const transfer = event.dataTransfer;
    transfer.setData(DRAG_TYPES.doc, row.doc.id);
    if (top.length > 1) transfer.setData(DRAG_IDS_TYPE, JSON.stringify(top.map((d) => d.id)));
    transfer.setData(dragKeyType(dragKey), "");
    transfer.setData("text/plain", all.map((d) => d.title || "Untitled").join("\n"));
    transfer.effectAllowed = "move";
    if (all.length > 1) setDragBadge(transfer, `${all.length} documents`);
    setDragging(new Set(all.map((d) => d.id)));
  };

  const onDrop = async (target: DropTarget, ids: readonly string[], types: readonly string[]) => {
    setDrop(null);
    setDragging(EMPTY);
    cancelHoverExpand();
    if (ids.length === 0) return;
    // Not onto (or into) a document being moved.
    if (target.id !== null && withinAny(rows, target.id, ids)) return;
    const placement = placementOf(target);
    if (!placement) return;
    const steps = placements(ids, placement);
    const from = types.find((t) => t.startsWith(DRAG_KEY_PREFIX));
    const foreign = Boolean(from) && from !== dragKeyType(dragKey);
    try {
      if (foreign) {
        if (!onForeignDrop) return;
        for (const step of steps) await onForeignDrop(step.id, step.placement);
      } else if (steps.length === 1 && steps[0]) {
        await ops.doc.move({ id: steps[0].id, ...steps[0].placement });
      } else {
        await backend.transaction(
          `Move ${steps.length} documents`,
          async (tx) => {
            for (const step of steps) await tx.doc.move({ id: step.id, ...step.placement });
          },
          { scope: historyScope() },
        );
      }
      if (target.id !== null && target.where === "inside") expandToShow(target.id);
    } catch (error) {
      app.notify({ title: "Could not move", description: (error as Error).message, kind: "error" });
    }
  };

  // A menu on a row outside the selection is about that row alone, so the selection goes.
  const openMenu = (doc: ChildEntry, x: number, y: number) => {
    if (!selected.has(doc.id)) clearSelection();
    setMenu({ doc, x, y });
  };

  const contextItems = (doc: ChildEntry): ContextMenuItem[] => {
    const { all } = targetsOf(doc);
    if (all.length > 1) {
      return [
        { id: "open-tab", label: `Open ${all.length} in new tabs` },
        { type: "separator", id: "s2" },
        { id: "delete", label: `Move ${all.length} documents to trash`, danger: true },
      ];
    }
    return documentMenuItems(refOf(doc), menuItems);
  };

  const onMenuAction = (doc: ChildEntry, action: string) => {
    const targets = targetsOf(doc);
    const builtIn = runDocumentMenuAction(action, refOf(doc), menuItems, app);
    if (builtIn === "open-tab") {
      // The first comes to the front, the rest open behind it.
      targets.all.forEach((d, i) => app.openDoc(d.id, { mode: i === 0 ? "tab" : "background" }));
    } else if (builtIn === "open-split") app.openDoc(doc.id, { mode: "split" });
    else if (builtIn === "new-child") void createIn(doc.id);
    else if (builtIn === "rename") setRenamingId(doc.id);
    else if (builtIn === "delete") void remove(targets);
  };

  const endDrop = {
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!accepts(event.dataTransfer.types)) return;
      if (event.target === event.currentTarget || rows.length === 0) {
        event.preventDefault();
        setDrop({ id: null, where: "end" });
      }
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      setDrop(null);
      cancelHoverExpand();
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      const ids = draggedIds(event.dataTransfer);
      if (ids.length > 0 && (event.target === event.currentTarget || rows.length === 0)) {
        event.preventDefault();
        void onDrop({ id: null, where: "end" }, ids, [...event.dataTransfer.types]);
      }
    },
  };

  if (rows.length === 0 && awaitingFirstSync) {
    return <SyncingRows padded={scroll === "self"} />;
  }
  if (loading && rows.length === 0 && !props.emptyState) {
    return <LoadingState label="Loading documents" />;
  }
  if (rows.length === 0 && props.emptyState) {
    return (
      <div
        role="tree"
        aria-label={label}
        data-testid="document-tree"
        className={`rounded-lg transition-colors ${drop?.id === null ? "bg-gray-950/5 ring-1 ring-gray-950/10 ring-inset" : ""}`}
        {...endDrop}
      >
        {props.emptyState}
      </div>
    );
  }
  if (rows.length === 0) {
    // v1's empty tree: a dashed box with one action.
    return (
      <div className={scroll === "self" ? "px-2" : ""}>
        <div className="flex flex-col items-start gap-y-2 rounded-md border border-dashed border-gray-950/10 bg-gray-950/2 p-3">
          <p className="text-xs text-gray-500">Seems empty here.</p>
          <Button
            size="sm"
            variant="secondary"
            onPress={() =>
              // The sidebar's own command, so the "New documents" setting decides where it goes.
              void (props.createInput ? createIn(null) : app.runCommand("core.newDocument"))
            }
          >
            New document
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scroller}
      className={
        scroll === "self"
          ? "min-h-0 flex-1 scroll-fade overflow-y-auto px-2"
          : "pb-2" /* end drop zone */
      }
      onScroll={
        scroll === "self" ? (event) => setScrollTop(event.currentTarget.scrollTop) : undefined
      }
      {...endDrop}
    >
      <div
        ref={treeRef}
        role="tree"
        aria-label={label}
        aria-multiselectable
        tabIndex={0}
        aria-activedescendant={focusedId ? `tree-row-${focusedId}` : undefined}
        onKeyDown={onKeyDown}
        // Also when the drag ends elsewhere (another tree, a tab group) or is cancelled.
        onDragEnd={() => setDragging(EMPTY)}
        onFocus={() => {
          if (rows[0] && !rows.some((r) => r.id === focusedId))
            setFocusedId(
              activeDocId && rows.some((r) => r.id === activeDocId) ? activeDocId : rows[0].id,
            );
        }}
        className="group/tree relative outline-none"
        style={{ height: rows.length * ROW_HEIGHT }}
        data-testid="document-tree"
      >
        {visible.map((row, i) =>
          row.kind === "view" ? (
            <ViewItem
              key={row.id}
              row={row}
              top={(first + i) * ROW_HEIGHT}
              focused={row.id === focusedId}
              onOpen={(event) => {
                setFocusedId(row.id);
                anchor.current = row.id;
                clearSelection();
                openView(row, event);
              }}
            />
          ) : (
            <TreeItem
              key={row.doc.id}
              row={row}
              top={(first + i) * ROW_HEIGHT}
              active={row.doc.id === activeDocId}
              selected={selecting ? selected.has(row.doc.id) : row.doc.id === activeDocId}
              highlighted={selecting && selected.has(row.doc.id)}
              focused={row.doc.id === focusedId}
              renaming={row.doc.id === renamingId}
              menuOpen={menu?.doc.id === row.doc.id}
              dimmed={dragging.has(row.doc.id)}
              drop={drop && drop.id === row.doc.id ? drop.where : null}
              onToggle={() => model.setExpanded(row.doc.id, !row.expanded)}
              onPress={(event) => press(row, event)}
              onOpen={(event) => {
                setFocusedId(row.doc.id);
                open(row.doc, event);
              }}
              onRename={(title) => void rename(row.doc, title)}
              onCancelRename={() => setRenamingId(null)}
              onAddChild={() => void createIn(row.doc.id)}
              onMenu={(x, y) => openMenu(row.doc, x, y)}
              onDragStartRow={(event) => startDrag(row, event)}
              busy={busy}
              onDragOverRow={(event) => {
                if (!accepts(event.dataTransfer.types)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const target = dropTargetFor(event, row);
                expandOnHover(row, target);
                if (!drop || drop.id !== target.id || drop.where !== target.where) setDrop(target);
              }}
              onDropRow={(event) => {
                const ids = draggedIds(event.dataTransfer);
                if (ids.length === 0) return;
                event.preventDefault();
                event.stopPropagation();
                void onDrop(dropTargetFor(event, row), ids, [...event.dataTransfer.types]);
              }}
            />
          ),
        )}
        {drop?.id === null && (
          <div
            className={DROP_LINE}
            style={{ top: rows.length * ROW_HEIGHT - 1, left: indentOf(0) }}
          />
        )}
      </div>
      <ContextMenu
        label="Document actions"
        position={menu ? { x: menu.x, y: menu.y } : null}
        items={menu ? contextItems(menu.doc) : []}
        onAction={(action) => menu && onMenuAction(menu.doc, action)}
        onClose={() => setMenu(null)}
      />
    </div>
  );
}

type ItemProps = {
  row: DocRow;
  top: number;
  active: boolean;
  // aria-selected: the selection while there is one, else the open document.
  selected: boolean;
  // Part of a multiple selection (drawn as such).
  highlighted: boolean;
  focused: boolean;
  renaming: boolean;
  // Its context menu is open: the caret and the actions stay shown.
  menuOpen: boolean;
  // Being dragged.
  dimmed: boolean;
  drop: "before" | "after" | "inside" | "end" | null;
  onToggle: () => void;
  onPress: (event: MouseEvent) => void;
  onOpen: (event: MouseEvent) => void;
  onRename: (title: string) => void;
  onCancelRename: () => void;
  onAddChild: () => void;
  onMenu: (x: number, y: number) => void;
  onDragStartRow: (event: DragEvent<HTMLDivElement>) => void;
  busy: boolean;
  onDragOverRow: (event: DragEvent<HTMLDivElement>) => void;
  onDropRow: (event: DragEvent<HTMLDivElement>) => void;
};

const TreeItem = memo(function TreeItem({
  row,
  top,
  active,
  selected,
  highlighted,
  focused,
  renaming,
  menuOpen,
  dimmed,
  drop,
  onToggle,
  onPress,
  onOpen,
  onRename,
  onCancelRename,
  onAddChild,
  onMenu,
  onDragStartRow,
  busy,
  onDragOverRow,
  onDropRow,
}: ItemProps) {
  const { doc, depth, expanded } = row;
  const hasChildren = row.expandable;
  const indent = indentOf(depth);
  // A press (click, drag, context menu) puts the card away until the pointer comes back.
  // Twice the default rest: the pointer crosses the tree all the time on its way to something else.
  // None for the open document: its card would repeat what is on screen.
  const hover = useHoverCard<HTMLDivElement>({
    delay: 1500,
    isDisabled: busy || renaming || active,
  });
  const prefetch = useDocPrefetch(active ? null : doc.id);
  // The row's buttons have tooltips: no card while the pointer is on one, and the rest before the
  // card starts over when it comes back onto the row.
  const overControl = {
    onPointerEnter: hover.pause,
    onPointerLeave: (event: PointerEvent<HTMLElement>) => {
      const to = event.relatedTarget;
      if (to instanceof Node && hover.triggerRef.current?.contains(to)) hover.resume();
    },
  };
  // The tree owns focus (aria-activedescendant) and handles the keys; rows take pointer input only.
  // The card is the row's sibling, not its child, so events inside it do not reach the row.
  return (
    <>
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus */}
      <div
        {...hover.triggerProps}
        {...prefetch}
        id={`tree-row-${doc.id}`}
        role="treeitem"
        aria-level={depth + 1}
        aria-expanded={hasChildren ? expanded : undefined}
        aria-selected={selected}
        data-testid="tree-row"
        data-doc-id={doc.id}
        data-dragging={dimmed || undefined}
        draggable={!renaming}
        onDragStart={onDragStartRow}
        onDragOver={onDragOverRow}
        onDrop={onDropRow}
        onClick={(event) => {
          if (!renaming) onPress(event);
        }}
        onAuxClick={(event) => {
          if (event.button === 1) onOpen(event);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          onMenu(event.clientX, event.clientY);
        }}
        className={[
          // `isolate` keeps the background layer below the contents and above the sidebar.
          "group isolate absolute inset-x-0 flex cursor-default items-center gap-1 pr-1 text-sm font-medium select-none",
          drop === "inside" || highlighted || active ? "text-gray-900" : "text-gray-600",
          dimmed ? "opacity-50" : "",
        ].join(" ")}
        style={{ top, height: ROW_HEIGHT, paddingLeft: indent }}
      >
        {/* v1's 30 px row inside the 32 px slot: the gap between rows still takes drags. */}
        <span
          aria-hidden
          className={[
            "pointer-events-none absolute inset-x-0 inset-y-px -z-10 rounded-lg",
            drop === "inside"
              ? "bg-gray-950/8 ring-1 ring-gray-950/15 ring-inset"
              : highlighted
                ? "bg-gray-950/8"
                : active
                  ? "bg-gray-950/5"
                  : menuOpen
                    ? "bg-gray-950/3"
                    : "group-hover:bg-gray-950/3",
            // Only while the tree has keyboard focus: a click already shows as the active row.
            focused
              ? "outline-solid outline-0 -outline-offset-2 outline-blue-600 group-focus-visible/tree:outline-2"
              : "",
          ].join(" ")}
        />
        {/* The line starts at the row's indent, so it shows the level a drop lands on. */}
        {drop === "before" && <div className={DROP_LINE} style={{ top: -1, left: indent }} />}
        {drop === "after" && <div className={DROP_LINE} style={{ bottom: -1, left: indent }} />}
        {hasChildren ? (
          // As in v1 (and Notion): the icon is the toggle, and turns into the caret on hover.
          <WithTooltip label={expanded ? "Collapse" : "Expand"} placement="top" offset={8}>
            <button
              type="button"
              tabIndex={-1}
              aria-label={expanded ? "Collapse" : "Expand"}
              {...overControl}
              onClick={(event) => {
                event.stopPropagation();
                onToggle();
              }}
              className="relative -ml-1 flex size-5 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-950/5"
            >
              <DocIcon
                id={doc.id}
                properties={doc.properties}
                hasChildren
                className={`size-4 ${menuOpen ? "opacity-0" : `group-hover:opacity-0 pointer-coarse:opacity-0 ${focused ? "group-focus-visible/tree:opacity-0" : ""}`}`}
              />
              <CollapseArrow
                className={[
                  "absolute size-3 text-gray-500 transition-[rotate] duration-200",
                  expanded ? "rotate-90" : "",
                  menuOpen
                    ? "opacity-100"
                    : `opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 ${focused ? "group-focus-visible/tree:opacity-100" : ""}`,
                ].join(" ")}
              />
            </button>
          </WithTooltip>
        ) : (
          <span className="-ml-1 flex size-5 shrink-0 items-center justify-center text-gray-500">
            <DocIcon id={doc.id} properties={doc.properties} className="size-4" />
          </span>
        )}
        {renaming ? (
          <RenameInput initial={doc.title} onCommit={onRename} onCancel={onCancelRename} />
        ) : (
          <span className="min-w-0 grow truncate">{doc.title || "Untitled"}</span>
        )}
        {/* Out of the layout until shown, so titles use the full width. Kept while the row's menu
            is open, as in v1. */}
        {!renaming && (
          <span
            {...overControl}
            className={`shrink-0 gap-px ${menuOpen ? "flex" : `hidden group-hover:flex pointer-coarse:flex ${focused ? "group-focus-visible/tree:flex" : ""}`}`}
          >
            <RowAction
              label={`New document inside ${doc.title || "Untitled"}`}
              tooltip="Add page inside"
              onPress={onAddChild}
            >
              <AddRegular className="size-3.5" />
            </RowAction>
            <RowAction
              label={`More actions for ${doc.title || "Untitled"}`}
              tooltip="Document options"
              onPress={(x, y) => onMenu(x, y)}
            >
              <More1Regular className="size-4" />
            </RowAction>
          </span>
        )}
      </div>
      <DocHoverCard doc={doc} hover={hover} />
    </>
  );
});

// One of a collection's views: opens the collection on it. Not a document, so no selection, menu,
// drag or drop.
const ViewItem = memo(function ViewItem({
  row,
  top,
  focused,
  onOpen,
}: {
  row: ViewRow;
  top: number;
  focused: boolean;
  onOpen: (event: MouseEvent) => void;
}) {
  const ViewIcon = VIEW_ICONS[row.view.type];
  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
    <div
      id={`tree-row-${row.id}`}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={false}
      data-testid="tree-view-row"
      data-view-id={row.view.id}
      onClick={onOpen}
      onAuxClick={(event) => {
        if (event.button === 1) onOpen(event);
      }}
      onContextMenu={(event) => event.preventDefault()}
      className="group isolate absolute inset-x-0 flex cursor-default items-center gap-1 pr-1 text-sm font-medium text-gray-600 select-none"
      style={{ top, height: ROW_HEIGHT, paddingLeft: indentOf(row.depth) }}
    >
      <span
        aria-hidden
        className={[
          "pointer-events-none absolute inset-x-0 inset-y-px -z-10 rounded-lg group-hover:bg-gray-950/3",
          focused
            ? "outline-solid outline-0 -outline-offset-2 outline-blue-600 group-focus-visible/tree:outline-2"
            : "",
        ].join(" ")}
      />
      <span className="-ml-1 flex size-5 shrink-0 items-center justify-center text-gray-500">
        <ViewIcon aria-hidden className="size-4" />
      </span>
      <span className="min-w-0 grow truncate">{row.view.name}</span>
    </div>
  );
});

// A hover action on a row (v1's): a tooltip after a rest, and out of the tab order, since the tree
// handles the keys. The menu opens under the button.
function RowAction({
  label,
  tooltip,
  onPress,
  children,
}: {
  label: string;
  tooltip: string;
  onPress: (x: number, y: number) => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      excludeFromTabOrder
      aria-label={label}
      tooltip={tooltip}
      tooltipOptions={{ placement: "top", offset: 8 }}
      onPress={(event) => {
        const rect = (event.target as HTMLElement).getBoundingClientRect();
        onPress(rect.left, rect.bottom);
      }}
      className="rounded-md text-gray-500 hover:bg-gray-950/5 hover:text-gray-700 pressed:bg-gray-950/8"
    >
      {children}
    </Button>
  );
}

function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (title: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  return (
    <input
      aria-label="Document title"
      // oxlint-disable-next-line jsx-a11y/no-autofocus -- inline rename starts typing at once
      autoFocus
      value={value}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          done.current = true;
          onCommit(value);
        } else if (event.key === "Escape") {
          done.current = true;
          onCancel();
        }
      }}
      onBlur={() => {
        if (!done.current) onCommit(value);
      }}
      // A plain input, not the shared Input: it sits inside a 30 px tree row in place of the
      // title, so it is shorter and tighter, with the focused field's ring.
      className="h-6 min-w-0 grow rounded-md bg-surface px-1 text-sm ring ring-gray-950/20 outline-none"
    />
  );
}
