import { splitUniqueId } from "@lydie/contract";
import type {
  Attachment,
  Backlink,
  ChildEntry,
  Database,
  DatabaseProperty,
  DatabaseView,
  Document,
  DocumentAccess,
  DocumentGrantRow,
  OutgoingLink,
  SearchHit,
  TeamspaceMemberRow,
  TeamspaceRow,
  ThreadRow,
  TreeEntry,
  UnlinkedMention,
  UnresolvedLink,
  WorkspaceMemberRow,
  WorkspaceRow,
} from "@lydie/contract";
import { asciiLower, queryTrigrams, SIMILAR_TITLE } from "@lydie/runtime";

import {
  ATTACHMENT_COLUMNS,
  DATABASE_COLUMNS,
  DOCUMENT_COLUMNS,
  documentColumns,
  PROPERTY_COLUMNS,
  THREAD_COLUMNS,
  toAttachment,
  toBacklink,
  toChildEntry,
  toDatabase,
  toDocument,
  toDocumentAccess,
  toDocWithBody,
  toGrant,
  toMention,
  toOutgoingLink,
  toProperty,
  toSearchHit,
  toTeamspace,
  toTeamspaceMember,
  toThreadRow,
  toTreeEntry,
  toUnresolvedLink,
  toView,
  toWorkspace,
  toWorkspaceMember,
  VIEW_COLUMNS,
} from "./rows.ts";
import type { DocWithBody } from "./rows.ts";

// A domain query: SQL, parameters and a row mapper. The same descriptor runs once (`store.query`),
// as a watched query (`store.watch`, `store.live`) and in React (`useStoreQuery`).
export type StoreQuery<T> = {
  readonly name: string;
  readonly sql: string;
  readonly parameters: readonly (string | number | null)[];
  readonly map: (row: Record<string, unknown>) => T;
  // Identity of a result row, so watched queries keep unchanged rows as the same object.
  readonly key: (row: T) => string;
  // Tables whose changes re-run the query, when SQLite cannot tell (full-text search).
  readonly tables?: readonly string[];
};

export type TreeOptions = {
  rootId?: string;
  includeDeleted?: boolean;
  // Only descend into these documents (plus the top level): what a sidebar with collapsed folders
  // shows, without reading the whole tree. Omit for the full tree.
  expanded?: readonly string[];
  // Hosted: only top-level documents in this space (a grouped sidebar shows one tree per space).
  // `teamspaceId: null` is "no teamspace" (private sections); descendants follow their parent.
  teamspaceId?: string | null;
  privateOwnerId?: string;
};

// Columns of the page's space (hosted; null locally).
const SPACE_COLUMNS = "d.teamspace_id AS teamspace_id, d.private_owner_id AS private_owner_id";

// Depth-first tree order. Each row carries the path of (sortKey, id) pairs from the top, so
// ordering by it yields parents before children and siblings in (sortKey, id) order.
// char(1) and char(2) sort below every key and id character.
export function treeSql(
  options: { expanded?: boolean; teamspace?: boolean; owner?: boolean } = {},
): string {
  return `
    WITH RECURSIVE tree(id, depth, path) AS (
      SELECT id, 0, sort_key || char(1) || id
      FROM documents
      WHERE workspace_id = ? AND parent_id IS ? AND (? OR deleted_at IS NULL)${
        options.teamspace ? " AND teamspace_id IS ?" : ""
      }${options.owner ? " AND private_owner_id = ?" : ""}
      UNION ALL
      SELECT d.id, t.depth + 1, t.path || char(2) || d.sort_key || char(1) || d.id
      FROM tree t JOIN documents d ON d.parent_id = t.id
      WHERE (? OR d.deleted_at IS NULL)${
        options.expanded ? " AND t.id IN (SELECT value FROM json_each(?))" : ""
      }
    )
    SELECT ${documentColumns("d")}, t.depth AS depth, ${SPACE_COLUMNS}
    FROM tree t JOIN documents d ON d.id = t.id
    ORDER BY t.path`;
}

