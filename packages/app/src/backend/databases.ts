// Database live queries for the local backend: a database's definition (three store queries as
// one row) and a view window (the store's live view), with optimistic paint for value edits.
import type { DatabaseDefinition, DatabaseProperty, ViewResult } from "@lydie/contract";
import type { DatabaseViewItem, DatabaseViewParams, LiveState } from "@lydie/plugin-api";
import { queries, rowKey } from "@lydie/store";
import type { LiveQuery, Store } from "@lydie/store";

const LOADING: LiveState<never> = Object.freeze({
  data: Object.freeze([]) as readonly never[],
  isLoading: true,
  error: undefined,
});

// Several live queries combined into one: re-derived whenever one of them emits new data.
function combine<T>(
  parts: readonly LiveQuery<unknown>[],
  derive: () => readonly T[],
): LiveQuery<T> {
  let state: LiveState<T> = LOADING;
  let last: readonly unknown[] = [];
  const listeners = new Set<() => void>();
  const update = () => {
    const states = parts.map((p) => p.state);
    if (states.some((s) => s.isLoading)) return;
    const error = states.find((s) => s.error)?.error;
    const data = states.map((s) => s.data);
    if (
      !state.isLoading &&
      error === state.error &&
      data.length === last.length &&
      data.every((d, i) => d === last[i])
    ) {
      return;
    }
    last = data;
    state = { data: error ? state.data : derive(), isLoading: false, error };
    for (const listener of [...listeners]) listener();
  };
  const offs = parts.map((p) => p.subscribe(update));
  update();
  return {
    get state() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async close() {
      for (const off of offs) off();
      listeners.clear();
      await Promise.all(parts.map((p) => p.close()));
    },
  };
}

function toDefinition(
  database: DatabaseDefinition["database"] | undefined,
  properties: readonly DatabaseProperty[],
  views: readonly DatabaseDefinition["views"][number][],
): DatabaseDefinition[] {
  return database && !database.deletedAt
    ? [{ database, properties: [...properties], views: [...views] }]
    : [];
}

export function liveDefinition(store: Store, id: string): LiveQuery<DatabaseDefinition> {
  const database = store.live(queries.database(id));
  const properties = store.live(queries.databaseProperties(id));
  const views = store.live(queries.databaseViews(id));
  return combine([database, properties, views], () =>
    toDefinition(database.state.data[0], properties.state.data, views.state.data),
  );
}

export async function queryDefinition(store: Store, id: string): Promise<DatabaseDefinition[]> {
  const [database, properties, views] = await Promise.all([
    store.query(queries.database(id)),
    store.query(queries.databaseProperties(id)),
    store.query(queries.databaseViews(id)),
  ]);
  return toDefinition(database[0], properties, views);
}

export function viewItems(result: ViewResult & { viewType: string }): DatabaseViewItem[] {
  return [
    ...result.rows.map((row): DatabaseViewItem => ({ kind: "row", key: rowKey(row), row })),
    ...result.groups.map((group): DatabaseViewItem => ({
      kind: "group",
      key: `g:${JSON.stringify([group.subKey, group.key])}`,
      group,
    })),
    {
      kind: "meta",
      key: "meta",
      total: result.total,
      offset: result.offset,
      viewType: result.viewType as never,
    },
  ];
}

// The properties of the database a view shows, kept current for the optimistic patcher.
export type PropertyIndex = { byId: Map<string, DatabaseProperty> };

export function liveView(
  store: Store,
  params: DatabaseViewParams,
  index: PropertyIndex,
): LiveQuery<DatabaseViewItem> {
  const view = store.liveView(params) as unknown as LiveQuery<DatabaseViewItem>;
  const properties = store.live(queries.databaseProperties(params.databaseId));
  const sync = () => {
    index.byId = new Map(properties.state.data.map((p) => [p.id, p]));
  };
  const off = properties.subscribe(sync);
  sync();
  return {
    get state() {
      return view.state;
    },
    subscribe: (listener) => view.subscribe(listener),
    async close() {
      off();
      await Promise.all([view.close(), properties.close()]);
    },
  };
}
