import type {
  Attachment,
  Backlink,
  ChildEntry,
  DatabaseDefinition,
  DocumentAccess,
  SearchHit,
  TeamspaceRow,
  TreeEntry,
  UnlinkedMention,
  UnresolvedLink,
} from "@lydie/contract";
import type { CompilableQuery } from "@powersync/common";
import { PowerSyncContext, useQuery } from "@powersync/react";
import { createContext, use, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import type { LiveView, ViewItem, ViewParams } from "./live-view.ts";
import { queries } from "./queries.ts";
import type { DatabaseSummary, RowsOptions, StoreQuery, TreeOptions } from "./queries.ts";
import type { DocWithBody } from "./rows.ts";
import type { StoreStatus } from "./status.ts";
import type { LiveState, Store } from "./store.ts";

const StoreContext = createContext<Store | null>(null);

type ProviderProps = { store: Store; children: ReactNode };

export function StoreProvider({ store, children }: ProviderProps) {
  return (
    <PowerSyncContext value={store.db}>
      <StoreContext value={store}>{children}</StoreContext>
    </PowerSyncContext>
  );
}

export function useStore(): Store {
  const store = use(StoreContext);
  if (!store) throw new Error("useStore must be used inside <StoreProvider>");
  return store;
}

// The same shape as `store.live(q).state`.
export type LiveResult<T> = LiveState<T>;

// Runs a domain query and re-runs it when its tables change (no throttle: a committed write shows
// in the next render).
export function useStoreQuery<T>(query: StoreQuery<T>): LiveResult<T> {
  const { db } = useStore();
  // A fresh object every render is fine: useQuery compares the compiled SQL and parameters.
  const compilable: CompilableQuery<T> = {
    compile: () => ({ sql: query.sql, parameters: [...query.parameters] }),
    execute: async () =>
      (await db.getAll<Record<string, unknown>>(query.sql, [...query.parameters])).map(query.map),
  };
  const result = useQuery<T>(compilable, [], {
    rowComparator: { keyBy: query.key, compareBy: (row: T) => JSON.stringify(row) },
    throttleMs: 0,
    ...(query.tables ? { tables: [...query.tables] } : {}),
  });
  return { data: result.data, isLoading: result.isLoading, error: result.error };
}

function single<T>(result: LiveResult<T>): Omit<LiveResult<T>, "data"> & { data: T | null } {
  return { ...result, data: result.data[0] ?? null };
}

export function useTree(workspaceId: string, options: TreeOptions = {}): LiveResult<TreeEntry> {
  return useStoreQuery(queries.listTree(workspaceId, options));
}

// One level of the tree; watch one per expanded folder so collapsed ones cost nothing.
export function useChildren(
  workspaceId: string,
  parentId: string | null,
  options: { includeDeleted?: boolean } = {},
): LiveResult<ChildEntry> {
  return useStoreQuery(queries.children(workspaceId, parentId, options));
}

export function useDoc(id: string, options: { includeBody?: boolean } = {}) {
  return single<DocWithBody>(useStoreQuery(queries.getDoc(id, options)));
}

export function useSearch(
  workspaceId: string,
  query: string,
  options: { limit?: number } = {},
): LiveResult<SearchHit> {
  return useStoreQuery(queries.search(workspaceId, query, options));
}

export function useBacklinks(id: string): LiveResult<Backlink> {
  return useStoreQuery(queries.backlinks(id));
}

export function useBlockBacklinks(id: string, blockId: string): LiveResult<Backlink> {
  return useStoreQuery(queries.blockBacklinks(id, blockId));
}

export function useUnresolvedLinks(workspaceId: string): LiveResult<UnresolvedLink> {
  return useStoreQuery(queries.unresolvedLinks(workspaceId));
}

export function useUnlinkedMentions(
  workspaceId: string,
  targetId: string,
  phrases: readonly string[],
): LiveResult<UnlinkedMention> {
  return useStoreQuery(queries.unlinkedMentions(workspaceId, targetId, phrases));
}

export function useAttachments(
  workspaceId: string,
  options: { documentId?: string; includeDeleted?: boolean } = {},
): LiveResult<Attachment> {
  return useStoreQuery(queries.attachments(workspaceId, options));
}

// The children of a "database" document, filtered and sorted by properties.
export function useRows(
  workspaceId: string,
  parentId: string,
  options: RowsOptions = {},
): LiveResult<TreeEntry> {
  return useStoreQuery(queries.rows(workspaceId, parentId, options));
}

// Sync status for the status bar: re-renders only when it changes.
export function useStoreStatus(): StoreStatus {
  const { status } = useStore();
  return useSyncExternalStore(status.subscribe, status.get, status.get);
}

// ---- Databases

export function useDatabases(workspaceId: string): LiveResult<DatabaseSummary> {
  return useStoreQuery(queries.databases(workspaceId));
}

// A database's settings, live properties and views; data is null while loading or when it is not
// a (live) database.
export function useDatabase(id: string): Omit<LiveResult<unknown>, "data"> & {
  data: DatabaseDefinition | null;
} {
  const database = useStoreQuery(queries.database(id));
  const properties = useStoreQuery(queries.databaseProperties(id));
  const views = useStoreQuery(queries.databaseViews(id));
  const row = database.data[0];
  const data = useMemo(
    () =>
      row && !row.deletedAt
        ? { database: row, properties: [...properties.data], views: [...views.data] }
        : null,
    [row, properties.data, views.data],
  );
  return {
    data,
    isLoading: database.isLoading || properties.isLoading || views.isLoading,
    error: database.error ?? properties.error ?? views.error,
  };
}

const LOADING: LiveResult<ViewItem> = { data: [], isLoading: true, error: undefined };

// Starts the live view on the first subscriber and closes it after the last one leaves, so
// creating the handle during render has no side effects.
function lazyView(store: Store, params: ViewParams) {
  let live: LiveView | null = null;
  let subscribers = 0;
  return {
    subscribe: (listener: () => void) => {
      live ??= store.liveView(params);
      subscribers++;
      const off = live.subscribe(listener);
      return () => {
        off();
        if (--subscribers === 0 && live) {
          void live.close();
          live = null;
        }
      };
    },
    getSnapshot: () => live?.state ?? LOADING,
    get view() {
      return live;
    },
  };
}

// A live database view (see Store.liveView). Re-subscribes when the params change.
export function useView(params: ViewParams): LiveResult<ViewItem> & { view: LiveView | null } {
  const store = useStore();
  const key = JSON.stringify(params);
  const handle = useMemo(() => lazyView(store, JSON.parse(key) as ViewParams), [store, key]);
  const state = useSyncExternalStore(handle.subscribe, handle.getSnapshot, handle.getSnapshot);
  return { ...state, view: handle.view };
}

// ---- Team and access (hosted)

export function useTeamspaces(workspaceId: string): LiveResult<TeamspaceRow> {
  return useStoreQuery(queries.teamspaces(workspaceId));
}

export function useMyAccess(documentId: string) {
  return single<DocumentAccess>(useStoreQuery(queries.myAccess(documentId)));
}