export function treeParameters(workspaceId: string, options: TreeOptions = {}) {
  const all = options.includeDeleted ? 1 : 0;
  return [
    workspaceId,
    options.rootId ?? null,
    all,
    ...(options.teamspaceId !== undefined ? [options.teamspaceId] : []),
    ...(options.privateOwnerId !== undefined ? [options.privateOwnerId] : []),
    all,
    ...(options.expanded ? [JSON.stringify(options.expanded)] : []),
  ];
}

export function listTree(workspaceId: string, options: TreeOptions = {}): StoreQuery<TreeEntry> {
  return {
    name: "listTree",
    sql: treeSql({
      expanded: options.expanded !== undefined,
      teamspace: options.teamspaceId !== undefined,
      owner: options.privateOwnerId !== undefined,
    }),
    parameters: treeParameters(workspaceId, options),
    map: toTreeEntry,
    key: (e) => e.id,
  };
}

const childEntriesSelect = `
  SELECT ${documentColumns("d")}, ${SPACE_COLUMNS},
         (SELECT count(*) FROM documents c WHERE c.parent_id = d.id AND c.deleted_at IS NULL) AS child_count
  FROM documents d
  WHERE d.workspace_id = ? AND d.parent_id IS ? AND (? OR d.deleted_at IS NULL)`;

export const childEntriesSql = `${childEntriesSelect}
  ORDER BY d.sort_key, d.id`;

// One level of the tree, each child with its number of live children: enough to paint a collapsed
// sidebar. Watch one per expanded folder.
export function children(
  workspaceId: string,
  parentId: string | null,
  options: {
    includeDeleted?: boolean;
    // Hosted: only children in this space (see TreeOptions).
    teamspaceId?: string | null;
    privateOwnerId?: string;
  } = {},
): StoreQuery<ChildEntry> {
  const teamspace = options.teamspaceId !== undefined;
  const owner = options.privateOwnerId !== undefined;
  return {
    name: "children",
    sql: `${childEntriesSelect}${teamspace ? " AND d.teamspace_id IS ?" : ""}${
      owner ? " AND d.private_owner_id = ?" : ""
    }
  ORDER BY d.sort_key, d.id`,
    parameters: [
      workspaceId,
      parentId,
      options.includeDeleted ? 1 : 0,
      ...(teamspace ? [options.teamspaceId!] : []),
      ...(owner ? [options.privateOwnerId!] : []),
    ],
    map: toChildEntry,
    key: (e) => e.id,
  };
}

export function getDoc(
  id: string,
  options: { includeBody?: boolean } = {},
): StoreQuery<DocWithBody> {
  const withBody = options.includeBody ?? true;
  return {
    name: "getDoc",
    sql: withBody
      ? `SELECT ${documentColumns("d")}, b.markdown AS body_markdown, b.version AS body_version
         FROM documents d LEFT JOIN document_bodies b ON b.id = d.id WHERE d.id = ?`
      : `SELECT ${DOCUMENT_COLUMNS} FROM documents WHERE id = ?`,
    parameters: [id],
    map: toDocWithBody,
    key: (r) => r.document.id,
  };
}

// Live documents, most recently changed first (title, properties, place or body). Hosted: a
// collaborative edit does not touch `updated_at` until something else on the row changes.
export function recent(
  workspaceId: string,
  options: { limit?: number } = {},
): StoreQuery<Document> {
  return {
    name: "recent",
    sql: `SELECT ${DOCUMENT_COLUMNS} FROM documents
          WHERE workspace_id = ? AND deleted_at IS NULL
          ORDER BY updated_at DESC, id DESC
          LIMIT ?`,
    parameters: [workspaceId, options.limit ?? 20],
    map: toDocument,
    key: (d) => d.id,
  };
}

