// Database views for the UI: one-shot (`queryView`) and live (`liveView`). A live view re-runs
// when documents or the database's schema or views change, and keeps unchanged rows and groups as
// the same objects, so `memo` row components skip re-rendering.
import { ViewConfig, ViewWindow } from "@lydie/contract";
import type {
  DatabaseProperty,
  ViewConfigInput,
  ViewGroup,
  ViewResult,
  ViewRow,
  ViewType,
  ViewWindowInput,
} from "@lydie/contract";
import type { ViewQuery } from "@lydie/runtime";
import type { CommonPowerSyncDatabase } from "@powersync/common";

import { coalescedRerun, DEFAULT_COALESCE_MS } from "./coalesce.ts";
import {
  DATABASE_COLUMNS,
  PROPERTY_COLUMNS,
  toDatabase,
  toProperty,
  toView,
  VIEW_COLUMNS,
} from "./rows.ts";
import type { LiveQuery, LiveState } from "./store.ts";
import { runViewQuery } from "./views.ts";

export type ViewParams = {
  databaseId: string;
  // A saved view; default the database's first view.
  viewId?: string;
  // Ad-hoc changes over the saved view (an unsaved filter, a search, another type).
  view?: { type?: ViewType; config?: Partial<ViewConfigInput> };
  window?: ViewWindowInput;
  // The signed-in user's id, for "me" filters.
  me?: string | null;
  // The user's local date (YYYY-MM-DD) for relative date filters; default the device's.
  today?: string;
};

// What a live view holds, flattened so it fits a plain live query: the window's rows in order,
// then every group header, then one meta item with the total.
export type ViewItem =
  | { kind: "row"; key: string; row: ViewRow }
  | { kind: "group"; key: string; group: ViewGroup }
  | { kind: "meta"; key: "meta"; total: number; offset: number; viewType: ViewType };

export type LiveView = LiveQuery<ViewItem> & {
  // The same data as a ViewResult (rows keep their identity), or null while loading.
  readonly result: ViewResult | null;
};

type Row = Record<string, unknown>;

const TABLES = ["documents", "databases", "database_properties", "database_views"];

export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function rowKey(row: Pick<ViewRow, "id" | "group" | "subGroup">): string {
  return `r:${row.id}:${JSON.stringify([row.group, row.subGroup])}`;
}

