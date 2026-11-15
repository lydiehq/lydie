import type { Backend, ChildEntry, DocumentTreeSpace, LiveHandle } from "@lydie/plugin-api";
import type { DatabaseView } from "@lydie/plugin-api/databases";

// A page. `expandable`: it has pages inside, or it is a collection (which opens to its views).
export type DocRow = {
  kind: "doc";
  id: string;
  doc: ChildEntry;
  depth: number;
  expanded: boolean;
  expandable: boolean;
  collection: boolean;
};
// One of a collection's views, under the collection in place of its pages.
export type ViewRow = {
  kind: "view";
  id: string;
  view: Pick<DatabaseView, "id" | "name" | "type">;
  collection: ChildEntry;
  depth: number;
};
export type TreeRow = DocRow | ViewRow;

export const viewRowId = (viewId: string) => `view:${viewId}`;

// The sidebar tree as a flat list of visible rows. Each expanded folder (and the top level) is
// one live `doc.children` query, so collapsed folders cost nothing and the full tree is never
// read. A collection's pages are reached through its views, so an expanded collection watches
// its definition (`database.get`) and lists its views instead. Rows keep identity while their
// document and state are unchanged.
export type TreeModel = {
  rows: () => readonly TreeRow[];
  loading: () => boolean;
  subscribe: (listener: () => void) => () => void;
  isExpanded: (id: string) => boolean;
  setExpanded: (id: string, expanded: boolean) => void;
  collapseAll: () => void;
  // Expands the folders above a document when it lives in this tree, and returns the id of the
  // row that stands for it: its own, or the outermost collection it is in. Null when it is not
  // in this tree.
  reveal: (id: string) => Promise<string | null>;
  expandedIds: () => readonly string[];
  // Narrows the top level (applied on the next recompute).
  setRootFilter: (filter: ((doc: ChildEntry) => boolean) | null) => void;
  dispose: () => void;
};

export type TreeModelOptions = {
  // One hosted space: its top-level pages only (subpages follow their parent).
  space?: DocumentTreeSpace;
  rootFilter?: ((doc: ChildEntry) => boolean) | null;
};

// The trees on screen, for "Collapse all documents".
const mounted = new Set<TreeModel>();

export function collapseAllTrees() {
  for (const model of mounted) model.collapseAll();
}

type Level =
  | { kind: "children"; handle: LiveHandle<ChildEntry>; off: () => void }
  | {
      kind: "views";
      handle: LiveHandle<{ views: readonly DatabaseView[] }>;
      off: () => void;
    };

const NO_COLLECTIONS: ReadonlySet<string> = new Set();

