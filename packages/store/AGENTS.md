# AGENTS.md - @lydie/store

The one local SQLite database, through the PowerSync client SDK (sync off for now: nothing calls
`connect()`). Owns the schema and its migrations, the domain queries, their watched/React forms, sync
status, and the runtime's `Db`/`Search` ports. One implementation for every mode.

Licence: AGPL-3.0-only.

## May depend on

`@lydie/contract`, `@lydie/runtime`. `client/scripts/check-boundaries.ts` is authoritative and runs in CI.

## Rules

- The only package that writes SQL. Writes to PowerSync tables go through their views, never the
  `ps_data*` tables (only derived-table triggers and data migrations of synced tables touch those).
- Driver-specific imports stay in their entry points: `@powersync/node` and `better-sqlite3` only in
  `src/node.ts`, `@powersync/web` only in `src/web.ts`, React only in `src/react.tsx`.
- Schema changes follow "Migrations" below. Derived tables (`search_fts`, `search_map`, `doc_keys`) must
  stay rebuildable from the rows; bump `DERIVED_VERSION` in `src/derived.ts` when changing them.
- The SQLite ports and the memory ports in `@lydie/runtime/memory` must agree: `parity.test.ts` runs
  every operation and query on both and compares the results.
- Tests: `bun test` (`bun --filter=@lydie/store run test`); the React test gets a DOM from
  `test/setup.ts` (preloaded via `bunfig.toml`). Do not use `expect(promise).rejects` with database
  promises: Bun's matcher waits without running macrotasks, and PowerSync settles them from a worker
  thread, so it hangs. Use `rejection(promise)` from `test-utils.ts`.
- Benchmarks: `bun --filter=@lydie/store run bench` (`client/scripts/bench/store.bench.ts`, budgets
  enforced; not in the default run). Keep them green when changing queries.

## Public API

