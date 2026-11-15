import { TRIGRAM_SEPARATORS } from "@lydie/runtime";
import type { CommonPowerSyncDatabase, LockContext } from "@powersync/common";

// Derived tables live outside the PowerSync schema: plain SQLite objects maintained by triggers on
// PowerSync's internal tables (the pattern from PowerSync's full-text search guide). They are pure
// functions of the documents and bodies, so they can always be dropped and rebuilt.
//
// search_map gives each document a stable FTS rowid. PowerSync may rewrite rows of its internal
// tables (with new rowids) while syncing, so the FTS table must not reuse those rowids.
// doc_keys holds each document's lower-cased title, indexed, for link resolution.
// doc_props mirrors every document's columns with its properties as JSONB, indexed by parent: the
// table database views query (2–3× faster than parsing the JSON text through PowerSync's views).
// Its gram_text is the title prepared for search's typo fallback (see gramText).

// Bump when the derived objects change shape; the next open rebuilds them (inside the migration
// transaction, see migrations.ts).
const DERIVED_VERSION = 5;

// The title as @lydie/runtime's `trigrams` sees it, as one string: ASCII lower-case (lower()),
// separators as spaces, and every word padded "  word " with a "|" between words. A query trigram
// (never "|", never only spaces) occurs in it exactly when it is one of the title's trigrams, so
// the fallback counts them with instr() and no table of trigrams has to be written per title.
function gramText(title: string): string {
  let normal = `lower(coalesce(${title}, ''))`;
  for (const separator of TRIGRAM_SEPARATORS) {
    normal = `replace(${normal}, char(${separator.codePointAt(0)}), ' ')`;
  }
  return `'  ' || replace(${normal}, ' ', ' |  ') || ' '`;
}

export const DERIVED_TABLES = [
  "search_fts",
  "search_map",
  "doc_keys",
  "doc_props",
  "doc_parent_versions",
] as const;

export type InternalNames = { documents: string; bodies: string };

export function internalNames(db: CommonPowerSyncDatabase): InternalNames {
  const find = (name: string) => {
    const table = db.schema.tables.find((t) => t.name === name);
    if (!table) throw new Error(`The database schema has no "${name}" table; use createSchema()`);
    return table.internalName;
  };
  return { documents: find("documents"), bodies: find("document_bodies") };
}

// SQLite's lower() folds ASCII only; the store matches non-ASCII keys in JS (see ports.ts).
const titleKey = (data: string) => `lower(trim(coalesce(json_extract(${data}, '$.title'), '')))`;