export function createTreeModel(
  backend: Backend,
  workspaceId: string,
  initialExpanded: readonly string[],
  onExpandedChange: (ids: readonly string[]) => void,
  options: TreeModelOptions = {},
): TreeModel {
  let rootFilter = options.rootFilter ?? null;
  const expanded = new Set(initialExpanded);
  const levels = new Map<string | null, Level>();
  const listeners = new Set<() => void>();
  let rows: readonly TreeRow[] = [];
  let rowCache = new Map<string, TreeRow>();
  let scheduled = false;
  let wasLoading = true;
  let collectionsHandle: LiveHandle<{ id: string }> | null = null;
  let offCollections: (() => void) | null = null;
  let collections = NO_COLLECTIONS;
  let collectionsData: readonly { id: string }[] | null = null;

  // Which pages are collections is known once `database.list` has answered; until then the
  // tree waits rather than list a collection's pages for a moment.
  const collectionsLoading = () => collectionsHandle?.getSnapshot().isLoading ?? true;
  const isLoading = () =>
    collectionsLoading() || (levels.get(null)?.handle.getSnapshot().isLoading ?? true);

  const recompute = () => {
    scheduled = false;
    const next: TreeRow[] = [];
    const nextCache = new Map<string, TreeRow>();
    const keep = <R extends TreeRow>(row: R, same: (cached: R) => boolean): R => {
      const cached = rowCache.get(row.id) as R | undefined;
      const out = cached && cached.kind === row.kind && same(cached) ? cached : row;
      next.push(out);
      nextCache.set(out.id, out);
      return out;
    };
    const walk = (parentId: string | null, depth: number) => {
      const level = levels.get(parentId);
      if (level?.kind !== "children") return;
      for (const doc of level.handle.getSnapshot().data) {
        if (parentId === null && rootFilter && !rootFilter(doc)) continue;
        const collection = collections.has(doc.id);
        const expandable = collection || doc.childCount > 0;
        const open = expanded.has(doc.id) && expandable;
        keep<DocRow>(
          { kind: "doc", id: doc.id, doc, depth, expanded: open, expandable, collection },
          (c) =>
            c.doc === doc &&
            c.depth === depth &&
            c.expanded === open &&
            c.expandable === expandable &&
            c.collection === collection,
        );
        if (!open) continue;
        if (collection) views(doc, depth + 1);
        else walk(doc.id, depth + 1);
      }
    };
    const views = (collection: ChildEntry, depth: number) => {
      const level = levels.get(collection.id);
      if (level?.kind !== "views") return;
      for (const view of level.handle.getSnapshot().data[0]?.views ?? []) {
        keep<ViewRow>(
          { kind: "view", id: viewRowId(view.id), view, collection, depth },
          (c) =>
            c.collection === collection &&
            c.depth === depth &&
            c.view.name === view.name &&
            c.view.type === view.type,
        );
      }
    };
    if (!collectionsLoading()) walk(null, 0);
    rowCache = nextCache;
    const same = next.length === rows.length && next.every((r, i) => r === rows[i]);
    const loading = isLoading();
    if (!same || loading !== wasLoading) {
      wasLoading = loading;
      if (!same) rows = next;
      for (const listener of [...listeners]) listener();
    }
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(recompute);
  };

  let started = false;
  const watch = (parentId: string | null) => {
    if (!started) return;
    // A folder's level waits until it is known whether it is a collection.
    if (parentId !== null && collectionsLoading()) return;
    const kind = parentId !== null && collections.has(parentId) ? "views" : "children";
    const current = levels.get(parentId);
    if (current?.kind === kind) return;
    if (current) current.off();
    if (kind === "views" && parentId !== null) {
      const handle = backend.live("database.get", { id: parentId });
      levels.set(parentId, { kind, handle, off: handle.subscribe(schedule) });
    } else {
      const handle = backend.live("doc.children", {
        workspaceId,
        parentId,
        ...(parentId === null ? options.space : undefined),
      });
      levels.set(parentId, { kind: "children", handle, off: handle.subscribe(schedule) });
    }
  };
  const unwatch = (parentId: string) => {
    const level = levels.get(parentId);
    if (!level) return;
    level.off();
    levels.delete(parentId);
  };

  // A page turned into a collection (or back) swaps what its open level watches.
  const onCollections = () => {
    const snapshot = collectionsHandle?.getSnapshot();
    if (snapshot && !snapshot.isLoading && snapshot.data !== collectionsData) {
      collectionsData = snapshot.data;
      collections = new Set(snapshot.data.map((d) => d.id));
      for (const id of expanded) watch(id);
    }
    schedule();
  };

  // Queries run while someone is subscribed (React StrictMode subscribes, unsubscribes and
  // subscribes again; the backend keeps results warm in between).
  const start = () => {
    started = true;
    collectionsHandle = backend.live("database.list", { workspaceId });
    offCollections = collectionsHandle.subscribe(onCollections);
    watch(null);
    onCollections();
  };
  const stop = () => {
    started = false;
    offCollections?.();
    offCollections = null;
    collectionsHandle = null;
    collectionsData = null;
    for (const level of levels.values()) level.off();
    levels.clear();
  };

  const setExpanded = (id: string, open: boolean) => {
    if (open === expanded.has(id)) return;
    if (open) {
      expanded.add(id);
      watch(id);
    } else {
      expanded.delete(id);
      unwatch(id);
    }
    onExpandedChange([...expanded]);
    schedule();
  };

  const collapseAll = () => {
    if (expanded.size === 0) return;
    for (const id of expanded) unwatch(id);
    expanded.clear();
    onExpandedChange([]);
    schedule();
  };

  const inTopLevel = (id: string) => {
    const level = levels.get(null);
    if (level?.kind !== "children") return false;
    return level.handle
      .getSnapshot()
      .data.some((doc) => doc.id === id && (!rootFilter || rootFilter(doc)));
  };

  const isCollection = async (id: string) => {
    if (!collectionsLoading()) return collections.has(id);
    const list = await backend.query("database.list", { workspaceId });
    return list.some((d) => d.id === id);
  };

  const reveal = async (id: string) => {
    const above: string[] = [];
    let current = id;
    // The depth bound guards against a parent cycle in bad data.
    for (let depth = 0; depth < 64; depth++) {
      const [entry] = await backend.query("doc.get", { id: current });
      const parentId = entry?.document.parentId;
      if (parentId === undefined) return null;
      if (parentId === null) break;
      above.push(parentId);
      current = parentId;
    }
    if (!inTopLevel(current)) return null;
    // Top down: the first collection stands for everything inside it, which the tree does not list.
    const chain = above.reverse();
    for (const [i, parentId] of chain.entries()) {
      if (await isCollection(parentId)) {
        for (const folder of chain.slice(0, i)) setExpanded(folder, true);
        return parentId;
      }
    }
    for (const folder of chain) setExpanded(folder, true);
    return id;
  };

  const model: TreeModel = {
    rows: () => rows,
    loading: isLoading,
    subscribe(listener) {
      listeners.add(listener);
      if (!started) start();
      mounted.add(model);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stop();
          mounted.delete(model);
        }
      };
    },
    isExpanded: (id) => expanded.has(id),
    setExpanded,
    collapseAll,
    reveal,
    expandedIds: () => [...expanded],
    setRootFilter(filter) {
      if (filter === rootFilter) return;
      rootFilter = filter;
      schedule();
    },
    dispose() {
      stop();
      listeners.clear();
      mounted.delete(model);
    },
  };
  return model;
}