const BACKLINK_COLUMNS = `s.id AS source_id, s.title AS source_title, s.parent_id AS source_parent_id,
  s.workspace_id AS workspace_id, l.kind AS kind, l.syntax AS syntax, l.target_ref AS target_ref,
  l.source_block_id AS source_block_id, l.target_heading AS target_heading,
  l.target_block_id AS target_block_id, l.source_property AS source_property, l.id AS link_id`;

const backlinkKey = (b: Backlink) =>
  [
    b.source.id,
    b.kind,
    b.syntax,
    b.targetRef,
    b.targetHeading,
    b.targetBlockId,
    b.sourceBlockId,
    b.sourceProperty ?? "",
  ].join("\u0000");

export function backlinks(id: string): StoreQuery<Backlink> {
  return {
    name: "backlinks",
    sql: `SELECT ${BACKLINK_COLUMNS}
          FROM links l JOIN documents s ON s.id = l.source_id
          WHERE l.target_id = ? AND s.deleted_at IS NULL
          ORDER BY s.title, s.id, l.id`,
    parameters: [id],
    map: toBacklink,
    key: backlinkKey,
  };
}

export function blockBacklinks(id: string, blockId: string): StoreQuery<Backlink> {
  return {
    name: "blockBacklinks",
    sql: `SELECT ${BACKLINK_COLUMNS}
          FROM links l JOIN documents s ON s.id = l.source_id
          WHERE l.target_id = ? AND l.target_block_id = ? AND s.deleted_at IS NULL
          ORDER BY s.title, s.id, l.id`,
    parameters: [id, blockId],
    map: toBacklink,
    key: backlinkKey,
  };
}

// The links in one document as written, each with the live document it resolves to (null when
// it resolves to nothing or to the trash). Body links first, then property links; ids are minted in
// document order.
export function outgoingLinks(sourceId: string): StoreQuery<OutgoingLink> {
  return {
    name: "outgoingLinks",
    sql: `SELECT l.id AS link_id, l.kind AS kind, l.syntax AS syntax, l.target_ref AS target_ref,
                 l.target_heading AS target_heading, l.target_block_id AS target_block_id,
                 l.source_block_id AS source_block_id, l.source_property AS source_property,
                 t.id AS target_id, t.title AS target_title, t.parent_id AS target_parent_id,
                 t.workspace_id AS target_workspace_id
          FROM links l
          LEFT JOIN documents t ON t.id = l.target_id AND t.deleted_at IS NULL
          WHERE l.source_id = ?
          ORDER BY l.source_property IS NOT NULL, l.id`,
    parameters: [sourceId],
    map: toOutgoingLink,
    key: (l) => l.id,
  };
}

// Links in live documents whose target does not exist or is in the trash.
export function unresolvedLinks(workspaceId: string): StoreQuery<UnresolvedLink> {
  return {
    name: "unresolvedLinks",
    sql: `SELECT s.id AS source_id, s.title AS source_title, s.parent_id AS source_parent_id,
                 s.workspace_id AS workspace_id, l.kind AS kind, l.syntax AS syntax,
                 l.target_ref AS target_ref
          FROM links l
          JOIN documents s ON s.id = l.source_id
          LEFT JOIN documents t ON t.id = l.target_id
          WHERE l.workspace_id = ? AND s.deleted_at IS NULL
            AND (l.target_id IS NULL OR t.id IS NULL OR t.deleted_at IS NOT NULL)
          ORDER BY l.target_ref, s.title, s.id`,
    parameters: [workspaceId],
    map: toUnresolvedLink,
    key: (l) => `${l.source.id}\u0000${l.kind}\u0000${l.syntax}\u0000${l.targetRef}`,
  };
}

// Turns free text into an FTS5 query: every word must match, as a prefix. Quoting each word keeps
// user input from being read as FTS syntax.
export function toFtsQuery(text: string): string | null {
  const words = text.match(/[\p{L}\p{N}]+/gu);
  if (!words) return null;
  return words.map((w) => `"${w}"*`).join(" ");
}