function triggerStatements({ documents, bodies }: InternalNames): string[] {
  const rowid = (idExpr: string) => `(SELECT rowid FROM search_map WHERE doc_id = ${idExpr})`;
  const bodyOf = (idExpr: string) =>
    `coalesce((SELECT json_extract(data, '$.markdown') FROM ${bodies} WHERE id = ${idExpr}), '')`;
  const indexDoc = `
    INSERT OR IGNORE INTO search_map(doc_id) VALUES (NEW.id);
    DELETE FROM search_fts WHERE rowid = ${rowid("NEW.id")};
    INSERT INTO search_fts(rowid, title, body)
      VALUES (${rowid("NEW.id")}, coalesce(json_extract(NEW.data, '$.title'), ''), ${bodyOf("NEW.id")});`;
  const keyDoc = `
    INSERT OR REPLACE INTO doc_keys(doc_id, workspace_id, key)
      VALUES (NEW.id, json_extract(NEW.data, '$.workspace_id'), ${titleKey("NEW.data")});`;
  const field = (name: string) => `json_extract(NEW.data, '$.${name}')`;
  const props = `CASE WHEN json_valid(${field("properties")}) THEN jsonb(${field("properties")}) ELSE jsonb('{}') END`;
  const propsDoc = `
    INSERT OR REPLACE INTO doc_props(id, workspace_id, parent_id, title, sort_key, props, created_at,
      updated_at, created_by, updated_by, deleted_at, gram_text)
    VALUES (NEW.id, ${field("workspace_id")}, ${field("parent_id")}, coalesce(${field("title")}, ''),
      coalesce(${field("sort_key")}, ''), ${props}, ${field("created_at")}, ${field("updated_at")},
      ${field("created_by")}, ${field("updated_by")}, ${field("deleted_at")}, ${gramText(field("title"))});`;
  const setBody = (value: string, idExpr: string) => `
    UPDATE search_fts SET body = ${value} WHERE rowid = ${rowid(idExpr)};`;
  return [
    `CREATE TRIGGER IF NOT EXISTS lydie_search_doc_insert AFTER INSERT ON ${documents}
     BEGIN ${indexDoc} ${keyDoc} END`,
    `CREATE TRIGGER IF NOT EXISTS lydie_search_doc_update AFTER UPDATE ON ${documents}
     WHEN json_extract(OLD.data, '$.title') IS NOT json_extract(NEW.data, '$.title')
     BEGIN ${indexDoc} ${keyDoc} END`,
    `CREATE TRIGGER IF NOT EXISTS lydie_search_doc_delete AFTER DELETE ON ${documents}
     BEGIN
       DELETE FROM search_fts WHERE rowid = ${rowid("OLD.id")};
       DELETE FROM search_map WHERE doc_id = OLD.id;
       DELETE FROM doc_keys WHERE doc_id = OLD.id;
       DELETE FROM doc_props WHERE id = OLD.id;
     END`,
    `CREATE TRIGGER IF NOT EXISTS lydie_props_doc_insert AFTER INSERT ON ${documents}
     BEGIN ${propsDoc} END`,
    `CREATE TRIGGER IF NOT EXISTS lydie_props_doc_update AFTER UPDATE ON ${documents}
     WHEN OLD.data IS NOT NEW.data
     BEGIN ${propsDoc} END`,
    // A counter per parent ("" = top level), bumped by every change to one of its children: a live
    // database view re-runs only when its rows (or related rows) changed, not on every document
    // write in the workspace. Only differences matter, so it starts empty on a rebuild.
    `CREATE TRIGGER IF NOT EXISTS lydie_parent_doc_insert AFTER INSERT ON ${documents}
     BEGIN ${bumpParent("NEW")} END`,
    `CREATE TRIGGER IF NOT EXISTS lydie_parent_doc_update AFTER UPDATE ON ${documents}
     WHEN OLD.data IS NOT NEW.data
     BEGIN ${bumpParent("OLD")} ${bumpParent("NEW")} END`,
    `CREATE TRIGGER IF NOT EXISTS lydie_parent_doc_delete AFTER DELETE ON ${documents}
     BEGIN ${bumpParent("OLD")} END`,
    `CREATE TRIGGER IF NOT EXISTS lydie_search_body_insert AFTER INSERT ON ${bodies}
     BEGIN ${setBody("coalesce(json_extract(NEW.data, '$.markdown'), '')", "NEW.id")} END`,
    `CREATE TRIGGER IF NOT EXISTS lydie_search_body_update AFTER UPDATE ON ${bodies}
     BEGIN ${setBody("coalesce(json_extract(NEW.data, '$.markdown'), '')", "NEW.id")} END`,
    `CREATE TRIGGER IF NOT EXISTS lydie_search_body_delete AFTER DELETE ON ${bodies}
     BEGIN ${setBody("''", "OLD.id")} END`,
  ];
}

const bumpParent = (row: "NEW" | "OLD") => `
    INSERT INTO doc_parent_versions(parent_id, version)
      VALUES (coalesce(json_extract(${row}.data, '$.parent_id'), ''), 1)
      ON CONFLICT(parent_id) DO UPDATE SET version = version + 1;`;

const TRIGGERS = [
  "lydie_parent_doc_insert",
  "lydie_parent_doc_update",
  "lydie_parent_doc_delete",
  "lydie_search_doc_insert",
  "lydie_search_doc_update",
  "lydie_search_doc_delete",
  "lydie_search_body_insert",
  "lydie_search_body_update",
  "lydie_search_body_delete",
  "lydie_props_doc_insert",
  "lydie_props_doc_update",
];

