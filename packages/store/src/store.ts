import type {
  AppliedOperation,
  Backlink,
  OutgoingLink,
  SearchHit,
  TreeEntry,
  ViewResult,
  ViewType,
} from "@lydie/contract";
import { uuidFloor } from "@lydie/contract";
import type { Db, Search } from "@lydie/runtime";
import type { CommonPowerSyncDatabase, DifferentialWatchedQuery } from "@powersync/common";

import { coalescedRerun, DEFAULT_COALESCE_MS } from "./coalesce.ts";
import { rebuildDerived } from "./derived.ts";
import { createViews } from "./live-view.ts";
import type { LiveView, ViewParams } from "./live-view.ts";
import { migrate } from "./migrations.ts";
import { createDbPort, createSearchPort } from "./ports.ts";
import { queries } from "./queries.ts";
import type { StoreQuery, TreeOptions } from "./queries.ts";
import { toAppliedOperation } from "./rows.ts";
import type { DocWithBody } from "./rows.ts";
import type { StoreMode } from "./schema.ts";
import { createStatus } from "./status.ts";
import type { StatusSource, StoreStatus } from "./status.ts";
import { createYjsStore } from "./yjs.ts";
import type { YjsStore } from "./yjs.ts";

export type FileIndexEntry = {
  // Document id.
  id: string;
  workspaceId: string;
  // Vault-relative path with forward slashes.
  path: string;
  mtime: number;
  size: number;
  hash: string;
  // Last-agreed Markdown, the base for three-way merges. null when unknown.
  lca: string | null;
  indexedAt: string;
};

export type UploadState = "local" | "uploading" | "uploaded" | "failed";

export type AttachmentUpload = {
  id: string;
  state: UploadState;
  error: string | null;
  attempts: number;
  updatedAt: string;
};

export type DocConflict = {
  // Document id.
  id: string;
  workspaceId: string;
  // Who raised it, e.g. "sync" or "file"; the UI shows a marker either way.
  kind: string;
  details: unknown;
  detectedAt: string;
};

// What a live query holds at any moment. The same shape everywhere (store.live, React hooks).
export type LiveState<T> = {
  // Rows keep their object identity while unchanged, so `memo` row components skip re-rendering.
  data: readonly T[];
  isLoading: boolean;
  error: Error | undefined;
};

// A framework-free live query; `subscribe`/`state` fit React's useSyncExternalStore.
export type LiveQuery<T> = {
  readonly state: LiveState<T>;
  subscribe(listener: () => void): () => void;
  close(): Promise<void>;
};

export type WatchOptions = {
  // Re-run window. `live`/`liveView`: the first change after a quiet window re-runs at once (a
  // single edit paints in the same frame), later changes in the window collapse into one run at
  // its end (see coalesce.ts). Default `watchThrottleMs` of the store, else 0. `watch`
  // (PowerSync's differential watch) uses it as a trailing throttle, default 0.
  throttleMs?: number;
};