// Body text containing any of the phrases, as whole words in order.
export function toMentionQuery(phrases: readonly string[]): string | null {
  const quoted = phrases
    .map((p) => p.match(/[\p{L}\p{N}]+/gu))
    .filter((words): words is RegExpMatchArray => words !== null)
    .map((words) => `"${words.join(" ")}"`);
  return quoted.length > 0 ? `body : (${quoted.join(" OR ")})` : null;
}

export function unlinkedMentions(
  workspaceId: string,
  targetId: string,
  phrases: readonly string[],
  options: { limit?: number } = {},
): StoreQuery<UnlinkedMention> {
  const match = toMentionQuery(phrases);
  return {
    name: "unlinkedMentions",
    sql: match
      ? `SELECT d.id AS source_id, d.title AS source_title, d.parent_id AS source_parent_id,
                d.workspace_id AS workspace_id,
                snippet(search_fts, 1, '<mark>', '</mark>', '…', 12) AS snippet
         FROM search_fts
         JOIN search_map m ON m.rowid = search_fts.rowid
         JOIN documents d ON d.id = m.doc_id
         WHERE search_fts MATCH ? AND d.workspace_id = ? AND d.deleted_at IS NULL AND d.id != ?
           AND d.id NOT IN (SELECT source_id FROM links WHERE target_id = ?)
         ORDER BY d.title, d.id
         LIMIT ?`
      : "SELECT NULL AS source_id WHERE 0",
    parameters: match ? [match, workspaceId, targetId, targetId, options.limit ?? 50] : [],
    map: toMention,
    key: (m) => m.source.id,
    tables: ["documents", "document_bodies", "links"],
  };
}

export function search(
  workspaceId: string,
  text: string,
  options: { limit?: number } = {},
): StoreQuery<SearchHit> {
  const match = toFtsQuery(text);
  const limit = options.limit ?? 20;
  // A title equal to the query comes first. Looked up in doc_keys (lower(trim(title))): reading
  // each match's title in the score doubled the time of a common word.
  const fts = `SELECT d.id AS id, d.title AS title,
                snippet(search_fts, -1, '<mark>', '</mark>', '…', 16) AS snippet,
                bm25(search_fts, 10.0, 1.0) - CASE WHEN d.id IN (
                  SELECT doc_id FROM doc_keys WHERE workspace_id = ? AND key = ?
                ) THEN 1e6 ELSE 0 END AS score
         FROM search_fts
         JOIN search_map m ON m.rowid = search_fts.rowid
         JOIN documents d ON d.id = m.doc_id
         WHERE search_fts MATCH ? AND d.workspace_id = ? AND d.deleted_at IS NULL`;
  const ftsParameters = [workspaceId, asciiLower(text.trim()), match, workspaceId];
  const id = splitUniqueId(text);
  // "LYD-12" also finds the row numbered 12 by a uniqueId property with prefix LYD, first.
  const hits = id
    ? `SELECT id, title, snippet, min(score) AS score FROM (
         SELECT d.id AS id, d.title AS title,
                '<mark>' || json_extract(p.config, '$.prefix') || '-' || ? || '</mark>' AS snippet,
                -1e9 AS score
         FROM database_properties p
         JOIN databases b ON b.id = p.database_id AND b.deleted_at IS NULL
         JOIN doc_props d ON d.parent_id = p.database_id
         WHERE p.type = 'uniqueId' AND p.deleted_at IS NULL AND p.workspace_id = ?
           AND lower(json_extract(p.config, '$.prefix')) = ? AND d.deleted_at IS NULL
           AND (d.props ->> ('$."' || replace(replace(p.key, '"', ''), '\\', '') || '"')) = ?
         UNION ALL ${fts})
       GROUP BY id`
    : fts;
  const hitParameters = id
    ? [String(id.n), workspaceId, id.prefix.toLowerCase(), id.n, ...ftsParameters]
    : ftsParameters;
  // When nothing matches, titles sharing enough trigrams with the query (doc_props.gram_text),
  // scored after any real match would be: as `@lydie/runtime`'s memory search and the hosted
  // core. The hits run twice (NOT EXISTS stops at the first one): a CTE used twice was 4× slower.
  const grams = queryTrigrams(text);
  const found = grams.map(() => "(instr(d.gram_text, ?) > 0)").join(" + ");
  return {
    name: "search",
    // A query that can never match keeps the descriptor watchable for empty input.
    sql: !match
      ? "SELECT NULL AS id WHERE 0"
      : `SELECT id, title, snippet, score FROM (
           SELECT * FROM (
             SELECT id, title, snippet, score, 0 AS len FROM (${hits}) ORDER BY score, id LIMIT ?)
           UNION ALL
           SELECT id, title, title, 1.0 - found * 1.0 / ?, length(title) FROM (
             SELECT d.id, d.title, ${found} AS found FROM doc_props d
             WHERE NOT EXISTS (${hits}) AND d.workspace_id = ? AND d.deleted_at IS NULL)
           WHERE found * 1.0 / ? >= ?)
         ORDER BY score, len, id
         LIMIT ?`,
    parameters: !match
      ? []
      : [
          ...hitParameters,
          limit,
          grams.length,
          ...grams,
          ...hitParameters,
          workspaceId,
          grams.length,
          SIMILAR_TITLE,
          limit,
        ],
    map: toSearchHit,
    key: (h) => h.id,
    tables: ["documents", "document_bodies", "database_properties"],
  };
}

