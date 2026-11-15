import { column, Schema, Table } from "@powersync/common";

// "local": every table is local-only (nothing enters PowerSync's upload queue); the file bridge or
// the browser database is the only peer. "synced": the shared tables sync with the core.
// Switching an existing database between modes makes PowerSync drop the affected tables' data, so
// attaching a vault to the cloud is an explicit migration (plan §1, "Caveats").
export type StoreMode = "local" | "synced";

export const SYNCED_TABLES = [
  "workspaces",
  "workspace_members",
  "teamspaces",
  "teamspace_members",
  "access_scope_members",
  "documents",
  "document_grants",
  "links",
  "attachments",
  "threads",
  "databases",
  "database_properties",
  "database_views",
] as const;

export function createSchema(mode: StoreMode = "local") {
  const shared = { localOnly: mode === "local" };
  const local = { localOnly: true };
  return new Schema({
    // ---- Shared with the core (Postgres has the same columns).
    workspaces: new Table(
      {
        name: column.text,
        image: column.text,
        created_by: column.text,
        created_at: column.text,
        updated_at: column.text,
      },
      shared,
    ),
    workspace_members: new Table(
      {
        workspace_id: column.text,
        user_id: column.text,
        role: column.text,
        user_name: column.text,
        user_email: column.text,
        user_image: column.text,
        created_at: column.text,
        updated_at: column.text,
      },
      { ...shared, indexes: { workspace: ["workspace_id"] } },
    ),
    // Team and sharing tables of the hosted core (empty in local mode).
    teamspaces: new Table(
      {
        workspace_id: column.text,
        name: column.text,
        description: column.text,
        icon: column.text,
        // "open" | "closed" | "private"
        visibility: column.text,
        is_default: column.integer,
        created_by: column.text,
        created_at: column.text,
        updated_at: column.text,
      },
      { ...shared, indexes: { workspace: ["workspace_id"] } },
    ),
    teamspace_members: new Table(
      {
        workspace_id: column.text,
        teamspace_id: column.text,
        user_id: column.text,
        // "owner" | "member"
        role: column.text,
        created_at: column.text,
      },
      { ...shared, indexes: { teamspace: ["teamspace_id"] } },
    ),
    // The signed-in user's access level per scope; documents.scope_id joins to it.
    access_scope_members: new Table(
      { scope_id: column.text, workspace_id: column.text, level: column.text },
      { ...shared, indexes: { scope: ["scope_id"] } },
    ),
    document_grants: new Table(
      {
        workspace_id: column.text,
        document_id: column.text,
        // "user" | "teamspace" | "workspace"
        principal_type: column.text,
        principal_id: column.text,
        // "view" | "comment" | "edit" | "full"
        level: column.text,
        scope_id: column.text,
        created_by: column.text,
        created_at: column.text,
        updated_at: column.text,
      },
      { ...shared, indexes: { document: ["document_id"] } },
    ),
    documents: new Table(
      {
        workspace_id: column.text,
        parent_id: column.text,
        title: column.text,
        sort_key: column.text,
        // JSON object of typed frontmatter values.
        properties: column.text,
        created_at: column.text,
        updated_at: column.text,
        deleted_at: column.text,
        // ActorRef (see @lydie/contract): a user id, or agent:… / system:….
        created_by: column.text,
        updated_by: column.text,
        // Hosted only: the page's space (teamspace xor private section), whether it cuts off
        // inherited access, and its access scope (see access_scope_members).
        teamspace_id: column.text,
        private_owner_id: column.text,
        restricted: column.integer,
        scope_id: column.text,
      },
      {
        ...shared,
        // No index on deleted_at: SQLite would prefer it for every "deleted_at IS NULL" filter
        // over the tree index. The trash view scans the workspace instead.
        indexes: { tree: ["workspace_id", "parent_id", "sort_key"], parent: ["parent_id"] },
      },
    ),
    links: new Table(
      {
        workspace_id: column.text,
        source_id: column.text,
        target_id: column.text,
        target_ref: column.text,
        // Normalised target for title-based resolution (see `linkKey` in @lydie/runtime).
        target_key: column.text,
        target_heading: column.text,
        target_block_id: column.text,
        source_block_id: column.text,
        // The frontmatter property a link comes from (a [[link]] or relation value); null in the body.
        source_property: column.text,
        // "link" | "embed" (older rows: "wikilink" | "markdown" | "embed", read as links).
        kind: column.text,
        // "wikilink" | "markdown"
        syntax: column.text,
      },
      {
        ...shared,
        indexes: {
          source: ["source_id"],
          target: ["target_id"],
          key: ["workspace_id", "target_key"],
        },
      },
    ),

    // Attachment metadata; the bytes are in the Blob port under sha256.
    attachments: new Table(
      {
        workspace_id: column.text,
        document_id: column.text,
        filename: column.text,
        content_type: column.text,
        size: column.integer,
        sha256: column.text,
        // Hosted: "pending" until the bytes are uploaded, then "ready". Null locally.
        status: column.text,
        created_at: column.text,
        updated_at: column.text,
        deleted_at: column.text,
        created_by: column.text,
        updated_by: column.text,
      },
      {
        ...shared,
        indexes: {
          workspace: ["workspace_id", "created_at"],
          document: ["document_id"],
          sha: ["sha256"],
        },
      },
    ),

    // Notes and comments beside a document: one row per thread and per reply (parent_id set).
    // The anchor is the quoted passage and the text around it; all three null for the page.
    threads: new Table(
      {
        workspace_id: column.text,
        document_id: column.text,
        parent_id: column.text,
        kind: column.text,
        body: column.text,
        quote: column.text,
        quote_prefix: column.text,
        quote_suffix: column.text,
        resolved_at: column.text,
        resolved_by: column.text,
        session_id: column.text,
        created_at: column.text,
        updated_at: column.text,
        deleted_at: column.text,
        created_by: column.text,
        updated_by: column.text,
      },
      { ...shared, indexes: { document: ["document_id", "created_at"] } },
    ),

    // Databases (see @lydie/contract's database entities). id = the database document's id.
    databases: new Table(
      {
        workspace_id: column.text,
        // JSON DatabaseConfig: filter for every view, row templates, unknown .base keys.
        config: column.text,
        created_at: column.text,
        updated_at: column.text,
        deleted_at: column.text,
        created_by: column.text,
        updated_by: column.text,
      },
      { ...shared, indexes: { workspace: ["workspace_id"] } },
    ),
    database_properties: new Table(
      {
        workspace_id: column.text,
        database_id: column.text,
        name: column.text,
        type: column.text,
        key: column.text,
        // JSON PropertyConfig.
        config: column.text,
        sort_key: column.text,
        created_at: column.text,
        updated_at: column.text,
        deleted_at: column.text,
        created_by: column.text,
        updated_by: column.text,
      },
      { ...shared, indexes: { database: ["database_id", "sort_key"] } },
    ),
    database_views: new Table(
      {
        workspace_id: column.text,
        database_id: column.text,
        name: column.text,
        type: column.text,
        // JSON ViewConfig.
        config: column.text,
        sort_key: column.text,
        created_at: column.text,
        updated_at: column.text,
        deleted_at: column.text,
        created_by: column.text,
        updated_by: column.text,
      },
      { ...shared, indexes: { database: ["database_id", "sort_key"] } },
    ),

    // ---- Device-only.
    // Markdown body per document (id = document id). In local mode a cache of the file; never synced.
    document_bodies: new Table(
      {
        workspace_id: column.text,
        markdown: column.text,
        version: column.text,
        updated_at: column.text,
      },
      local,
    ),
    // Applied mutations awaiting upload (ids are minted in order, so id order is application order).
    operation_log: new Table(
      {
        operation: column.text,
        input: column.text,
        actor: column.text,
        session_id: column.text,
        workspace_id: column.text,
        created_at: column.text,
        version: column.text,
      },
      local,
    ),
    // Locally persisted Yjs updates (base64) and merged snapshots (id = document id).
    yjs_updates: new Table(
      { doc_id: column.text, data: column.text, created_at: column.text },
      { ...local, indexes: { doc: ["doc_id"] } },
    ),
    // dirty = 1: local edits the server has not acknowledged (see yjs.ts). state may be null for a
    // row that only carries the flag.
    yjs_snapshots: new Table(
      { state: column.text, dirty: column.integer, updated_at: column.text },
      { ...local, indexes: { dirty: ["dirty"] } },
    ),
    // File bridge bookkeeping (id = document id): path ⇄ id, change detection, last-agreed base.
    file_index: new Table(
      {
        workspace_id: column.text,
        path: column.text,
        mtime: column.integer,
        size: column.integer,
        hash: column.text,
        lca: column.text,
        indexed_at: column.text,
      },
      { ...local, indexes: { path: ["workspace_id", "path"] } },
    ),
  });
}

export type AppSchema = ReturnType<typeof createSchema>;

// Device-only tables that are plain SQLite tables, created and changed by the migrations in
// `migrations.ts` (not PowerSync views): they need real columns and indexes, and are never synced.
export const PLAIN_TABLES = [
  "op_history",
  "activity",
  "blocks",
  "doc_keys",
  "attachment_uploads",
  "doc_conflicts",
  "device_layouts",
] as const;
