import { uuidsForUlids } from "@lydie/contract";
import type { CommonPowerSyncDatabase, LockContext } from "@powersync/common";

import { ensureDerivedIn, internalNames } from "./derived.ts";
import type { StoreMode } from "./schema.ts";

// Versioned migrations for the local database. PowerSync owns the views over its JSON tables and
// rebuilds them from the schema at every open, so adding or removing a column there needs no
// migration. Migrations cover everything else: plain tables (PLAIN_TABLES), data transforms, and
// then the derived search objects (derived.ts). See AGENTS.md, "Migrations", for the rules.

export type MigrationContext = {
  mode: StoreMode;
  // PowerSync's internal table behind a view, e.g. `ps_data_local__links`. Data transforms on
  // synced tables write here: writing through the view would queue the change for upload.
  internal(table: string): string;
};

export type Migration = {
  // 1, 2, 3, … in order, never reused or reordered.
  version: number;
  name: string;
  // Runs inside the open transaction, together with every other pending migration. Must be
  // idempotent (IF NOT EXISTS, guarded UPDATEs): a fixture or a half-written database may already
  // have part of it.
  up(tx: LockContext, ctx: MigrationContext): Promise<void>;
};

export class StoreVersionError extends Error {
  readonly code = "newer_database";
  constructor(
    readonly found: number,
    readonly supported: number,
  ) {
    super(
      `This database was written by a newer version of Lydie (schema ${found}; this version ` +
        `understands up to ${supported}). Update Lydie to open it.`,
    );
    this.name = "StoreVersionError";
  }
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "baseline: metadata table",
    async up(tx) {
      await tx.execute("CREATE TABLE IF NOT EXISTS lydie_meta (key TEXT PRIMARY KEY, value TEXT)");
    },
  },
  {
    version: 2,
    name: "device tables: history journal, blocks, uploads, conflicts, layouts",
    async up(tx) {
      // Every applied operation, kept after upload so agent sessions can be listed and undone.
      await tx.execute(`CREATE TABLE IF NOT EXISTS op_history (
        id TEXT PRIMARY KEY,
        operation TEXT NOT NULL,
        input TEXT NOT NULL,
        inverse TEXT,
        touches TEXT NOT NULL,
        actor TEXT NOT NULL,
        session_id TEXT,
        group_id TEXT NOT NULL,
        scope TEXT,
        workspace_id TEXT,
        created_at TEXT NOT NULL,
        undone_at TEXT
      )`);
      await tx.execute(
        "CREATE INDEX IF NOT EXISTS op_history_session ON op_history (session_id, id) WHERE session_id IS NOT NULL",
      );
      // Blocks with a ^id, derived from bodies by the runtime's extractor.
      await tx.execute(`CREATE TABLE IF NOT EXISTS blocks (
        doc_id TEXT NOT NULL,
        block_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        type TEXT NOT NULL,
        text TEXT NOT NULL,
        ord INTEGER NOT NULL,
        PRIMARY KEY (doc_id, block_id)
      ) WITHOUT ROWID`);
      // Upload state of attachment bytes (id = attachment id).
      await tx.execute(`CREATE TABLE IF NOT EXISTS attachment_uploads (
        id TEXT PRIMARY KEY,
        state TEXT NOT NULL CHECK (state IN ('local', 'uploading', 'uploaded', 'failed')),
        error TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )`);
      // Documents whose sync or file reconciliation needs the user (id = document id).
      await tx.execute(`CREATE TABLE IF NOT EXISTS doc_conflicts (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        details TEXT,
        detected_at TEXT NOT NULL
      )`);
      // Window/tab layout per device (never synced).
      await tx.execute(`CREATE TABLE IF NOT EXISTS device_layouts (
        id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`);
    },
  },
  {
    version: 3,
    name: "links: split kind into kind (link|embed) and syntax (wikilink|markdown)",
    async up(tx, ctx) {
      const links = ctx.internal("links");
      await tx.execute(`UPDATE ${links} SET data = json_set(data,
          '$.kind', CASE json_extract(data, '$.kind') WHEN 'embed' THEN 'embed' ELSE 'link' END,
          '$.syntax', CASE json_extract(data, '$.kind') WHEN 'markdown' THEN 'markdown' ELSE 'wikilink' END)
        WHERE json_extract(data, '$.kind') IN ('wikilink', 'markdown')
           OR (json_extract(data, '$.kind') = 'embed' AND json_extract(data, '$.syntax') IS NULL)`);
    },
  },
  {
    version: 4,
    // The new tables are PowerSync tables (no SQL needed) and doc_props is derived (rebuilt by
    // DERIVED_VERSION). The version bump matters on its own: an older app must refuse this file,
    // or opening it would drop the local-only tables it does not know (the databases' schemas).
    name: "databases and team tables; doc_props for database views",
    async up() {},
  },
  {
    version: 5,
    // `notifications` is a PowerSync table (no SQL). Its marks are device-only: what this device
    // asked the hosted workspace to change, shown until the synced row agrees. Removed by version 7.
    name: "notifications inbox and its pending marks",
    async up(tx) {
      await tx.execute(`CREATE TABLE IF NOT EXISTS notification_marks (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        read INTEGER,
        archived INTEGER,
        marked_at TEXT NOT NULL
      )`);
    },
  },
  {
    version: 6,
    // Added for a `comments` table that was removed again. Kept: databases that opened at version 6
    // must stay openable, and an empty step changes nothing.
    name: "comments",
    async up() {},
  },
  {
    version: 7,
    // The notifications inbox was removed. PowerSync handles the `notifications` table leaving the
    // schema (its internal table and the triggers on it); the device-only marks are ours to drop.
    name: "remove the notifications inbox",
    async up(tx) {
      await tx.execute("DROP TRIGGER IF EXISTS lydie_notification_marks_insert");
      await tx.execute("DROP TRIGGER IF EXISTS lydie_notification_marks_update");
      await tx.execute("DROP TABLE IF EXISTS notification_marks");
    },
  },
  {
    version: 8,
    // Ids were ULIDs; they are the same 128 bits spelt as UUIDs now (`@lydie/contract` ids.ts).
    // Every row that names one is rewritten here, in JavaScript: SQLite cannot turn base32 into
    // hex. Bodies are left alone (text people wrote; links by id read both spellings), and the
    // derived tables are rebuilt from the rewritten rows.
    name: "ids: ULIDs rewritten as UUIDs",
    async up(tx, ctx) {
      const bodies = ctx.internal("document_bodies");
      const tables = await tx.getAll<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type = 'table'
           AND (name LIKE 'ps\\_data\\_%' ESCAPE '\\' OR name IN (${REWRITTEN_PLAIN.map(() => "?").join(", ")}))`,
        [...REWRITTEN_PLAIN],
      );
      for (const { name } of tables) {
        const info = await tx.getAll<{ name: string; pk: number }>(`PRAGMA table_info("${name}")`);
        const key = info.filter((c) => c.pk > 0).map((c) => c.name);
        if (key.length === 0) continue;
        const columns = info.map((c) => c.name).filter((c) => !(name === bodies && c === "data"));
        const rows = await tx.getAll<Record<string, unknown>>(
          `SELECT ${columns.map((c) => `"${c}"`).join(", ")} FROM "${name}"`,
        );
        for (const row of rows) {
          const changed = columns.filter(
            (c) => typeof row[c] === "string" && uuidsForUlids(row[c]) !== row[c],
          );
          if (changed.length === 0) continue;
          await tx.execute(
            `UPDATE "${name}" SET ${changed.map((c) => `"${c}" = ?`).join(", ")}
               WHERE ${key.map((c) => `"${c}" IS ?`).join(" AND ")}`,
            [...changed.map((c) => uuidsForUlids(row[c] as string)), ...key.map((c) => row[c])],
          );
        }
      }
      await tx.execute("DELETE FROM lydie_meta WHERE key = 'derived_version'");
    },
  },
  {
    version: 9,
    // The workspace activity log (@lydie/runtime activity.ts): coalesced rows people read, unlike
    // op_history. Device-only; pruned at open (store.ts).
    name: "activity log",
    async up(tx) {
      await tx.execute(`CREATE TABLE IF NOT EXISTS activity (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        actor TEXT NOT NULL,
        actor_ref TEXT NOT NULL,
        session_id TEXT,
        type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        target_title TEXT,
        data TEXT NOT NULL,
        count INTEGER NOT NULL,
        first_at TEXT NOT NULL,
        last_at TEXT NOT NULL
      )`);
      // The coalescing lookup (newest row for one key) and the newest-first list.
      await tx.execute(
        "CREATE INDEX IF NOT EXISTS activity_key ON activity (workspace_id, target_id, type, actor_ref, session_id, last_at)",
      );
      await tx.execute(
        "CREATE INDEX IF NOT EXISTS activity_recent ON activity (workspace_id, last_at, id)",
      );
    },
  },
  {
    version: 10,
    // `threads` is a PowerSync table (no SQL). The bump keeps an older app from opening the file
    // and dropping a table it does not know.
    name: "threads: notes and comments beside a document",
    async up() {},
  },
  {
    version: 11,
    // `share_links` is a PowerSync table (no SQL); bumped for the same reason as 10.
    name: "share_links: which pages are on the web",
    async up() {},
  },
];

// Plain tables that name ids (the derived ones are rebuilt instead).
const REWRITTEN_PLAIN = [
  "op_history",
  "blocks",
  "attachment_uploads",
  "doc_conflicts",
  "device_layouts",
];

export const SCHEMA_VERSION = MIGRATIONS.at(-1)!.version;

export async function storedVersion(tx: LockContext): Promise<number> {
  const meta = await tx.getOptional(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lydie_meta'",
  );
  if (!meta) return 0;
  const rows = await tx.getAll<{ key: string; value: string }>(
    "SELECT key, value FROM lydie_meta WHERE key IN ('schema_version', 'derived_version')",
  );
  const values = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  if (values.schema_version !== undefined) return Number(values.schema_version);
  // Databases from before versioning have only the derived search tables: that is version 1.
  return values.derived_version !== undefined ? 1 : 0;
}

export function assertOpenable(found: number, supported = SCHEMA_VERSION): void {
  if (found > supported) throw new StoreVersionError(found, supported);
}

// Brings the database to SCHEMA_VERSION, then makes sure the derived objects are current, all in
// one transaction: a failure leaves the database exactly as it was.
export async function migrate(
  db: CommonPowerSyncDatabase,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<{ from: number; to: number }> {
  checkOrder(migrations);
  const names = internalNames(db);
  const mode: StoreMode = names.documents.startsWith("ps_data_local__") ? "local" : "synced";
  const ctx: MigrationContext = {
    mode,
    internal(table) {
      const found = db.schema.tables.find((t) => t.name === table);
      if (!found) throw new Error(`No "${table}" table in the schema`);
      return found.internalName;
    },
  };
  const latest = migrations.at(-1)?.version ?? 0;
  return db.writeTransaction(async (tx) => {
    const from = await storedVersion(tx);
    assertOpenable(from, latest);
    for (const migration of migrations) {
      if (migration.version <= from) continue;
      await migration.up(tx, ctx);
    }
    await tx.execute("CREATE TABLE IF NOT EXISTS lydie_meta (key TEXT PRIMARY KEY, value TEXT)");
    // Written only when it changes: opening an up-to-date database writes nothing, so it still
    // opens (read-only in effect) when the disk is full (LYD-279).
    const recorded = await tx.getOptional<{ value: string }>(
      "SELECT value FROM lydie_meta WHERE key = 'schema_version'",
    );
    if (recorded?.value !== String(latest)) {
      await tx.execute(
        "INSERT OR REPLACE INTO lydie_meta(key, value) VALUES ('schema_version', ?)",
        [String(latest)],
      );
    }
    await ensureDerivedIn(tx, names);
    return { from, to: latest };
  });
}

function checkOrder(migrations: readonly Migration[]): void {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new Error(`Migration "${m.name}" has version ${m.version}; expected ${i + 1}`);
    }
  });
}