export function attachments(
  workspaceId: string,
  options: { documentId?: string; includeDeleted?: boolean } = {},
): StoreQuery<Attachment> {
  return {
    name: "attachments",
    sql: `SELECT ${ATTACHMENT_COLUMNS} FROM attachments
          WHERE workspace_id = ? AND (? IS NULL OR document_id = ?) AND (? OR deleted_at IS NULL)
          ORDER BY created_at DESC, id DESC`,
    parameters: [
      workspaceId,
      options.documentId ?? null,
      options.documentId ?? null,
      options.includeDeleted ? 1 : 0,
    ],
    map: toAttachment,
    key: (a) => a.id,
  };
}

// A document's threads and replies (resolved ones included, deleted ones not), oldest first.
export function threads(documentId: string): StoreQuery<ThreadRow> {
  return {
    name: "threads",
    sql: `SELECT ${THREAD_COLUMNS} FROM threads
          WHERE document_id = ? AND deleted_at IS NULL
          ORDER BY created_at, id`,
    parameters: [documentId],
    map: toThreadRow,
    key: (t) => t.id,
  };
}

// ---- Rows of a "database": the children of one document, filtered and sorted by properties.

export type PropertyFilter = {
  key: string;
  op: "eq" | "neq" | "lt" | "lte" | "gt" | "gte" | "contains" | "isEmpty" | "isNotEmpty";
  value?: string | number | boolean | null;
};

export type PropertySort = { key: string; direction?: "asc" | "desc" };

export type RowsOptions = {
  filters?: readonly PropertyFilter[];
  sorts?: readonly PropertySort[];
  limit?: number;
  offset?: number;
};

const OPS: Record<Exclude<PropertyFilter["op"], "contains" | "isEmpty" | "isNotEmpty">, string> = {
  eq: "=",
  neq: "IS NOT",
  lt: "<",
  lte: "<=",
  gt: ">",
  gte: ">=",
};

// JSON path for a property key; keys are quoted so any characters are safe.
const path = (key: string) => `$."${key.replace(/["\\]/g, "")}"`;