export type Store = {
  // Escape hatch for the sync peer (connect, upload queue). UI code must not use it.
  readonly db: CommonPowerSyncDatabase;
  readonly mode: StoreMode;
  // Ports for `createRuntime({ ...store.ports, actor })`.
  readonly ports: { db: Db; search: Search };

  getDoc(id: string, options?: { includeBody?: boolean }): Promise<DocWithBody | null>;
  listTree(workspaceId: string, options?: TreeOptions): Promise<TreeEntry[]>;
  search(workspaceId: string, query: string, options?: { limit?: number }): Promise<SearchHit[]>;
  backlinks(id: string): Promise<Backlink[]>;
  // Links out of a document with what they resolve to (live: `live(queries.outgoingLinks(id))`).
  outgoingLinks(sourceId: string): Promise<OutgoingLink[]>;

  query<T>(query: StoreQuery<T>): Promise<T[]>;
  // A live query. Unchanged rows keep their object identity between emissions. Call `close()`.
  watch<T>(query: StoreQuery<T>, options?: WatchOptions): DifferentialWatchedQuery<T>;
  live<T>(query: StoreQuery<T>, options?: WatchOptions): LiveQuery<T>;

  // A database view's rows (filtered, sorted, grouped, windowed) with group counts. See
  // live-view.ts; the same semantics as the `database.query` operation.
  queryView(params: ViewParams): Promise<ViewResult & { viewType: ViewType }>;
  // Live form: re-runs when documents or the database's schema/views change. Call `close()`.
  liveView(params: ViewParams, options?: WatchOptions): LiveView;

  // Sync status, pending uploads, conflicts. "local-only" when sync is off.
  readonly status: {
    get: () => StoreStatus;
    subscribe: (listener: (status: StoreStatus) => void) => () => void;
  };

  fileIndex: {
    get(id: string): Promise<FileIndexEntry | null>;
    getByPath(workspaceId: string, path: string): Promise<FileIndexEntry | null>;
    list(workspaceId: string): Promise<FileIndexEntry[]>;
    put(entry: FileIndexEntry): Promise<void>;
    // Many entries in one transaction (an index of a whole folder).
    putMany(entries: readonly FileIndexEntry[]): Promise<void>;
    remove(id: string): Promise<void>;
    removeMany(ids: readonly string[]): Promise<void>;
  };

  oplog: {
    // Oldest first.
    list(options?: { limit?: number }): Promise<AppliedOperation[]>;
    remove(ids: readonly string[]): Promise<void>;
  };

  // Small values kept with the database, such as which extractor indexed its bodies. Local to
  // this database: never synced. Kept apart from the store's own entries in the same table.
  meta: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
  };

  // Upload state of attachment bytes. Rows start "local" when the attachment is created; the sync
  // peer moves them along.
  uploads: {
    get(id: string): Promise<AttachmentUpload | null>;
    list(options?: { state?: UploadState }): Promise<AttachmentUpload[]>;
    set(id: string, state: UploadState, error?: string | null): Promise<void>;
  };

  // Per-document conflict flags raised by the sync peer or the file bridge.
  conflicts: {
    list(workspaceId: string): Promise<DocConflict[]>;
    set(conflict: Omit<DocConflict, "detectedAt"> & { detectedAt?: string }): Promise<void>;
    clear(id: string): Promise<void>;
  };

  // Locally persisted Yjs updates of collaborative bodies (structurally @lydie/sync's
  // YjsPersistence), so offline edits survive restarts. Device-only, never synced.
  readonly yjs: YjsStore;

  // Device-local window/tab layouts (JSON), never synced. See `@lydie/runtime/layout`.
  layouts: {
    load(id: string): Promise<unknown>;
    save(id: string, state: unknown): Promise<void>;
    remove(id: string): Promise<void>;
  };

  // Rebuild rule. "search": drop and recreate the derived search tables from the current rows.
  // "index": also empty every table that is an index of the folder (documents, bodies, links,
  // blocks, file index, Yjs cache) so the file bridge can re-index it. Local mode only.
  rebuild(options?: { scope?: "search" | "index" }): Promise<void>;

  close(): Promise<void>;
};

const INDEX_TABLES = [
  "documents",
  "document_bodies",
  "links",
  "blocks",
  "file_index",
  "yjs_updates",
  "yjs_snapshots",
  // Rebuilt from the .base files.
  "databases",
  "database_properties",
  "database_views",
] as const;

const FILE_INDEX_COLUMNS = "id, workspace_id, path, mtime, size, hash, lca, indexed_at";

function toFileIndexEntry(row: Record<string, unknown>): FileIndexEntry {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    path: String(row.path),
    mtime: Number(row.mtime),
    size: Number(row.size),
    hash: String(row.hash),
    lca: (row.lca as string | null) ?? null,
    indexedAt: String(row.indexed_at),
  };
}

function toUpload(row: Record<string, unknown>): AttachmentUpload {
  return {
    id: String(row.id),
    state: row.state as UploadState,
    error: (row.error as string | null) ?? null,
    attempts: Number(row.attempts),
    updatedAt: String(row.updated_at),
  };
}

export type CreateStoreOptions = {
  // Applied to `watch`/`live`/`liveView` when not given per query (see WatchOptions).
  watchThrottleMs?: number;
  // The history journal (agent sessions, session undo) keeps this much; pruned at open.
  // Default: 30 days and at most 50,000 entries.
  historyRetention?: { days?: number; maxEntries?: number };
  // The activity log keeps rows whose last change is this recent; pruned at open. Default 180.
  activityRetentionDays?: number;
};