```ts
// "@lydie/store/node" — Electron main, CLI, MCP, tests
openNodeStore({ path, mode?: "local" | "synced", watchThrottleMs?, historyRetention?,
  activityRetentionDays?, maintenanceDelayMs? }): Promise<Store>
readSchemaVersion(path): number                 // read without PowerSync (pre-open check)
createDirectoryBlob(dir): Blob                  // content-addressed files <dir>/<ab>/<sha256>
// "@lydie/store/web" — OPFS via wa-sqlite
openWebStore({ dbFilename, mode?, vfs?, attempts?, retryDelayMs? }): Promise<Store & { persistent: boolean }>
  // vfs: WASQLiteVFS.InMemoryVfs: in memory on purpose; persistent false, no schema-version key
  // throws WebStoreOpenError { dbFilename, cause } after its attempts (StoreVersionError is not retried)
readWebDatabaseFiles(dbFilename): Promise<{ database: File | null; journal: File | null }>  // read-only
deleteWebDatabaseFiles(dbFilename): Promise<void>  // a database nothing has open; fails otherwise
// "@lydie/store/vite" — build-time fix for PowerSync's SimpleOpfsVFS; bundlers of the web driver must use it
powersyncOpfsFix()   // in `plugins` and `worker.plugins` (see "Web driver: OPFS" below)

// "@lydie/store"
createSchema(mode = "local"), SYNCED_TABLES, PLAIN_TABLES, createStore(db, options?),
createDbPort(db), createSearchPort(db), migrate(db, migrations?), MIGRATIONS, SCHEMA_VERSION,
StoreVersionError (code "newer_database"), assertOpenable(found), syncStateOf(mode, status)
type Store = {
  db; mode;                              // PowerSync database (sync peer only), "local" | "synced"
  ports: { db: Db; search: Search };     // createRuntime({ ...store.ports, actor })
  getDoc(id, { includeBody? }), listTree(ws, TreeOptions), search(ws, text, { limit? }), backlinks(id);
  query(q): Promise<T[]>;
  watch(q, { throttleMs? }): DifferentialWatchedQuery<T>;     // default throttle 0
  live(q, { throttleMs? }): LiveQuery<T>;  // { state: { data, isLoading, error }, subscribe, close }
                                           // the tables a statement reads are resolved once per SQL string
  status: { get(): StoreStatus; subscribe(fn) };   // StoreStatus below
  fileIndex: { get, getByPath, list, put, remove };
  oplog: { list({ limit? }), remove(ids) };        // the upload queue (AppliedOperation, oldest first)
  meta: { get(key), set(key, value) };              // small local values (lydie_meta, keys stored as
                                                    // `app:<key>`, apart from the store's own; never synced)
  uploads: { get(id), list({ state? }), set(id, state, error?) };   // attachment byte upload state
  conflicts: { list(ws), set({ id, workspaceId, kind, details? }), clear(id) };
  layouts: { load(id), save(id, json), remove(id) };   // device-only; see @lydie/runtime/layout
  queryView(ViewParams): Promise<ViewResult & { viewType }>;  // a database view, once
  liveView(ViewParams, { throttleMs? }): LiveView;   // LiveQuery<ViewItem> + result: ViewResult | null
  yjs: { load(docId), append(docId, update), replace(docId, state), clear(docId),
         setDirty(docId, dirty), dirty() };   // = @lydie/sync's YjsPersistence, over yjs_* tables
  rebuild({ scope?: "search" | "index" });
  maintenance: Promise<void>;   // pruning the journal and the activity log, emptying a local
                                // upload queue: started `maintenanceDelayMs` (2000) after open,
                                // off the first paint; settles when done or at close, never rejects
  close();
}
StoreStatus = { sync: "local-only" | "offline" | "connecting" | "syncing" | "synced" | "error",
  pendingOperations, pendingUploads, conflicts, lastSyncedAt, error }   // counts 0 in local mode

queries.listTree(ws, { rootId?, includeDeleted?, expanded? }) | children(ws, parentId) (+ childCount) |
  getDoc(id) | recent(ws, { limit? }) (live documents by updated_at, newest first; default 20) | backlinks(id) | blockBacklinks(id, blockId) | unresolvedLinks(ws) |
  unlinkedMentions(ws, targetId, phrases) | search(ws, text) | attachments(ws, { documentId?, includeDeleted? }) |
  rows(ws, parentId, { filters?: PropertyFilter[], sorts?: PropertySort[], limit?, offset? }) |
  databases(ws) (DatabaseSummary) | database(id) | databaseProperties(id, { includeDeleted? }) |
  databaseViews(id, { includeDeleted? }) | workspace(ws) (0/1 WorkspaceRow) | workspaceMembers(ws) | teamspaces(ws) |
  teamspaceMembers(teamspaceId) | grants(docId) | myAccess(docId) (DocumentAccess) |
  publicPages(ws) (pages with a live public link) | publicAccess(docId) (0/1: the nearest page
  whose link reaches it, through live, unrestricted pages; expiry checked when the query runs) |
  outgoingLinks(sourceId, { icons? }) (icons: each target also has `icon`, its `icon` property)
  : StoreQuery<T> { name, sql, parameters, map, key, tables?, guard?: Guard, content?(row) }
  // guard { sql, parameters, tables }: see "Live queries: guards"; content: what a row holds for
  // keeping identity (default its JSON; getDoc uses the body version, not the Markdown)
ViewParams = { databaseId, viewId?, view?: { type?, config? }, window?: ViewWindow, me?, today? }
ViewItem = { kind: "row", key, row: ViewRow } | { kind: "group", key, group: ViewGroup }
         | { kind: "meta", key: "meta", total, offset, viewType }   // rows in order, groups, meta
compileView(ViewQuery), runViewQuery(read, ViewQuery), createViews(db), rowKey(row), localToday(),
createYjsStore(db), toBase64, fromBase64
toFtsQuery(text), toMentionQuery(phrases), DERIVED_TABLES

// "@lydie/store/react"
<StoreProvider store={store}>  (also provides PowerSyncContext)
useStore(), useStoreQuery(q), useTree, useChildren, useDoc, useSearch, useBacklinks, useBlockBacklinks,
useUnresolvedLinks, useUnlinkedMentions, useAttachments, useRows   // → { data, isLoading, error }
useDatabases(ws), useDatabase(id) (→ DatabaseDefinition | null), useView(ViewParams) (+ view),
useTeamspaces(ws), useMyAccess(docId)
useStoreStatus(): StoreStatus
// Unchanged rows keep object identity (wrap row components in memo).
```