export function createViews(db: CommonPowerSyncDatabase) {
  const read = (sql: string, params: unknown[]) => db.getAll<Row>(sql, params);

  async function resolve(params: ViewParams): Promise<{ query: ViewQuery; type: ViewType }> {
    const [database] = (
      await read(`SELECT ${DATABASE_COLUMNS} FROM databases WHERE id = ? AND deleted_at IS NULL`, [
        params.databaseId,
      ])
    ).map(toDatabase);
    if (!database) throw new Error(`Database ${params.databaseId} not found`);
    const properties = (
      await read(
        `SELECT ${PROPERTY_COLUMNS} FROM database_properties WHERE database_id = ? AND deleted_at IS NULL ORDER BY sort_key, id`,
        [database.id],
      )
    ).map(toProperty);
    const views = (
      await read(
        `SELECT ${VIEW_COLUMNS} FROM database_views WHERE database_id = ? AND deleted_at IS NULL ORDER BY sort_key, id`,
        [database.id],
      )
    ).map(toView);
    const saved = params.viewId ? views.find((v) => v.id === params.viewId) : views[0];
    if (params.viewId && !saved) throw new Error(`View ${params.viewId} not found`);
    const targetIds = properties.flatMap((p) =>
      p.type === "rollup" && p.config.rollup ? [p.config.rollup.targetPropertyId] : [],
    );
    const targets: DatabaseProperty[] = targetIds.length
      ? (
          await read(
            `SELECT ${PROPERTY_COLUMNS} FROM database_properties WHERE id IN (SELECT value FROM json_each(?)) AND deleted_at IS NULL`,
            [JSON.stringify(targetIds)],
          )
        ).map(toProperty)
      : [];
    const config = ViewConfig.parse({ ...(saved?.config ?? {}), ...(params.view?.config ?? {}) });
    return {
      type: params.view?.type ?? saved?.type ?? "table",
      query: {
        workspaceId: database.workspaceId,
        databaseId: database.id,
        properties,
        targets,
        databaseFilter: database.config.filter,
        templateIds: database.config.templateIds,
        config,
        window: ViewWindow.parse(params.window ?? {}),
        me: params.me ?? null,
        now: new Date().toISOString(),
        today: params.today ?? localToday(),
      },
    };
  }

  async function queryView(
    params: ViewParams,
    cached?: { query: ViewQuery; type: ViewType },
  ): Promise<ViewResult & { viewType: ViewType }> {
    const { query, type } = cached ?? (await resolve(params));
    return { ...(await runViewQuery(read, query)), viewType: type };
  }

  function liveView(params: ViewParams, options: { throttleMs?: number } = {}): LiveView {
    let state: LiveState<ViewItem> = { data: [], isLoading: true, error: undefined };
    let result: ViewResult | null = null;
    let previous = new Map<string, { item: ViewItem; json: string }>();
    const listeners = new Set<() => void>();
    let running = false;
    let dirty = false;
    let closed = false;
    // The resolved definition, reused until the schema or views change (row edits only re-query).
    let resolved: { query: ViewQuery; type: ViewType } | null = null;
    // The change counters (derived `doc_parent_versions`) of the databases whose rows the view
    // shows or reads (relation targets), as of the last run. A write elsewhere in the workspace
    // leaves them alone, and the view does not re-run for it.
    let versions: string | null = null;
    const versionsOf = async (query: ViewQuery) => {
      const parents = [
        query.databaseId,
        ...query.properties.flatMap((p) =>
          p.type === "relation" && p.config.relation ? [p.config.relation.databaseId] : [],
        ),
      ];
      const rows = await read(
        "SELECT parent_id, version FROM doc_parent_versions WHERE parent_id IN (SELECT value FROM json_each(?)) ORDER BY parent_id",
        [JSON.stringify(parents)],
      );
      return JSON.stringify(rows);
    };

    const emit = () => {
      for (const listener of listeners) listener();
    };

    async function refresh() {
      if (running) {
        dirty = true;
        return;
      }
      running = true;
      try {
        do {
          dirty = false;
          const definitionChanged = resolved === null;
          resolved ??= await resolve(params);
          // Read before the view, so a write in between only causes one more run.
          const current = await versionsOf(resolved.query);
          const settled = !state.isLoading && state.error === undefined;
          if (!definitionChanged && settled && current === versions) continue;
          versions = current;
          const next = await queryView(params, {
            type: resolved.type,
            query: { ...resolved.query, now: new Date().toISOString() },
          });
          if (closed) return;
          const fresh: ViewItem[] = [
            ...next.rows.map((row): ViewItem => ({ kind: "row", key: rowKey(row), row })),
            ...next.groups.map((group): ViewItem => ({
              kind: "group",
              key: `g:${JSON.stringify([group.subKey, group.key])}`,
              group,
            })),
            {
              kind: "meta",
              key: "meta",
              total: next.total,
              offset: next.offset,
              viewType: next.viewType,
            },
          ];
          const seen = new Map<string, { item: ViewItem; json: string }>();
          const items = fresh.map((item) => {
            const json = JSON.stringify(item);
            const old = previous.get(item.key);
            const kept = old && old.json === json ? old.item : item;
            seen.set(item.key, { item: kept, json });
            return kept;
          });
          previous = seen;
          const changed =
            state.isLoading ||
            state.error !== undefined ||
            items.length !== state.data.length ||
            items.some((x, i) => x !== state.data[i]);
          if (changed) {
            result = {
              total: next.total,
              offset: next.offset,
              rows: items.flatMap((i) => (i.kind === "row" ? [i.row] : [])),
              groups: items.flatMap((i) => (i.kind === "group" ? [i.group] : [])),
            };
            state = { data: items, isLoading: false, error: undefined };
            emit();
          }
        } while (dirty && !closed);
      } catch (error) {
        if (closed) return;
        state = {
          ...state,
          isLoading: false,
          error: error instanceof Error ? error : new Error(String(error)),
        };
        emit();
      } finally {
        running = false;
      }
    }

    // Coalesced like `store.live` (coalesce.ts); `refresh` itself runs once more if a change lands
    // while it runs.
    const rerun = coalescedRerun(refresh, options.throttleMs ?? DEFAULT_COALESCE_MS);
    const dispose = db.onChange(
      {
        onChange: (event) => {
          // PowerSync reports its internal table names (ps_data_local__documents, …).
          const tables = event.changedTables.map((t) => t.replace(/^ps_data(_local)?__/, ""));
          if (tables.some((t) => t !== "documents")) resolved = null;
          rerun.changed();
        },
      },
      { tables: TABLES, throttleMs: 0 },
    );
    rerun.changed();

    return {
      get state() {
        return state;
      },
      get result() {
        return result;
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      async close() {
        closed = true;
        rerun.dispose();
        dispose();
        listeners.clear();
      },
    };
  }

  return { queryView, liveView };
}