export function rows(
  workspaceId: string,
  parentId: string,
  options: RowsOptions = {},
): StoreQuery<TreeEntry> {
  const where: string[] = [];
  const whereParams: (string | number | null)[] = [];
  const value = "json_extract(d.properties, ?)";
  for (const f of options.filters ?? []) {
    const p = path(f.key);
    if (f.op === "isEmpty") {
      where.push(`coalesce(${value}, '') = ''`);
      whereParams.push(p);
    } else if (f.op === "isNotEmpty") {
      where.push(`coalesce(${value}, '') != ''`);
      whereParams.push(p);
    } else if (f.op === "contains") {
      // Lists contain the value as an item; text contains it as a substring (case-insensitive).
      where.push(
        `(EXISTS (SELECT 1 FROM json_each(d.properties, ?) WHERE value = ?) OR instr(lower(${value}), lower(?)) > 0)`,
      );
      whereParams.push(p, toSql(f.value), p, toSql(f.value));
    } else {
      where.push(`${value} ${OPS[f.op]} ?`);
      whereParams.push(p, toSql(f.value));
    }
  }
  const order: string[] = [];
  const orderParams: string[] = [];
  for (const s of options.sorts ?? []) {
    // Empty values last in both directions.
    order.push(`${value} IS NULL, ${value} ${s.direction === "desc" ? "DESC" : "ASC"}`);
    orderParams.push(path(s.key), path(s.key));
  }
  return {
    name: "rows",
    sql: `SELECT ${documentColumns("d")}, 0 AS depth FROM documents d
          WHERE d.workspace_id = ? AND d.parent_id = ? AND d.deleted_at IS NULL
          ${where.map((w) => `AND ${w}`).join(" ")}
          ORDER BY ${[...order, "d.sort_key", "d.id"].join(", ")}
          LIMIT ? OFFSET ?`,
    parameters: [
      workspaceId,
      parentId,
      ...whereParams,
      ...orderParams,
      options.limit ?? -1,
      options.offset ?? 0,
    ],
    map: toTreeEntry,
    key: (e) => e.id,
  };
}

function toSql(value: PropertyFilter["value"]): string | number | null {
  if (typeof value === "boolean") return value ? 1 : 0;
  return value ?? null;
}

// ---- Databases (schema and views; rows come from Store.liveView / queryView)

export type DatabaseSummary = Database & { title: string; parentId: string | null };

const prefixed = (alias: string, columns: string) =>
  columns
    .split(", ")
    .map((c) => `${alias}.${c}`)
    .join(", ");

// Live databases of a workspace (database documents not in the trash), by title.
export function databases(workspaceId: string): StoreQuery<DatabaseSummary> {
  return {
    name: "databases",
    sql: `SELECT ${prefixed("x", DATABASE_COLUMNS)}, d.title AS title, d.parent_id AS parent_id
          FROM databases x JOIN documents d ON d.id = x.id
          WHERE x.workspace_id = ? AND x.deleted_at IS NULL AND d.deleted_at IS NULL
          ORDER BY d.title, x.id`,
    parameters: [workspaceId],
    map: (row) => ({
      ...toDatabase(row),
      title: String(row.title),
      parentId: (row.parent_id as string | null) ?? null,
    }),
    key: (d) => d.id,
  };
}

// Zero or one row: the database's settings (also while it is deleted).
export function database(id: string): StoreQuery<Database> {
  return {
    name: "database",
    sql: `SELECT ${DATABASE_COLUMNS} FROM databases WHERE id = ?`,
    parameters: [id],
    map: toDatabase,
    key: (d) => d.id,
  };
}

export function databaseProperties(
  databaseId: string,
  options: { includeDeleted?: boolean } = {},
): StoreQuery<DatabaseProperty> {
  return {
    name: "databaseProperties",
    sql: `SELECT ${PROPERTY_COLUMNS} FROM database_properties
          WHERE database_id = ? AND (? OR deleted_at IS NULL) ORDER BY sort_key, id`,
    parameters: [databaseId, options.includeDeleted ? 1 : 0],
    map: toProperty,
    key: (p) => p.id,
  };
}

export function databaseViews(
  databaseId: string,
  options: { includeDeleted?: boolean } = {},
): StoreQuery<DatabaseView> {
  return {
    name: "databaseViews",
    sql: `SELECT ${VIEW_COLUMNS} FROM database_views
          WHERE database_id = ? AND (? OR deleted_at IS NULL) ORDER BY sort_key, id`,
    parameters: [databaseId, options.includeDeleted ? 1 : 0],
    map: toView,
    key: (v) => v.id,
  };
}