async function create(tx: LockContext, names: InternalNames): Promise<void> {
  await tx.execute(
    "CREATE TABLE IF NOT EXISTS doc_parent_versions (parent_id TEXT PRIMARY KEY, version INTEGER NOT NULL) WITHOUT ROWID",
  );
  await tx.execute(
    "CREATE TABLE IF NOT EXISTS search_map (rowid INTEGER PRIMARY KEY, doc_id TEXT NOT NULL UNIQUE)",
  );
  await tx.execute(
    `CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
       title, body, tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3')`,
  );
  await tx.execute(
    "CREATE TABLE IF NOT EXISTS doc_keys (doc_id TEXT PRIMARY KEY, workspace_id TEXT, key TEXT NOT NULL) WITHOUT ROWID",
  );
  await tx.execute("CREATE INDEX IF NOT EXISTS doc_keys_key ON doc_keys (workspace_id, key)");
  await tx.execute(
    `CREATE TABLE IF NOT EXISTS doc_props (
       id TEXT PRIMARY KEY, workspace_id TEXT, parent_id TEXT, title TEXT NOT NULL,
       sort_key TEXT NOT NULL, props BLOB NOT NULL, created_at TEXT, updated_at TEXT,
       created_by TEXT, updated_by TEXT, deleted_at TEXT, gram_text TEXT NOT NULL) WITHOUT ROWID`,
  );
  await tx.execute("CREATE INDEX IF NOT EXISTS doc_props_parent ON doc_props (parent_id)");
  for (const sql of triggerStatements(names)) await tx.execute(sql);
}

async function drop(tx: LockContext): Promise<void> {
  for (const name of TRIGGERS) await tx.execute(`DROP TRIGGER IF EXISTS ${name}`);
  for (const name of DERIVED_TABLES) await tx.execute(`DROP TABLE IF EXISTS ${name}`);
}

async function populate(tx: LockContext, names: InternalNames): Promise<void> {
  await tx.execute("INSERT INTO search_map(doc_id) SELECT id FROM documents");
  await tx.execute(
    `INSERT INTO search_fts(rowid, title, body)
     SELECT m.rowid, coalesce(d.title, ''), coalesce(b.markdown, '')
     FROM documents d
     JOIN search_map m ON m.doc_id = d.id
     LEFT JOIN document_bodies b ON b.id = d.id`,
  );
  await tx.execute(
    `INSERT INTO doc_keys(doc_id, workspace_id, key)
     SELECT id, json_extract(data, '$.workspace_id'), ${titleKey("data")} FROM ${names.documents}`,
  );
  await tx.execute(
    `INSERT INTO doc_props(id, workspace_id, parent_id, title, sort_key, props, created_at,
       updated_at, created_by, updated_by, deleted_at, gram_text)
     SELECT id, workspace_id, parent_id, coalesce(title, ''), coalesce(sort_key, ''),
       CASE WHEN json_valid(properties) THEN jsonb(properties) ELSE jsonb('{}') END,
       created_at, updated_at, created_by, updated_by, deleted_at, ${gramText("title")}
     FROM documents`,
  );
}

async function rebuildIn(tx: LockContext, names: InternalNames): Promise<void> {
  await drop(tx);
  await create(tx, names);
  await populate(tx, names);
  await tx.execute(
    "INSERT OR REPLACE INTO lydie_meta(key, value) VALUES ('derived_version', ?), ('derived_for', ?)",
    [String(DERIVED_VERSION), names.documents],
  );
}

// Creates the derived objects, and rebuilds them if they are missing, from an older version, or were
// built for the other mode's internal tables. Runs inside the migration transaction.
export async function ensureDerivedIn(tx: LockContext, names: InternalNames): Promise<void> {
  await tx.execute("CREATE TABLE IF NOT EXISTS lydie_meta (key TEXT PRIMARY KEY, value TEXT)");
  const rows = await tx.getAll<{ key: string; value: string }>(
    "SELECT key, value FROM lydie_meta WHERE key IN ('derived_version', 'derived_for')",
  );
  const meta = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const exists = await tx.getOptional(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'search_fts'",
  );
  if (
    !exists ||
    meta.derived_version !== String(DERIVED_VERSION) ||
    meta.derived_for !== names.documents
  ) {
    await rebuildIn(tx, names);
  } else {
    await create(tx, names);
  }
}

export async function rebuildDerived(db: CommonPowerSyncDatabase): Promise<void> {
  const names = internalNames(db);
  await db.writeTransaction((tx) => rebuildIn(tx, names));
}
