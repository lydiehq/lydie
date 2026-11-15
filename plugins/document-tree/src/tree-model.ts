import type { Backend, ChildEntry, DocumentTreeSpace, LiveHandle } from "@lydie/plugin-api";

export type TreeRow = { doc: ChildEntry; depth: number; expanded: boolean };

// The sidebar tree as a flat list of visible rows. Each expanded folder (and the top level) is
// one live `doc.children` query, so collapsed folders cost nothing and the full tree is never
// read. Rows keep identity while their document and state are unchanged.
export type TreeModel = {
  rows: () => readonly TreeRow[];
  loading: () => boolean;
  subscribe: (listener: () => void) => () => void;
  isExpanded: (id: string) => boolean;
  setExpanded: (id: string, expanded: boolean) => void;
  collapseAll: () => void;
  // Expands the folders above a document when it lives in this tree; false when it does not.
  reveal: (id: string) => Promise<boolean>;
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

export function createTreeModel(
  backend: Backend,
  workspaceId: string,
  initialExpanded: readonly string[],
  onExpandedChange: (ids: readonly string[]) => void,
  options: TreeModelOptions = {},
): TreeModel {
  let rootFilter = options.rootFilter ?? null;
  const expanded = new Set(initialExpanded);
  const levels = new Map<string | null, { handle: LiveHandle<ChildEntry>; off: () => void }>();
  const listeners = new Set<() => void>();
  let rows: readonly TreeRow[] = [];
  let rowCache = new Map<string, TreeRow>();
  let scheduled = false;
  let wasLoading = true;

  const recompute = () => {
    scheduled = false;
    const next: TreeRow[] = [];
    const nextCache = new Map<string, TreeRow>();
    const walk = (parentId: string | null, depth: number) => {
      const level = levels.get(parentId);
      if (!level) return;
      for (const doc of level.handle.getSnapshot().data) {
        if (parentId === null && rootFilter && !rootFilter(doc)) continue;
        const open = expanded.has(doc.id) && doc.childCount > 0;
        const cached = rowCache.get(doc.id);
        const row =
          cached && cached.doc === doc && cached.depth === depth && cached.expanded === open
            ? cached
            : { doc, depth, expanded: open };
        next.push(row);
        nextCache.set(doc.id, row);
        if (open) walk(doc.id, depth + 1);
      }
    };
    walk(null, 0);
    rowCache = nextCache;
    const same = next.length === rows.length && next.every((r, i) => r === rows[i]);
    const isLoading = levels.get(null)?.handle.getSnapshot().isLoading ?? true;
    if (!same || isLoading !== wasLoading) {
      wasLoading = isLoading;
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
    if (!started || levels.has(parentId)) return;
    const handle = backend.live("doc.children", {
      workspaceId,
      parentId,
      ...(parentId === null ? options.space : undefined),
    });
    const off = handle.subscribe(schedule);
    levels.set(parentId, { handle, off });
  };
  const unwatch = (parentId: string) => {
    const level = levels.get(parentId);
    if (!level) return;
    level.off();
    levels.delete(parentId);
  };

  // Queries run while someone is subscribed (React StrictMode subscribes, unsubscribes and
  // subscribes again; the backend keeps results warm in between).
  const start = () => {
    started = true;
    watch(null);
    for (const id of expanded) watch(id);
    schedule();
  };
  const stop = () => {
    started = false;
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

  const inTopLevel = (id: string) =>
    (levels.get(null)?.handle.getSnapshot().data ?? []).some(
      (doc) => doc.id === id && (!rootFilter || rootFilter(doc)),
    );

  const reveal = async (id: string) => {
    const above: string[] = [];
    let current = id;
    // The depth bound guards against a parent cycle in bad data.
    for (let depth = 0; depth < 64; depth++) {
      const [entry] = await backend.query("doc.get", { id: current });
      const parentId = entry?.document.parentId;
      if (parentId === undefined) return false;
      if (parentId === null) break;
      above.push(parentId);
      current = parentId;
    }
    if (!inTopLevel(current)) return false;
    for (const parentId of above.reverse()) setExpanded(parentId, true);
    return true;
  };

  const model: TreeModel = {
    rows: () => rows,
    loading: () => levels.get(null)?.handle.getSnapshot().isLoading ?? true,
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