Performance notes: paint the sidebar with `children` per expanded folder (or `listTree` with
`expanded`), not a watched full tree (a full-tree watcher re-runs ~90 ms per change at 15k docs).
Watched queries run unthrottled so an operation's repaint fits in a frame (see the bench).

## Schema

PowerSync tables (JSON-backed views). Synced in "synced" mode, local-only in "local" mode (columns match
the core's Postgres tables):

- `workspaces(id, name, image, created_by, created_at, updated_at)` (`image`: the workspace's
  picture, hosted only)
- `workspace_members(id, workspace_id, user_id, role, user_name, user_email, user_image, created_at,
  updated_at)`
- `teamspaces(id, workspace_id, name, description, icon, visibility, is_default, created_by, created_at,
  updated_at)`, `teamspace_members(id, workspace_id, teamspace_id, user_id, role, created_at)`,
  `access_scope_members(id, scope_id, workspace_id, level)`, `document_grants(id, workspace_id,
  document_id, principal_type, principal_id, level, scope_id, created_by, created_at, updated_at)`,
  `share_links(id, workspace_id, document_id, include_subpages, expires_at, scope_id, created_by,
  created_at, updated_at)` (public links without token or password; migration 11 is an empty step
  for it) — hosted only (the core's client schema); empty in local mode.
- `documents(id, workspace_id, parent_id, title, sort_key, properties JSON, created_at, updated_at,
  deleted_at, created_by, updated_by, teamspace_id, private_owner_id, restricted, scope_id)` — indexes
  (workspace_id, parent_id, sort_key), (parent_id). No deleted_at index on purpose (SQLite would prefer
  it over the tree index). The last four columns are hosted only.
- `databases(id = document id, workspace_id, config JSON, created_at, updated_at, deleted_at,
  created_by, updated_by)`, `database_properties(id, workspace_id, database_id, name, type, key, config
  JSON, sort_key, …authorship, deleted_at)`, `database_views(id, workspace_id, database_id, name, type,
  config JSON, sort_key, …authorship, deleted_at)` — see @lydie/contract's database entities.
- `links(id, workspace_id, source_id, source_block_id, target_id, target_ref, target_key,
  target_heading, target_block_id, kind, syntax)`
- `attachments(id, workspace_id, document_id, filename, content_type, size, sha256, status, created_at,
  updated_at, deleted_at, created_by, updated_by)` (`status` hosted only: pending | ready)

Always local-only PowerSync tables: `document_bodies(id = doc id, workspace_id, markdown, version,
updated_at)`, `operation_log(id UUID, operation, input, actor, session_id, workspace_id, created_at,
version)` (the upload queue), `yjs_updates`, `yjs_snapshots`, `file_index(id = doc id, workspace_id, path,
mtime, size, hash, lca, indexed_at)`.

Plain SQLite tables owned by the migrations (`PLAIN_TABLES`), device-only, never synced:
`op_history` (the history journal: every applied operation with inverse, touches, actor, session,
group; pruned after open, by `maintenance`, after 30 days / 50k rows), `activity` (the activity log, migration 9: id,
workspace_id, actor JSON, actor_ref, session_id, type, target_id, target_title, data JSON, count,
first_at, last_at; indexes `activity_key` for the coalescing lookup and `activity_recent`
(workspace_id, last_at, id) for the newest-first list; rows whose last change is older than
`activityRetentionDays` (default 180) are deleted by `maintenance`, per workspace through
`activity_recent` (the workspaces found by skipping along it); the runtime decides what is written,
see @lydie/runtime "Activity"), `blocks(doc_id, block_id, workspace_id, type, text,
ord)`, `attachment_uploads(id, state, error, attempts, updated_at)`, `doc_conflicts(id, workspace_id,
kind, details, detected_at)`, `device_layouts(id, state, updated_at)`.

Derived (rebuildable, maintained by triggers on PowerSync's internal tables): `search_map(rowid,
doc_id)`, `search_fts` (FTS5: title, body; `unicode61 remove_diacritics 2`), `doc_keys(doc_id,
workspace_id, key = lower(trim(title)))` for indexed link resolution, `doc_props(id, workspace_id,
parent_id, title, sort_key, props JSONB, created_at, updated_at, created_by, updated_by, deleted_at,
gram_text)` indexed by parent (database views), by (workspace_id, updated_at) (`recent`, no sort)
and, partially, trashed rows by workspace (`unresolvedLinks`); `doc_parent_versions(parent_id,
version)` and `doc_versions(id, version, body)`, change counters per parent and per document (row
and body apart; a delete bumps too, so they only grow). Plus `lydie_meta` (schema_version,
derived_version, derived_for). PowerSync reports no changes for tables that triggers write: a
query that reads one names `documents` in `tables`.

## Search

`queries.search` (and the `Search` port): FTS5 over title and body, every word as a prefix, bm25
with titles weighted 10. A title equal to the query (ASCII case, spaces trimmed; looked up in
`doc_keys`) scores 1e6 lower, so it comes first. When nothing matches, titles sharing at least
`SIMILAR_TITLE` (0.5) of the query's trigrams come back instead (`@lydie/runtime` `trigrams`,
pg_trgm-style), scored `1 - share`, with the title as the snippet. `doc_props.gram_text` holds the
title prepared so `instr()` finds exactly its trigrams; no per-trigram rows are written (a table
of them made every title write about 0.45 ms slower). The memory ports do the same
(`search.test.ts`). Cost at 16k documents: about 1 ms more on a matching query, 8–9 ms for the
fallback.

## Database views

`views.ts` compiles a view to one statement over `doc_props`: a materialised CTE of the filtered rows
(list values exploded through `json_each` when grouping by them) with group keys/ranks and sort keys,
then `GROUP BY` counts and the ordered window in one `UNION ALL`. Relation titles, rollups and formulas
are computed in JS for the window after one batched read of the related rows. Views that filter, sort or
group by a formula, a rollup or a raw Bases expression run `runView` (JS) over every row instead. The
semantics are @lydie/runtime's `runView`; `database.test.ts` checks 126 view cases against it. Why a
derived JSONB table: reading `json_extract` through PowerSync's views was 2–3× slower (prototype:
3.8 ms vs 9.8 ms for the same grouped window of 5k rows).

## Migrations

How PowerSync treats schema changes (docs read 2026-11-12: client schema, local-only usage, raw tables):

- PowerSync tables are views over JSON rows (`ps_data__<t>` synced, `ps_data_local__<t>` local-only),
  rebuilt from `createSchema()` at every open. **Adding or removing a column needs no migration**:
  old rows read `NULL` for a new column; a removed column's value stays in the JSON until that row is
  next written through the view, which drops it.
- **Changing a table between local-only and synced, or removing a local-only table from the schema,
  deletes its data** at the next open. Synced data of a removed synced table moves to `ps_untyped`.
  Declared indexes are created and dropped by PowerSync.
- Raw tables (and our plain tables) are not touched by PowerSync: we create and migrate them.
- Consequence: opening a database written by a newer app with an older schema would drop the newer
  local-only tables. So the version is checked **before** PowerSync opens the file: Node reads
  `lydie_meta.schema_version` with read-only better-sqlite3 (`readSchemaVersion`); the web keeps the
  version in `localStorage` per database file. A newer database raises `StoreVersionError` (code
  `newer_database`, "update Lydie"). `migrate` checks again inside its transaction.

`createStore` runs `migrate(db)` after `db.init()`: every pending migration, then the derived objects,
then `schema_version`, in **one write transaction**; any failure leaves the file as it was. An
up-to-date database is two reads (`readMeta`: the store's tables and triggers, and the recorded
versions); the derived objects are created only when missing or from another version.

Migration 8 rewrote every stored ULID as a UUID (ids changed spelling in November 2026): it walks
the PowerSync data tables and the plain tables row by row in JavaScript, leaves bodies alone and
drops `derived_version` so the derived tables are rebuilt.

Rules for migration authors (`src/migrations.ts`):

1. Append a `Migration` with the next `version` (1, 2, 3, …). Never edit, reorder or remove a released
   one; `migrations.test.ts` checks the numbering.
2. Make it idempotent: `CREATE … IF NOT EXISTS`, guarded `UPDATE … WHERE <old shape>`. A fixture or a
   half-applied database may already contain part of it.
3. Column added to a PowerSync table: no migration, just `createSchema()`. Reading code must accept
   `NULL` for old rows. Rename or reshape: add the new column in `createSchema()`, copy with a data
   migration, keep reading the old one until a later release.
4. Data transforms of synced tables write the internal table (`ctx.internal("links")`, e.g.
   `UPDATE … SET data = json_set(data, …)`), not the view: writing the view would queue the change for
   upload. Local-only tables may be written through the view.
5. Never flip a table between local-only and synced in place; add a new table and copy (plan §1).
6. Derived objects: change `derived.ts` and bump `DERIVED_VERSION`; they are rebuilt from the rows inside
   the migration transaction. Do not migrate them by hand.
7. Add a fixture test: `src/migrations/fixtures/v1.sqlite` is a database written by schema 1 (the first
   release); keep it, add a new fixture when a migration needs data the old fixtures lack, and assert the
   upgraded result in `migrations.test.ts`.

## Drivers

Node uses `better-sqlite3` 13 in PowerSync's worker threads; it works under Bun 1.4 (the test runner)
and Node 26. Tests run on temp files with the Node driver. The web driver runs in the web app's e2e
suites; `web.test.ts` covers its failure path with PowerSync's Node driver standing in.

### Web driver: OPFS (LYD-279)

- `vfs: "auto"` is PowerSync's SimpleOpfsVFS: two OPFS files, `powersync/<dbFilename>/database` and
  `.../journal` (rollback journal, `journal_mode = TRUNCATE`), held by one worker (nested in a shared
  worker where the browser allows it; otherwise `readwrite-unsafe` handles or close-and-reopen).
- PowerSync 2.7.0 bug: SQLite rolls back an interrupted write (tab or browser killed mid-write, a write
  that failed on a full disk) at the next open, before the connection is in TRUNCATE mode, so it
  deletes the journal; the VFS answers SQLITE_IOERR_DELETE and every open fails with "disk I/O
  error", for good. `src/vite.ts` (`powersyncOpfsFix`) patches the module at build time so the
  delete truncates the journal. It throws when PowerSync's source changes; `vite.test.ts` checks it
  against the installed version. Remove it once PowerSync fixes this upstream.
- Opening an up-to-date database writes nothing (`migrate` writes `schema_version` only when it
  changes), so a full disk still opens; writes then fail.
- A failed open never deletes or rewrites the files: `openWebStore` closes and retries, then throws
  `WebStoreOpenError`; the app offers `readWebDatabaseFiles` (save a copy) before anything else.

`openNodeStore` options:

- `workerUrl?: (url: URL) => URL` rewrites PowerSync's worker URL. `unpackedAsar` is the mapping
  packaged Electron needs.
- `readWorkers?` sets PowerSync's `readWorkerCount`. `transactions.test.ts` uses 1 to behave like the
  browser: every query operation must read inside its own transaction. `DbRead`/`DbTx` carry a
  transaction-bound `search` (`createSearchPort` accepts a transaction).

Upload queue: `createDbPort(db, { uploadQueue })`. Local stores (`mode: "local"`) do not append to
`operation_log` and clear it on open (LYD-169). The history journal is unaffected.

`links.source_property` holds the frontmatter property a link came from (null for body links).
`listTree(ws, { expanded: [] })` returns the top level only (`tree.test.ts`). It has not been checked in a browser.

`outgoingLinks(sourceId)` is available as `store.outgoingLinks`, `queries.outgoingLinks` (live) and
`links.outgoing` on the port. It returns a document's links in one query: body links first, then
property links, each in document order, with `target` resolved to a live document or null.

## Round 6 additions

- **Row templates (LYD-209):** rows whose id is in the database's `config.templateIds` are left out
  of every view, both SQL and JS (`ViewQuery.templateIds`). That covers rows, totals, group counts,
  and summaries and relation pickers, which read views. Templates stay ordinary documents.
  `queries.databaseTemplates(databaseId)` lists them (live) in config order.
- **View SQL:** the materialized `f` holds group keys (`g`, `sg`) and, for scalar sorts, the raw
  value (`s<i>`). Tiers, ranks and sort keys are derived from those while ordering, so each JSON
  value is read once per row. List and checkbox sorts keep `e<i>`/`k<i>`. Constant ordering terms
  are dropped: SQLite reads a bare integer as a column number.
- **Spaces:** `ChildEntry`/`TreeEntry` carry `teamspaceId`/`privateOwnerId` (null locally).
  `queries.children(ws, parentId, { teamspaceId?, privateOwnerId? })` and
  `listTree(ws, { teamspaceId?, privateOwnerId?, expanded? })` filter the listed top level by space
  (`teamspaceId: null` = no teamspace).
- **Schema checks:** `SYNCED_SCHEMA`, `describeSchema(schema)`, `schemaDrift(actual, expected?)` and
  `assertSyncedSchema(schemaOrDescription)` (`schema-description.ts`). A sync peer's client schema
  is tested against these.

## Live queries and writes (round 7)

- `store.live` and `liveView` re-run through `coalesce.ts`: runs never overlap, and changes during a
  run cause one more. An optional window (`watchThrottleMs`, per query `throttleMs`) gives
  leading-plus-trailing coalescing. It defaults to 0, because back-to-back edits must each repaint
  within a frame (benchmark "rename + watched repaint").
- A live database view re-runs on a document change only if the derived `doc_parent_versions`
  counter of its database, or of a relation target database, moved. Edits elsewhere (typing in a
  note) no longer re-run every open view. Triggers on the internal documents table bump the
  counter of the old and new parent.
- Bulk writes for indexing a folder: `docs.insertMany`, `bodies.putMany`, `links.replaceFromMany`,
  `links.resolveDanglingMany`, `blocks.replaceForMany`, `fileIndex.putMany`/`removeMany` (one or
  two statements each; `bulk.test.ts` checks them against the per-row versions).
- `openWebStore` accepts `CreateStoreOptions`.

## Live queries: guards

- Every live query of a store listens through one table listener (`changes.ts`), so a commit
  reaches them all in the same task.
- `StoreQuery.guard` is a scalar subquery over the change counters (`doc_versions`,
  `doc_parent_versions`) that moves whenever the query's rows may have. When only `guard.tables`
  changed, the live query reads its guard and re-runs only if the value moved; the guards of
  every query a commit touched are read in one statement. Any other table it reads re-runs it as
  before. The guard is not read before a full run, so the first guarded change after one runs it
  once more.
- Guarded: `getDoc` (the document, and its body when included), `children` (the parent and each
  child, for childCount), `listTree` with `expanded` (the root and the expanded documents),
  `outgoingLinks` (the targets), `backlinks`/`blockBacklinks` (the sources), `myAccess`,
  `databases` (the database documents). Typing in one note re-runs its `getDoc` and the queries
  that read every body (unlinked mentions, search), not every open tab and tree level
  (`live-guards.test.ts`; benchmark "updateBody + … live queries settle").
- A query with a guard must not depend on documents outside it: say why in the guard's comment.

## Threads

`threads(id, workspace_id, document_id, parent_id, kind, body, quote, quote_prefix, quote_suffix,
resolved_at, resolved_by, session_id, created_at, updated_at, deleted_at, created_by, updated_by)`,
synced (in `SYNCED_TABLES`), indexed by `(document_id, created_at)`. A reply has `parent_id`; the
anchor columns are null for a thread about the page. Migration 10 is an empty step for it.
`threads.test.ts` runs every thread operation on SQLite and on the memory ports and compares.
