import type { DatabaseDefinition, ViewGroup, ViewRow, ViewType } from "@lydie/contract";
import { useState, useSyncExternalStore } from "react";

import type { DatabaseViewItem, DatabaseViewParams, LiveHandle, LiveState } from "../backend.ts";
import { useBackend, useQuery } from "../react.tsx";

// A database's settings, properties and views; null while loading or when `id` is not a
// (live) database.
export function useDatabase(id: string | null): {
  definition: DatabaseDefinition | null;
  isLoading: boolean;
  error: Error | undefined;
} {
  const state = useQuery("database.get", id ? { id } : null);
  return { definition: state.data[0] ?? null, isLoading: state.isLoading, error: state.error };
}

export type ViewWindowState = {
  // The window's rows, in order; `rows[i]` is row `offset + i` of the whole result.
  rows: readonly ViewRow[];
  offset: number;
  // Rows matching the view (all groups).
  total: number;
  // Every group (and sub-group) with its count and the position of its first row.
  groups: readonly ViewGroup[];
  viewType: ViewType | null;
  // Nothing to show yet (first load).
  isLoading: boolean;
  // A new window or query is loading; the previous result is still shown.
  isFetching: boolean;
  error: Error | undefined;
};

const EMPTY: ViewWindowState = Object.freeze({
  rows: Object.freeze([]) as readonly ViewRow[],
  offset: 0,
  total: 0,
  groups: Object.freeze([]) as readonly ViewGroup[],
  viewType: null,
  isLoading: true,
  isFetching: false,
  error: undefined,
});

const IDLE_STATE: LiveState<DatabaseViewItem> = Object.freeze({
  data: Object.freeze([]) as readonly DatabaseViewItem[],
  isLoading: false,
  error: undefined,
});

const IDLE_HANDLE: LiveHandle<DatabaseViewItem> = {
  key: "idle",
  getSnapshot: () => IDLE_STATE,
  subscribe: () => () => {},
};

function toWindow(state: LiveState<DatabaseViewItem>): ViewWindowState {
  const rows: ViewRow[] = [];
  const groups: ViewGroup[] = [];
  let total = 0;
  let offset = 0;
  let viewType: ViewType | null = null;
  for (const item of state.data) {
    if (item.kind === "row") rows.push(item.row);
    else if (item.kind === "group") groups.push(item.group);
    else {
      total = item.total;
      offset = item.offset;
      viewType = item.viewType;
    }
  }
  return {
    rows,
    offset,
    total,
    groups,
    viewType,
    isLoading: state.isLoading,
    isFetching: false,
    error: state.error,
  };
}

// The snapshot `useDatabaseView` returns for a handle's state: the same object while the state is,
// and while a new query loads the last result that had data.
function createWindowCache() {
  let key = "";
  let state: LiveState<DatabaseViewItem> | null = null;
  let result = EMPTY;
  let ready: ViewWindowState | null = null;
  return (handle: LiveHandle<DatabaseViewItem>): ViewWindowState => {
    const next = handle.getSnapshot();
    if (key === handle.key && state === next) return result;
    key = handle.key;
    state = next;
    if (next.isLoading && ready) {
      result = { ...ready, isFetching: true };
    } else {
      result = toWindow(next);
      if (!next.isLoading && !next.error) ready = result;
    }
    return result;
  };
}

// A live window of a database view. When the params change (scrolling to another window, a new
// filter) the previous result stays until the new one arrives, so nothing flashes empty.
// Unchanged rows keep their identity across emissions.
export function useDatabaseView(params: DatabaseViewParams | null): ViewWindowState {
  const backend = useBackend();
  const handle = params ? backend.live("database.view", params) : IDLE_HANDLE;
  const [snapshotOf] = useState(createWindowCache);
  const getSnapshot = () => snapshotOf(handle);
  return useSyncExternalStore(handle.subscribe, getSnapshot, getSnapshot);
}

// The view a page's own row is read from (its computed values: relation titles, rollups,
// formulas): rows with its title, pick it by id. The properties panel reads it and `prefetchDoc`
// starts it, so both must ask for the same query.
export function pageRowViewParams(
  definition: DatabaseDefinition,
  doc: { title: string },
): DatabaseViewParams | null {
  const title = definition.properties.find((p) => p.type === "title");
  if (!title) return null;
  return {
    databaseId: definition.database.id,
    view: {
      config: {
        filter: { type: "condition", propertyId: title.id, op: "eq", value: doc.title },
        groupBy: null,
        subGroupBy: null,
        sorts: [],
      },
    },
    window: { offset: 0, limit: 50 },
  };
}

// The ids a window shows, for "Select all" and bulk actions.
export function rowIdsOf(window: ViewWindowState): string[] {
  return window.rows.map((r) => r.id);
}