// ---- Team and access (hosted; empty in local mode)

// Zero or one row.
export function workspace(workspaceId: string): StoreQuery<WorkspaceRow> {
  return {
    name: "workspace",
    sql: `SELECT id, name, image FROM workspaces WHERE id = ?`,
    parameters: [workspaceId],
    map: toWorkspace,
    key: (w) => w.id,
  };
}

export function workspaceMembers(workspaceId: string): StoreQuery<WorkspaceMemberRow> {
  return {
    name: "workspaceMembers",
    sql: `SELECT id, workspace_id, user_id, role, user_name, user_email, user_image, created_at, updated_at
          FROM workspace_members WHERE workspace_id = ? ORDER BY user_name, user_id`,
    parameters: [workspaceId],
    map: toWorkspaceMember,
    key: (m) => m.id,
  };
}

export function teamspaces(workspaceId: string): StoreQuery<TeamspaceRow> {
  return {
    name: "teamspaces",
    sql: `SELECT id, workspace_id, name, description, icon, visibility, is_default, created_by, created_at, updated_at
          FROM teamspaces WHERE workspace_id = ? ORDER BY name, id`,
    parameters: [workspaceId],
    map: toTeamspace,
    key: (t) => t.id,
  };
}

export function teamspaceMembers(teamspaceId: string): StoreQuery<TeamspaceMemberRow> {
  return {
    name: "teamspaceMembers",
    sql: `SELECT id, workspace_id, teamspace_id, user_id, role, created_at
          FROM teamspace_members WHERE teamspace_id = ? ORDER BY role DESC, user_id`,
    parameters: [teamspaceId],
    map: toTeamspaceMember,
    key: (m) => m.id,
  };
}

// A database's row templates (config.templateIds), in that order, live ones only (LYD-209).
export function databaseTemplates(databaseId: string): StoreQuery<Document> {
  return {
    name: "databaseTemplates",
    sql: `SELECT ${documentColumns("d")}
          FROM databases db, json_each(db.config, '$.templateIds') t
          JOIN documents d ON d.id = t.value
          WHERE db.id = ? AND d.deleted_at IS NULL
          ORDER BY t.key`,
    parameters: [databaseId],
    map: toDocument,
    key: (d) => d.id,
  };
}

// The grants on one document (not inherited ones; the core's share.get resolves those).
export function grants(documentId: string): StoreQuery<DocumentGrantRow> {
  return {
    name: "grants",
    sql: `SELECT id, workspace_id, document_id, principal_type, principal_id, level, scope_id, created_by, created_at, updated_at
          FROM document_grants WHERE document_id = ? ORDER BY created_at, id`,
    parameters: [documentId],
    map: toGrant,
    key: (g) => g.id,
  };
}

// Zero or one row: the document's space and the signed-in user's level in it (through its scope).
export function myAccess(documentId: string): StoreQuery<DocumentAccess> {
  return {
    name: "myAccess",
    sql: `SELECT d.id AS id, d.teamspace_id AS teamspace_id, d.private_owner_id AS private_owner_id,
                 d.restricted AS restricted, d.scope_id AS scope_id, a.level AS level
          FROM documents d LEFT JOIN access_scope_members a ON a.scope_id = d.scope_id
          WHERE d.id = ? LIMIT 1`,
    parameters: [documentId],
    map: toDocumentAccess,
    key: (a) => a.documentId,
  };
}

export const queries = {
  listTree,
  children,
  getDoc,
  recent,
  backlinks,
  blockBacklinks,
  outgoingLinks,
  unresolvedLinks,
  unlinkedMentions,
  search,
  attachments,
  threads,
  rows,
  databases,
  database,
  databaseProperties,
  databaseViews,
  workspace,
  workspaceMembers,
  teamspaces,
  teamspaceMembers,
  grants,
  myAccess,
  databaseTemplates,
};