async function pruneHistory(
  db: CommonPowerSyncDatabase,
  retention: CreateStoreOptions["historyRetention"],
): Promise<void> {
  const days = retention?.days ?? 30;
  const maxEntries = retention?.maxEntries ?? 50_000;
  await db.writeTransaction(async (tx) => {
    await tx.execute("DELETE FROM op_history WHERE id < ?", [
      uuidFloor(Date.now() - days * 86_400_000),
    ]);
    await tx.execute(
      `DELETE FROM op_history WHERE id < (SELECT id FROM op_history ORDER BY id DESC LIMIT 1 OFFSET ?)`,
      [maxEntries - 1],
    );
  });
}

async function pruneActivity(db: CommonPowerSyncDatabase, days = 180): Promise<void> {
  await db.execute("DELETE FROM activity WHERE last_at < ?", [
    new Date(Date.now() - days * 86_400_000).toISOString(),
  ]);
}

// Wraps an opened PowerSync database (from `@lydie/store/node` or `@lydie/store/web`) whose schema
// came from `createSchema`. Runs the migrations, which also keep the derived tables current.
// Never calls `connect()`.
export async function createStore(
  db: CommonPowerSyncDatabase,
  options: CreateStoreOptions = {},
): Promise<Store> {
  await db.init();
  await migrate(db);
  await pruneHistory(db, options.historyRetention);
  await pruneActivity(db, options.activityRetentionDays);
  // Local-only: nothing uploads, so the queue is not kept (older databases may still hold rows).
  if (db.schema.tables.find((t) => t.name === "documents")?.localOnly) {
    await db.execute("DELETE FROM operation_log");
  }
  const mode: StoreMode = db.schema.tables.find((t) => t.name === "documents")?.localOnly
    ? "local"
    : "synced";

  const run = async <T>(q: StoreQuery<T>) =>
    (await db.getAll<Record<string, unknown>>(q.sql, [...q.parameters])).map(q.map);

  const watch = <T>(q: StoreQuery<T>, watchOptions?: WatchOptions) =>
    db.query<T>({ sql: q.sql, parameters: q.parameters, mapper: q.map }).differentialWatch({
      rowComparator: { keyBy: q.key, compareBy: (row) => JSON.stringify(row) },
      throttleMs: watchOptions?.throttleMs ?? options.watchThrottleMs ?? 0,
      ...(q.tables ? { triggerOnTables: [...q.tables] } : {}),
    });

  // The tables a statement reads depend on its SQL, not its parameters: resolved once per
  // statement, so a live query for another document starts with one round trip, not two.
  const resolved = new Map<string, Promise<string[]>>();
  const tablesOf = (q: { sql: string; parameters: readonly unknown[] }) => {
    let tables = resolved.get(q.sql);
    if (!tables) {
      tables = db.resolveTables(q.sql, [...q.parameters]);
      resolved.set(q.sql, tables);
      tables.catch(() => resolved.delete(q.sql));
    }
    return tables;
  };

  const coalesceMs = (watchOptions?: WatchOptions) =>
    watchOptions?.throttleMs ?? options.watchThrottleMs ?? DEFAULT_COALESCE_MS;

  // A live query: re-runs on changes to the tables it reads (coalesced, see coalesce.ts) and keeps
  // unchanged rows (same key, same JSON) as the same objects.
  const live = <T>(q: StoreQuery<T>, watchOptions?: WatchOptions): LiveQuery<T> => {
    const listeners = new Set<() => void>();
    let state: LiveState<T> = { data: [], isLoading: true, error: undefined };
    let previous = new Map<string, { row: T; json: string }>();
    let closed = false;
    let offChange: (() => void) | null = null;
    const emit = () => {
      for (const listener of listeners) listener();
    };
    const rerun = coalescedRerun(async () => {
      try {
        const rows = await run(q);
        if (closed) return;
        const seen = new Map<string, { row: T; json: string }>();
        const data = rows.map((row) => {
          const key = q.key(row);
          const json = JSON.stringify(row);
          const old = previous.get(key);
          const kept = old && old.json === json ? old.row : row;
          seen.set(key, { row: kept, json });
          return kept;
        });
        previous = seen;
        const changed =
          state.isLoading ||
          state.error !== undefined ||
          data.length !== state.data.length ||
          data.some((row, i) => row !== state.data[i]);
        if (!changed) return;
        state = { data, isLoading: false, error: undefined };
      } catch (error) {
        if (closed) return;
        state = {
          ...state,
          isLoading: false,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
      emit();
    }, coalesceMs(watchOptions));
    void (async () => {
      try {
        const tables = [...(await tablesOf(q)), ...(q.tables ?? [])];
        if (closed) return;
        offChange = db.onChange({ onChange: () => rerun.changed() }, { tables, throttleMs: 0 });
      } catch {
        // Unresolvable SQL: the first run reports the error.
      }
      rerun.changed();
    })();
    return {
      get state() {
        return state;
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      async close() {
        closed = true;
        rerun.dispose();
        offChange?.();
        listeners.clear();
      },
    };
  };

  const counts: StatusSource["counts"] = async () => {
    const row = await db.get<{ ops: number; files: number; conflicts: number }>(
      `SELECT (SELECT count(*) FROM operation_log) AS ops,
              (SELECT count(*) FROM attachment_uploads WHERE state != 'uploaded') AS files,
              (SELECT count(*) FROM doc_conflicts) AS conflicts`,
    );
    return { ops: Number(row.ops), files: Number(row.files), conflicts: Number(row.conflicts) };
  };
  const status = createStatus({
    mode,
    counts,
    onTables: (tables, listener) =>
      // Counts for the status bar: no need to re-count after every commit of a burst.
      db.onChange(
        { onChange: listener },
        { tables: [...tables], throttleMs: options.watchThrottleMs ?? 100 },
      ),
    current: () => db.currentStatus,
    onSyncStatus: (listener) => db.registerListener({ statusChanged: listener }),
  });

  const views = createViews(db);

  const store: Store = {
    db,
    mode,
    ports: {
      db: createDbPort(db, { uploadQueue: mode === "synced" }),
      search: createSearchPort(db),
    },

    async getDoc(id, getOptions) {
      return (await run(queries.getDoc(id, getOptions)))[0] ?? null;
    },
    listTree: (workspaceId, treeOptions) => run(queries.listTree(workspaceId, treeOptions)),
    search: (workspaceId, text, searchOptions) =>
      run(queries.search(workspaceId, text, searchOptions)),
    backlinks: (id) => run(queries.backlinks(id)),
    outgoingLinks: (sourceId) => run(queries.outgoingLinks(sourceId)),

    query: run,
    watch,
    live,
    queryView: views.queryView,
    yjs: createYjsStore(db),
    liveView: (params, viewOptions) =>
      views.liveView(params, {
        throttleMs: coalesceMs(viewOptions),
      }),
    status,

    fileIndex: {
      async get(id) {
        const row = await db.getOptional<Record<string, unknown>>(
          `SELECT ${FILE_INDEX_COLUMNS} FROM file_index WHERE id = ?`,
          [id],
        );
        return row ? toFileIndexEntry(row) : null;
      },
      async getByPath(workspaceId, path) {
        const row = await db.getOptional<Record<string, unknown>>(
          `SELECT ${FILE_INDEX_COLUMNS} FROM file_index WHERE workspace_id = ? AND path = ?`,
          [workspaceId, path],
        );
        return row ? toFileIndexEntry(row) : null;
      },
      async list(workspaceId) {
        const rows = await db.getAll<Record<string, unknown>>(
          `SELECT ${FILE_INDEX_COLUMNS} FROM file_index WHERE workspace_id = ? ORDER BY path`,
          [workspaceId],
        );
        return rows.map(toFileIndexEntry);
      },
      async put(e) {
        await db.writeTransaction(async (tx) => {
          await tx.execute("DELETE FROM file_index WHERE id = ?", [e.id]);
          await tx.execute(
            `INSERT INTO file_index (${FILE_INDEX_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [e.id, e.workspaceId, e.path, e.mtime, e.size, e.hash, e.lca, e.indexedAt],
          );
        });
      },
      async putMany(entries) {
        if (entries.length === 0) return;
        const rows = JSON.stringify(entries);
        await db.writeTransaction(async (tx) => {
          await tx.execute(
            "DELETE FROM file_index WHERE id IN (SELECT value ->> 'id' FROM json_each(?))",
            [rows],
          );
          await tx.execute(
            `INSERT INTO file_index (${FILE_INDEX_COLUMNS})
             SELECT value ->> 'id', value ->> 'workspaceId', value ->> 'path', value ->> 'mtime',
                    value ->> 'size', value ->> 'hash', value ->> 'lca', value ->> 'indexedAt'
             FROM json_each(?)`,
            [rows],
          );
        });
      },
      async remove(id) {
        await db.execute("DELETE FROM file_index WHERE id = ?", [id]);
      },
      async removeMany(ids) {
        if (ids.length === 0) return;
        await db.execute("DELETE FROM file_index WHERE id IN (SELECT value FROM json_each(?))", [
          JSON.stringify(ids),
        ]);
      },
    },

    meta: {
      async get(key) {
        const row = await db.getOptional<{ value: string }>(
          "SELECT value FROM lydie_meta WHERE key = ?",
          [`app:${key}`],
        );
        return row?.value ?? null;
      },
      async set(key, value) {
        await db.execute("INSERT OR REPLACE INTO lydie_meta(key, value) VALUES (?, ?)", [
          `app:${key}`,
          value,
        ]);
      },
    },

    oplog: {
      async list(listOptions) {
        const rows = await db.getAll<Record<string, unknown>>(
          `SELECT id, operation, input, actor, session_id, workspace_id, created_at, version
           FROM operation_log ORDER BY id LIMIT ?`,
          [listOptions?.limit ?? -1],
        );
        return rows.map(toAppliedOperation);
      },
      async remove(ids) {
        if (ids.length === 0) return;
        await db.execute("DELETE FROM operation_log WHERE id IN (SELECT value FROM json_each(?))", [
          JSON.stringify(ids),
        ]);
      },
    },

    uploads: {
      async get(id) {
        const row = await db.getOptional<Record<string, unknown>>(
          "SELECT id, state, error, attempts, updated_at FROM attachment_uploads WHERE id = ?",
          [id],
        );
        return row ? toUpload(row) : null;
      },
      async list(listOptions) {
        const rows = await db.getAll<Record<string, unknown>>(
          `SELECT id, state, error, attempts, updated_at FROM attachment_uploads
           WHERE ? IS NULL OR state = ? ORDER BY updated_at, id`,
          [listOptions?.state ?? null, listOptions?.state ?? null],
        );
        return rows.map(toUpload);
      },
      async set(id, state, error = null) {
        // `attempts` counts the times an upload started.
        const started = state === "uploading" ? 1 : 0;
        const now = new Date().toISOString();
        await db.execute(
          `INSERT INTO attachment_uploads (id, state, error, attempts, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET state = excluded.state, error = excluded.error,
             updated_at = excluded.updated_at, attempts = attempts + ?`,
          [id, state, error, started, now, started],
        );
      },
    },

    conflicts: {
      async list(workspaceId) {
        const rows = await db.getAll<Record<string, unknown>>(
          "SELECT id, workspace_id, kind, details, detected_at FROM doc_conflicts WHERE workspace_id = ? ORDER BY detected_at",
          [workspaceId],
        );
        return rows.map((r) => ({
          id: String(r.id),
          workspaceId: String(r.workspace_id),
          kind: String(r.kind),
          details: r.details === null ? null : (JSON.parse(r.details as string) as unknown),
          detectedAt: String(r.detected_at),
        }));
      },
      async set(c) {
        await db.execute(
          `INSERT OR REPLACE INTO doc_conflicts (id, workspace_id, kind, details, detected_at)
           VALUES (?, ?, ?, ?, ?)`,
          [
            c.id,
            c.workspaceId,
            c.kind,
            c.details === undefined ? null : JSON.stringify(c.details),
            c.detectedAt ?? new Date().toISOString(),
          ],
        );
      },
      async clear(id) {
        await db.execute("DELETE FROM doc_conflicts WHERE id = ?", [id]);
      },
    },

    layouts: {
      async load(id) {
        const row = await db.getOptional<{ state: string }>(
          "SELECT state FROM device_layouts WHERE id = ?",
          [id],
        );
        return row ? (JSON.parse(row.state) as unknown) : null;
      },
      async save(id, state) {
        await db.execute(
          "INSERT OR REPLACE INTO device_layouts (id, state, updated_at) VALUES (?, ?, ?)",
          [id, JSON.stringify(state), new Date().toISOString()],
        );
      },
      async remove(id) {
        await db.execute("DELETE FROM device_layouts WHERE id = ?", [id]);
      },
    },

    async rebuild(rebuildOptions) {
      if ((rebuildOptions?.scope ?? "search") === "index") {
        if (mode !== "local") {
          // Emptying synced tables would queue deletes for upload.
          throw new Error('rebuild({ scope: "index" }) is only allowed in local mode');
        }
        await db.writeTransaction(async (tx) => {
          for (const table of INDEX_TABLES) await tx.execute(`DELETE FROM ${table}`);
        });
      }
      await rebuildDerived(db);
    },

    async close() {
      status.close();
      await db.close();
    },
  };
  return store;
}
