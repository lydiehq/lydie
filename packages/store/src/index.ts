// Driver-neutral entry. Open a database with `@lydie/store/node` or `@lydie/store/web`; React
// bindings are in `@lydie/store/react`.
export { createSchema, PLAIN_TABLES, SYNCED_TABLES } from "./schema.ts";
export {
  assertSyncedSchema,
  describeSchema,
  schemaDrift,
  SYNCED_SCHEMA,
} from "./schema-description.ts";
export type { ColumnType, SchemaDescription, SchemaDrift } from "./schema-description.ts";
export type { AppSchema, StoreMode } from "./schema.ts";
export { createStore } from "./store.ts";
export type {
  AttachmentUpload,
  CreateStoreOptions,
  DocConflict,
  FileIndexEntry,
  LiveQuery,
  LiveState,
  Store,
  UploadState,
  WatchOptions,
} from "./store.ts";
export type { StoreStatus, SyncState } from "./status.ts";
export { syncStateOf } from "./status.ts";
export {
  attachments,
  backlinks,
  blockBacklinks,
  children,
  database,
  databaseProperties,
  databases,
  databaseTemplates,
  databaseViews,
  getDoc,
  grants,
  myAccess,
  outgoingLinks,
  teamspaceMembers,
  teamspaces,
  workspaceMembers,
  listTree,
  queries,
  recent,
  rows,
  search,
  toFtsQuery,
  toMentionQuery,
  unlinkedMentions,
  unresolvedLinks,
} from "./queries.ts";
export type {
  DatabaseSummary,
  PropertyFilter,
  PropertySort,
  RowsOptions,
  StoreQuery,
  TreeOptions,
} from "./queries.ts";
export type { DocWithBody } from "./rows.ts";
export { DERIVED_TABLES } from "./derived.ts";
export {
  MIGRATIONS,
  SCHEMA_VERSION,
  StoreVersionError,
  assertOpenable,
  migrate,
} from "./migrations.ts";
export type { Migration, MigrationContext } from "./migrations.ts";
export { createDbPort, createSearchPort } from "./ports.ts";
export type { DbPortOptions } from "./ports.ts";
export { createViews, localToday, rowKey } from "./live-view.ts";
export type { LiveView, ViewItem, ViewParams } from "./live-view.ts";
export { compileView, runViewQuery } from "./views.ts";
export { createYjsStore, fromBase64, toBase64 } from "./yjs.ts";
export type { YjsStore } from "./yjs.ts";
export type { CompiledView } from "./views.ts";
