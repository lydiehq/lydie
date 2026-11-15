import { actorRef } from "@lydie/contract";
import { linkKey } from "@lydie/runtime";
import type {
  ActivityRead,
  ActivityWrite,
  AttachmentPatch,
  AttachmentsRead,
  AttachmentsWrite,
  BlocksRead,
  BlocksWrite,
  BodiesRead,
  BodiesWrite,
  DatabasePatch,
  DatabasesRead,
  DatabasesWrite,
  Db,
  DbRead,
  DbTx,
  DocPatch,
  DocsRead,
  DocsWrite,
  HistoryRead,
  HistoryWrite,
  LinksRead,
  LinksWrite,
  OperationLog,
  PropertyPatch,
  Search,
  ThreadPatch,
  ThreadsRead,
  ThreadsWrite,
  ViewPatch,
} from "@lydie/runtime";
import type { CommonPowerSyncDatabase, LockContext } from "@powersync/common";

import {
  backlinks,
  blockBacklinks,
  childEntriesSql,
  outgoingLinks,
  search as searchQuery,
  treeParameters,
  treeSql,
  unlinkedMentions,
  unresolvedLinks,
} from "./queries.ts";
import {
  ACTIVITY_COLUMNS,
  ATTACHMENT_COLUMNS,
  DATABASE_COLUMNS,
  DOCUMENT_COLUMNS,
  documentColumns,
  HISTORY_COLUMNS,
  PROPERTY_COLUMNS,
  THREAD_COLUMNS,
  toActivity,
  toAttachment,
  toBlock,
  toChildEntry,
  toDatabase,
  toDocument,
  toHistoryRow,
  toHistorySession,
  toLinkRow,
  toProperty,
  toThreadRow,
  toTreeEntry,
  toView,
  VIEW_COLUMNS,
} from "./rows.ts";
import { runViewQuery } from "./views.ts";

// Writes go to PowerSync's views (never the internal tables) so the same statements work with sync
// on, where PowerSync turns them into upload-queue entries. Views report `rowsAffected` as 0, hence
// `RETURNING` where we need to know whether a row changed. Device-only plain tables (op_history,
// blocks, attachment_uploads) are written directly. Lists of values travel as one JSON parameter
// (`json_each`) so a batch is one statement.

type Row = Record<string, unknown>;

const PATCH_COLUMNS: Record<keyof DocPatch, string> = {
  parentId: "parent_id",
  title: "title",
  sortKey: "sort_key",
  properties: "properties",
  updatedAt: "updated_at",
  deletedAt: "deleted_at",
  updatedBy: "updated_by",
};

const ATTACHMENT_PATCH: Record<keyof AttachmentPatch, string> = {
  deletedAt: "deleted_at",
  updatedAt: "updated_at",
  updatedBy: "updated_by",
};

const THREAD_PATCH: Record<keyof Omit<ThreadPatch, "anchor">, string> = {
  body: "body",
  resolvedAt: "resolved_at",
  resolvedBy: "resolved_by",
  updatedAt: "updated_at",
  updatedBy: "updated_by",
  deletedAt: "deleted_at",
};

const ASCII = /^\p{ASCII}*$/u;
const json = (value: unknown) => JSON.stringify(value);

function docsRead(tx: LockContext): DocsRead {
  const one = async (sql: string, params: unknown[]) => {
    const row = await tx.getOptional<Row>(sql, params);
    return row ? toDocument(row) : null;
  };
  const docs: DocsRead = {
    get: (id) => one(`SELECT ${DOCUMENT_COLUMNS} FROM documents WHERE id = ?`, [id]),
    async children(workspaceId, parentId, options) {
      const rows = await tx.getAll<Row>(
        `SELECT ${DOCUMENT_COLUMNS} FROM documents
         WHERE workspace_id = ? AND parent_id IS ? AND (? OR deleted_at IS NULL)
         ORDER BY sort_key, id`,
        [workspaceId, parentId, options?.includeDeleted ? 1 : 0],
      );
      return rows.map(toDocument);
    },
    async childEntries(workspaceId, parentId, options) {
      const rows = await tx.getAll<Row>(childEntriesSql, [
        workspaceId,
        parentId,
        options?.includeDeleted ? 1 : 0,
      ]);
      return rows.map(toChildEntry);
    },
    async descendants(id) {
      const rows = await tx.getAll<Row>(
        `WITH RECURSIVE sub(id) AS (
           SELECT id FROM documents WHERE parent_id = ?
           UNION ALL
           SELECT d.id FROM documents d JOIN sub ON d.parent_id = sub.id
         )
         SELECT ${documentColumns("d")} FROM sub JOIN documents d ON d.id = sub.id`,
        [id],
      );
      return rows.map(toDocument);
    },
    async ancestors(id) {
      const rows = await tx.getAll<Row>(
        `WITH RECURSIVE up(id, n) AS (
           SELECT parent_id, 1 FROM documents WHERE id = ?
           UNION ALL
           SELECT d.parent_id, up.n + 1 FROM documents d JOIN up ON d.id = up.id WHERE up.n < 1000
         )
         SELECT ${documentColumns("d")} FROM up JOIN documents d ON d.id = up.id ORDER BY up.n`,
        [id],
      );
      return rows.map(toDocument);
    },
    async tree(workspaceId, options) {
      const rows = await tx.getAll<Row>(treeSql(), treeParameters(workspaceId, options));
      return rows.map(toTreeEntry);
    },
    async findByLinkKey(workspaceId, key) {
      return (await docs.findAllByLinkKey!(workspaceId, key))[0] ?? null;
    },
    async findAllByLinkKey(workspaceId, key) {
      // doc_keys holds lower(trim(title)), indexed. SQLite's lower() only folds ASCII, so
      // non-ASCII keys (and titles ending in ".md") are matched in JS against a workspace scan.
      const rows = ASCII.test(key)
        ? await tx.getAll<Row>(
            `SELECT ${documentColumns("d")} FROM doc_keys k JOIN documents d ON d.id = k.doc_id
             WHERE k.workspace_id = ? AND k.key IN (?, ?) AND d.deleted_at IS NULL
             ORDER BY d.sort_key, d.id`,
            [workspaceId, key, `${key}.md`],
          )
        : await tx.getAll<Row>(
            `SELECT ${DOCUMENT_COLUMNS} FROM documents
             WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY sort_key, id`,
            [workspaceId],
          );
      return rows.map(toDocument).filter((d) => linkKey(d.title) === key);
    },
    async slotKeys(workspaceId, parentId, anchor, excludeId) {
      const scope = `workspace_id = ? AND parent_id IS ? AND deleted_at IS NULL AND id IS NOT ?`;
      const params = [workspaceId, parentId, excludeId ?? null];
      const key = async (sql: string, extra: unknown[]) =>
        (await tx.getOptional<{ k: string | null }>(sql, [...params, ...extra]))?.k ?? null;
      if ("end" in anchor) {
        return {
          lower: await key(`SELECT max(sort_key) AS k FROM documents WHERE ${scope}`, []),
          upper: null,
        };
      }
      const anchorId = "afterId" in anchor ? anchor.afterId : anchor.beforeId;
      const at = await key(`SELECT sort_key AS k FROM documents WHERE ${scope} AND id = ?`, [
        anchorId,
      ]);
      if (at === null) return null;
      if ("afterId" in anchor) {
        const upper = await key(
          `SELECT min(sort_key) AS k FROM documents WHERE ${scope} AND sort_key > ?`,
          [at],
        );
        return { lower: at, upper };
      }
      const lower = await key(
        `SELECT max(sort_key) AS k FROM documents WHERE ${scope} AND sort_key < ?`,
        [at],
      );
      return { lower, upper: at };
    },
    async getMany(ids) {
      if (ids.length === 0) return [];
      const rows = await tx.getAll<Row>(
        `SELECT ${DOCUMENT_COLUMNS} FROM documents WHERE id IN (SELECT value FROM json_each(?))`,
        [json(ids)],
      );
      return rows.map(toDocument);
    },
    async trashed(workspaceId) {
      const roots = (
        await tx.getAll<Row>(
          `SELECT ${documentColumns("d")} FROM documents d
           LEFT JOIN documents p ON p.id = d.parent_id
           WHERE d.workspace_id = ? AND d.deleted_at IS NOT NULL
             AND (p.id IS NULL OR p.deleted_at IS NOT d.deleted_at)
           ORDER BY d.deleted_at DESC, d.id`,
          [workspaceId],
        )
      ).map(toDocument);
      const out = [];
      for (const root of roots) {
        const counted = await tx.getOptional<{ n: number }>(
          `WITH RECURSIVE sub(id) AS (
             SELECT id FROM documents WHERE parent_id = ? AND deleted_at = ?
             UNION ALL
             SELECT d.id FROM documents d JOIN sub ON d.parent_id = sub.id WHERE d.deleted_at = ?
           )
           SELECT count(*) AS n FROM sub`,
          [root.id, root.deletedAt, root.deletedAt],
        );
        out.push({ ...root, descendantCount: Number(counted?.n ?? 0) });
      }
      return out;
    },
  };
  return docs;
}

function docsWrite(tx: LockContext): DocsWrite {
  return {
    async insert(doc) {
      await tx.execute(
        `INSERT INTO documents (${DOCUMENT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          doc.id,
          doc.workspaceId,
          doc.parentId,
          doc.title,
          doc.sortKey,
          json(doc.properties),
          doc.createdAt,
          doc.updatedAt,
          doc.deletedAt,
          doc.createdBy ?? null,
          doc.updatedBy ?? null,
        ],
      );
    },
    async insertMany(docs) {
      if (docs.length === 0) return;
      await tx.execute(
        `INSERT INTO documents (${DOCUMENT_COLUMNS})
         SELECT value ->> 'id', value ->> 'workspaceId', value ->> 'parentId', value ->> 'title',
                value ->> 'sortKey', value ->> 'properties', value ->> 'createdAt',
                value ->> 'updatedAt', value ->> 'deletedAt', value ->> 'createdBy',
                value ->> 'updatedBy'
         FROM json_each(?)`,
        [
          json(
            docs.map((d) => ({
              ...d,
              properties: json(d.properties),
              createdBy: d.createdBy ?? null,
              updatedBy: d.updatedBy ?? null,
            })),
          ),
        ],
      );
    },
    async update(id, patch) {
      const entries = Object.entries(patch) as [keyof DocPatch, unknown][];
      if (entries.length === 0) return;
      const sets = entries.map(([key]) => `${PATCH_COLUMNS[key]} = ?`).join(", ");
      const values = entries.map(([key, value]) =>
        key === "properties" ? json(value) : (value ?? null),
      );
      await tx.execute(`UPDATE documents SET ${sets} WHERE id = ?`, [...values, id]);
    },
    async updateMany(updates) {
      if (updates.length === 0) return;
      // One statement per distinct set of columns (bulk property edits share one).
      const groups = new Map<string, { id: string; patch: DocPatch }[]>();
      for (const u of updates) {
        const key = Object.keys(u.patch).sort().join(",");
        groups.set(key, [...(groups.get(key) ?? []), u]);
      }
      for (const group of groups.values()) {
        const columns = Object.keys(group[0]!.patch) as (keyof DocPatch)[];
        if (columns.length === 0) continue;
        const sets = columns.map((c) => `${PATCH_COLUMNS[c]} = u.value ->> '$.${c}'`).join(", ");
        const values = group.map((u) => ({
          id: u.id,
          ...Object.fromEntries(
            columns.map((c) => [c, c === "properties" ? json(u.patch[c]) : (u.patch[c] ?? null)]),
          ),
        }));
        await tx.execute(
          `UPDATE documents SET ${sets}
           FROM (SELECT value ->> '$.id' AS id, value FROM json_each(?)) AS u
           WHERE documents.id = u.id`,
          [json(values)],
        );
      }
    },
    async purge(ids) {
      const list = json(ids);
      const each = "(SELECT value FROM json_each(?))";
      await tx.execute(`DELETE FROM database_properties WHERE database_id IN ${each}`, [list]);
      await tx.execute(`DELETE FROM database_views WHERE database_id IN ${each}`, [list]);
      await tx.execute(`DELETE FROM databases WHERE id IN ${each}`, [list]);
      await tx.execute(`DELETE FROM links WHERE source_id IN ${each}`, [list]);
      await tx.execute(`UPDATE links SET target_id = NULL WHERE target_id IN ${each}`, [list]);
      await tx.execute(`DELETE FROM document_bodies WHERE id IN ${each}`, [list]);
      await tx.execute(`DELETE FROM blocks WHERE doc_id IN ${each}`, [list]);
      await tx.execute(`DELETE FROM yjs_updates WHERE doc_id IN ${each}`, [list]);
      await tx.execute(`DELETE FROM yjs_snapshots WHERE id IN ${each}`, [list]);
      await tx.execute(`DELETE FROM doc_conflicts WHERE id IN ${each}`, [list]);
      await tx.execute(`DELETE FROM documents WHERE id IN ${each}`, [list]);
    },
  };
}

function bodiesRead(tx: LockContext): BodiesRead {
  return {
    async get(id) {
      const row = await tx.getOptional<{ markdown: string; version: string }>(
        "SELECT markdown, version FROM document_bodies WHERE id = ?",
        [id],
      );
      return row ? { markdown: row.markdown ?? "", version: row.version } : null;
    },
  };
}

function bodiesWrite(tx: LockContext): BodiesWrite {
  return {
    async put(id, workspaceId, body, updatedAt) {
      const updated = await tx.execute(
        `UPDATE document_bodies SET workspace_id = ?, markdown = ?, version = ?, updated_at = ?
         WHERE id = ? RETURNING id`,
        [workspaceId, body.markdown, body.version, updatedAt, id],
      );
      if ((updated.rows?.length ?? 0) > 0) return;
      await tx.execute(
        `INSERT INTO document_bodies (id, workspace_id, markdown, version, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [id, workspaceId, body.markdown, body.version, updatedAt],
      );
    },
    async putMany(bodies) {
      if (bodies.length === 0) return;
      const rows = json(
        bodies.map((b) => ({
          id: b.id,
          workspaceId: b.workspaceId,
          markdown: b.body.markdown,
          version: b.body.version,
          updatedAt: b.updatedAt,
        })),
      );
      // Existing bodies are updated, the others inserted: two statements for any number.
      await tx.execute(
        `UPDATE document_bodies SET (workspace_id, markdown, version, updated_at) = (
           SELECT value ->> 'workspaceId', value ->> 'markdown', value ->> 'version', value ->> 'updatedAt'
           FROM json_each(?) WHERE value ->> 'id' = document_bodies.id)
         WHERE id IN (SELECT value ->> 'id' FROM json_each(?))`,
        [rows, rows],
      );
      await tx.execute(
        `INSERT INTO document_bodies (id, workspace_id, markdown, version, updated_at)
         SELECT value ->> 'id', value ->> 'workspaceId', value ->> 'markdown', value ->> 'version',
                value ->> 'updatedAt'
         FROM json_each(?) WHERE value ->> 'id' NOT IN (SELECT id FROM document_bodies)`,
        [rows],
      );
    },
  };
}

const LINK_COLUMNS =
  "id, workspace_id, source_id, target_id, target_ref, target_key, target_heading, target_block_id, source_block_id, kind, syntax, source_property";

function linksRead(tx: LockContext): LinksRead {
  const run = async <T>(q: { sql: string; parameters: readonly unknown[]; map: (r: Row) => T }) =>
    (await tx.getAll<Row>(q.sql, [...q.parameters])).map(q.map);
  return {
    backlinks: (targetId) => run(backlinks(targetId)),
    blockBacklinks: (targetId, blockId) => run(blockBacklinks(targetId, blockId)),
    async from(sourceId) {
      const rows = await tx.getAll<Row>(`SELECT ${LINK_COLUMNS} FROM links WHERE source_id = ?`, [
        sourceId,
      ]);
      return rows.map(toLinkRow);
    },
    outgoing: (sourceId) => run(outgoingLinks(sourceId)),
    unresolved: (workspaceId) => run(unresolvedLinks(workspaceId)),
  };
}

function linksWrite(tx: LockContext): LinksWrite {
  return {
    async replaceFrom(sourceId, links) {
      await tx.execute("DELETE FROM links WHERE source_id = ?", [sourceId]);
      if (links.length === 0) return;
      await tx.execute(
        `INSERT INTO links (${LINK_COLUMNS})
         SELECT value ->> 'id', value ->> 'workspaceId', value ->> 'sourceId', value ->> 'targetId',
                value ->> 'targetRef', value ->> 'targetKey', value ->> 'targetHeading',
                value ->> 'targetBlockId', value ->> 'sourceBlockId', value ->> 'kind',
                value ->> 'syntax', value ->> 'sourceProperty'
         FROM json_each(?)`,
        [json(links)],
      );
    },
    async replaceFromMany(entries) {
      if (entries.length === 0) return;
      await tx.execute("DELETE FROM links WHERE source_id IN (SELECT value FROM json_each(?))", [
        json(entries.map((e) => e.sourceId)),
      ]);
      const all = entries.flatMap((e) => e.links);
      if (all.length === 0) return;
      await tx.execute(
        `INSERT INTO links (${LINK_COLUMNS})
         SELECT value ->> 'id', value ->> 'workspaceId', value ->> 'sourceId', value ->> 'targetId',
                value ->> 'targetRef', value ->> 'targetKey', value ->> 'targetHeading',
                value ->> 'targetBlockId', value ->> 'sourceBlockId', value ->> 'kind',
                value ->> 'syntax', value ->> 'sourceProperty'
         FROM json_each(?)`,
        [json(all)],
      );
    },
    async resolveDanglingMany(workspaceId, targets) {
      if (targets.length === 0) return;
      const list = json(targets);
      await tx.execute(
        `UPDATE links SET target_id = (
           SELECT value ->> 'targetId' FROM json_each(?) WHERE value ->> 'key' = links.target_key
           ORDER BY key LIMIT 1)
         WHERE workspace_id = ? AND target_id IS NULL
           AND target_key IN (SELECT value ->> 'key' FROM json_each(?))`,
        [list, workspaceId, list],
      );
    },
    async resolveDangling(workspaceId, key, targetId) {
      await tx.execute(
        `UPDATE links SET target_id = ?
         WHERE workspace_id = ? AND target_id IS NULL AND target_key = ?`,
        [targetId, workspaceId, key],
      );
    },
  };
}

function blocks(tx: LockContext): BlocksRead & BlocksWrite {
  return {
    async list(docId) {
      const rows = await tx.getAll<Row>(
        "SELECT doc_id, block_id, type, text, ord FROM blocks WHERE doc_id = ? ORDER BY ord",
        [docId],
      );
      return rows.map(toBlock);
    },
    async replaceFor(docId, workspaceId, list) {
      await tx.execute("DELETE FROM blocks WHERE doc_id = ?", [docId]);
      if (list.length === 0) return;
      // A duplicated ^id keeps its first block, as Obsidian does.
      await tx.execute(
        `INSERT OR IGNORE INTO blocks (doc_id, block_id, workspace_id, type, text, ord)
         SELECT ?, value ->> 'blockId', ?, value ->> 'type', value ->> 'text', value ->> 'order'
         FROM json_each(?)`,
        [docId, workspaceId, json(list)],
      );
    },
    async replaceForMany(entries) {
      if (entries.length === 0) return;
      await tx.execute("DELETE FROM blocks WHERE doc_id IN (SELECT value FROM json_each(?))", [
        json(entries.map((e) => e.docId)),
      ]);
      const all = entries.flatMap((e) =>
        e.blocks.map((b) => ({ ...b, docId: e.docId, workspaceId: e.workspaceId })),
      );
      if (all.length === 0) return;
      await tx.execute(
        `INSERT OR IGNORE INTO blocks (doc_id, block_id, workspace_id, type, text, ord)
         SELECT value ->> 'docId', value ->> 'blockId', value ->> 'workspaceId', value ->> 'type',
                value ->> 'text', value ->> 'order'
         FROM json_each(?)`,
        [json(all)],
      );
    },
  };
}

function attachments(tx: LockContext): AttachmentsRead & AttachmentsWrite {
  return {
    async get(id) {
      const row = await tx.getOptional<Row>(
        `SELECT ${ATTACHMENT_COLUMNS} FROM attachments WHERE id = ?`,
        [id],
      );
      return row ? toAttachment(row) : null;
    },
    async list(workspaceId, options) {
      const rows = await tx.getAll<Row>(
        `SELECT ${ATTACHMENT_COLUMNS} FROM attachments
         WHERE workspace_id = ? AND (? IS NULL OR document_id = ?) AND (? OR deleted_at IS NULL)
         ORDER BY created_at DESC, id DESC`,
        [
          workspaceId,
          options?.documentId ?? null,
          options?.documentId ?? null,
          options?.includeDeleted ? 1 : 0,
        ],
      );
      return rows.map(toAttachment);
    },
    async countBySha256(sha256) {
      const row = await tx.getOptional<{ n: number }>(
        "SELECT count(*) AS n FROM attachments WHERE sha256 = ?",
        [sha256],
      );
      return Number(row?.n ?? 0);
    },
    async insert(a) {
      await tx.execute(
        `INSERT INTO attachments (${ATTACHMENT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          a.id,
          a.workspaceId,
          a.documentId,
          a.filename,
          a.contentType,
          a.size,
          a.sha256,
          a.createdAt,
          a.updatedAt,
          a.deletedAt,
          a.createdBy ?? null,
          a.updatedBy ?? null,
        ],
      );
      await tx.execute(
        `INSERT OR IGNORE INTO attachment_uploads (id, state, attempts, updated_at)
         VALUES (?, 'local', 0, ?)`,
        [a.id, a.createdAt],
      );
    },
    async update(id, patch) {
      const entries = Object.entries(patch) as [keyof AttachmentPatch, unknown][];
      if (entries.length === 0) return;
      const sets = entries.map(([key]) => `${ATTACHMENT_PATCH[key]} = ?`).join(", ");
      await tx.execute(`UPDATE attachments SET ${sets} WHERE id = ?`, [
        ...entries.map(([, v]) => v ?? null),
        id,
      ]);
    },
    async purge(id) {
      await tx.execute("DELETE FROM attachments WHERE id = ?", [id]);
      await tx.execute("DELETE FROM attachment_uploads WHERE id = ?", [id]);
    },
  };
}

function threads(tx: LockContext): ThreadsRead & ThreadsWrite {
  return {
    async get(id) {
      const row = await tx.getOptional<Row>(`SELECT ${THREAD_COLUMNS} FROM threads WHERE id = ?`, [
        id,
      ]);
      return row ? toThreadRow(row) : null;
    },
    async list(documentId, options) {
      const rows = await tx.getAll<Row>(
        `SELECT ${THREAD_COLUMNS} FROM threads
         WHERE document_id = ? AND (? OR deleted_at IS NULL)
         ORDER BY created_at, id`,
        [documentId, options?.includeDeleted ? 1 : 0],
      );
      return rows.map(toThreadRow);
    },
    async insert(t) {
      await tx.execute(
        `INSERT INTO threads (${THREAD_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          t.id,
          t.workspaceId,
          t.documentId,
          t.parentId,
          t.kind,
          t.body,
          t.anchor?.quote ?? null,
          t.anchor?.prefix ?? null,
          t.anchor?.suffix ?? null,
          t.resolvedAt,
          t.resolvedBy,
          t.sessionId,
          t.createdAt,
          t.updatedAt,
          t.deletedAt,
          t.createdBy,
          t.updatedBy,
        ],
      );
    },
    async update(id, patch) {
      const { anchor, ...rest } = patch;
      const sets: [string, unknown][] = (
        Object.entries(rest) as [keyof typeof THREAD_PATCH, unknown][]
      ).map(([key, value]) => [THREAD_PATCH[key], value ?? null]);
      if (anchor !== undefined) {
        sets.push(
          ["quote", anchor?.quote ?? null],
          ["quote_prefix", anchor?.prefix ?? null],
          ["quote_suffix", anchor?.suffix ?? null],
        );
      }
      if (sets.length === 0) return;
      await tx.execute(
        `UPDATE threads SET ${sets.map(([column]) => `${column} = ?`).join(", ")} WHERE id = ?`,
        [...sets.map(([, value]) => value), id],
      );
    },
    async purgeFor(documentIds) {
      for (const documentId of documentIds) {
        await tx.execute("DELETE FROM threads WHERE document_id = ?", [documentId]);
      }
    },
  };
}

const DATABASE_PATCH: Record<keyof DatabasePatch, string> = {
  config: "config",
  updatedAt: "updated_at",
  updatedBy: "updated_by",
  deletedAt: "deleted_at",
};
const PROPERTY_PATCH: Record<keyof PropertyPatch, string> = {
  name: "name",
  type: "type",
  key: "key",
  config: "config",
  sortKey: "sort_key",
  updatedAt: "updated_at",
  updatedBy: "updated_by",
  deletedAt: "deleted_at",
};
const VIEW_PATCH: Record<keyof ViewPatch, string> = {
  name: "name",
  type: "type",
  config: "config",
  sortKey: "sort_key",
  updatedAt: "updated_at",
  updatedBy: "updated_by",
  deletedAt: "deleted_at",
};

async function patchRow(
  tx: LockContext,
  table: string,
  columns: Record<string, string>,
  id: string,
  patch: Record<string, unknown>,
) {
  const entries = Object.entries(patch);
  if (entries.length === 0) return;
  const sets = entries.map(([key]) => `${columns[key]} = ?`).join(", ");
  const values = entries.map(([key, value]) => (key === "config" ? json(value) : (value ?? null)));
  await tx.execute(`UPDATE ${table} SET ${sets} WHERE id = ?`, [...values, id]);
}

function databases(tx: LockContext): DatabasesRead & DatabasesWrite {
  const live = (includeDeleted?: boolean) => (includeDeleted ? "" : "AND deleted_at IS NULL");
  return {
    async get(id) {
      const row = await tx.getOptional<Row>(
        `SELECT ${DATABASE_COLUMNS} FROM databases WHERE id = ?`,
        [id],
      );
      return row ? toDatabase(row) : null;
    },
    async list(workspaceId, options) {
      const rows = await tx.getAll<Row>(
        `SELECT ${DATABASE_COLUMNS} FROM databases WHERE workspace_id = ? ${live(options?.includeDeleted)} ORDER BY id`,
        [workspaceId],
      );
      return rows.map(toDatabase);
    },
    async properties(databaseId, options) {
      const rows = await tx.getAll<Row>(
        `SELECT ${PROPERTY_COLUMNS} FROM database_properties WHERE database_id = ? ${live(options?.includeDeleted)}
         ORDER BY sort_key, id`,
        [databaseId],
      );
      return rows.map(toProperty);
    },
    async property(id) {
      const row = await tx.getOptional<Row>(
        `SELECT ${PROPERTY_COLUMNS} FROM database_properties WHERE id = ?`,
        [id],
      );
      return row ? toProperty(row) : null;
    },
    async views(databaseId, options) {
      const rows = await tx.getAll<Row>(
        `SELECT ${VIEW_COLUMNS} FROM database_views WHERE database_id = ? ${live(options?.includeDeleted)}
         ORDER BY sort_key, id`,
        [databaseId],
      );
      return rows.map(toView);
    },
    async view(id) {
      const row = await tx.getOptional<Row>(
        `SELECT ${VIEW_COLUMNS} FROM database_views WHERE id = ?`,
        [id],
      );
      return row ? toView(row) : null;
    },
    query: (q) => runViewQuery((sql, params) => tx.getAll<Row>(sql, params), q),
    async insert(d) {
      await tx.execute(
        `INSERT INTO databases (${DATABASE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          d.id,
          d.workspaceId,
          json(d.config),
          d.createdAt,
          d.updatedAt,
          d.deletedAt,
          d.createdBy ?? null,
          d.updatedBy ?? null,
        ],
      );
    },
    update: (id, patch) => patchRow(tx, "databases", DATABASE_PATCH, id, patch),
    async insertProperty(p) {
      await tx.execute(
        `INSERT INTO database_properties (${PROPERTY_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.id,
          p.workspaceId,
          p.databaseId,
          p.name,
          p.type,
          p.key,
          json(p.config),
          p.sortKey,
          p.createdAt,
          p.updatedAt,
          p.deletedAt,
          p.createdBy ?? null,
          p.updatedBy ?? null,
        ],
      );
    },
    updateProperty: (id, patch) => patchRow(tx, "database_properties", PROPERTY_PATCH, id, patch),
    async insertView(v) {
      await tx.execute(
        `INSERT INTO database_views (${VIEW_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          v.id,
          v.workspaceId,
          v.databaseId,
          v.name,
          v.type,
          json(v.config),
          v.sortKey,
          v.createdAt,
          v.updatedAt,
          v.deletedAt,
          v.createdBy ?? null,
          v.updatedBy ?? null,
        ],
      );
    },
    updateView: (id, patch) => patchRow(tx, "database_views", VIEW_PATCH, id, patch),
    async nextUniqueId(databaseId, key) {
      const path = `$."${key.replace(/["\\]/g, "")}"`;
      const row = await tx.getOptional<Row>(
        `SELECT coalesce(max(props ->> ?), 0) + 1 AS n FROM doc_props
         WHERE parent_id = ? AND json_type(props, ?) = 'integer'`,
        [path, databaseId, path],
      );
      return Math.max(1, Number(row?.n ?? 1));
    },
  };
}

function history(tx: LockContext): HistoryRead & HistoryWrite {
  return {
    async list({ sessionId, afterId, includeUndone, limit }) {
      const rows = await tx.getAll<Row>(
        `SELECT ${HISTORY_COLUMNS} FROM op_history
         WHERE (? IS NULL OR session_id = ?) AND (? IS NULL OR id > ?) AND (? OR undone_at IS NULL)
         ORDER BY id LIMIT ?`,
        [
          sessionId ?? null,
          sessionId ?? null,
          afterId ?? null,
          afterId ?? null,
          includeUndone ? 1 : 0,
          limit ?? -1,
        ],
      );
      return rows.map(toHistoryRow);
    },
    async sessions({ workspaceId, limit }) {
      const rows = await tx.getAll<Row>(
        `SELECT g.session_id, f.actor, f.workspace_id, g.first_at, g.last_at, g.count, g.undone_count
         FROM (
           SELECT session_id, min(id) AS first_id, min(created_at) AS first_at,
                  max(created_at) AS last_at, count(*) AS count,
                  sum(undone_at IS NOT NULL) AS undone_count
           FROM op_history
           WHERE session_id IS NOT NULL AND (? IS NULL OR workspace_id = ?)
           GROUP BY session_id
         ) g
         JOIN op_history f ON f.id = g.first_id
         ORDER BY g.last_at DESC, g.first_id DESC
         LIMIT ?`,
        [workspaceId ?? null, workspaceId ?? null, limit],
      );
      return rows.map(toHistorySession);
    },
    async append(e) {
      await tx.execute(
        `INSERT INTO op_history (${HISTORY_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          e.id,
          e.operation,
          json(e.input),
          e.inverse === null ? null : json(e.inverse),
          json(e.touches),
          json(e.actor),
          e.sessionId,
          e.groupId,
          e.scope,
          e.workspaceId,
          e.createdAt,
          e.undoneAt,
        ],
      );
    },
    async markUndone(ids, at) {
      if (ids.length === 0) return;
      await tx.execute(
        "UPDATE op_history SET undone_at = ? WHERE id IN (SELECT value FROM json_each(?))",
        [at, json(ids)],
      );
    },
  };
}

function activity(tx: LockContext): ActivityRead & ActivityWrite {
  return {
    async list({ workspaceId, limit, after, actors, types, targetId, sessionId, search }) {
      const rows = await tx.getAll<Row>(
        `SELECT ${ACTIVITY_COLUMNS} FROM activity
         WHERE workspace_id = ?
           AND (? IS NULL OR last_at < ? OR (last_at = ? AND id < ?))
           AND (? IS NULL OR actor_ref IN (SELECT value FROM json_each(?)))
           AND (? IS NULL OR type IN (SELECT value FROM json_each(?)))
           AND (? IS NULL OR target_id = ?)
           AND (? IS NULL OR session_id = ?)
           AND (? IS NULL OR instr(lower(coalesce(target_title, '')), lower(?)) > 0)
         ORDER BY last_at DESC, id DESC
         LIMIT ?`,
        [
          workspaceId,
          after?.lastAt ?? null,
          after?.lastAt ?? null,
          after?.lastAt ?? null,
          after?.id ?? null,
          ...pair(actors ? json(actors) : null),
          ...pair(types ? json(types) : null),
          ...pair(targetId ?? null),
          ...pair(sessionId ?? null),
          ...pair(search ?? null),
          limit,
        ],
      );
      return rows.map(toActivity);
    },
    async latest({ workspaceId, actor, sessionId, type, targetId }) {
      const row = await tx.getOptional<Row>(
        `SELECT ${ACTIVITY_COLUMNS} FROM activity
         WHERE workspace_id = ? AND target_id = ? AND type = ? AND actor_ref = ? AND session_id IS ?
         ORDER BY last_at DESC, id DESC
         LIMIT 1`,
        [workspaceId, targetId, type, actor, sessionId],
      );
      return row ? toActivity(row) : null;
    },
    async insert(a) {
      await tx.execute(
        `INSERT INTO activity (${ACTIVITY_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          a.id,
          a.workspaceId,
          json(a.actor),
          actorRef(a.actor),
          a.sessionId,
          a.type,
          a.targetId,
          a.targetTitle,
          json(a.data),
          a.count,
          a.firstAt,
          a.lastAt,
        ],
      );
    },
    async update(id, patch) {
      await tx.execute(
        "UPDATE activity SET count = ?, last_at = ?, target_title = ?, data = ? WHERE id = ?",
        [patch.count, patch.lastAt, patch.targetTitle, json(patch.data), id],
      );
    },
  };
}

const pair = <T>(value: T): [T, T] => [value, value];

function operationLog(tx: LockContext, enabled: boolean): OperationLog {
  return {
    async append(entry) {
      // Without a sync peer nothing would ever take entries off the queue (LYD-169).
      if (!enabled) return;
      await tx.execute(
        `INSERT INTO operation_log (id, operation, input, actor, session_id, workspace_id, created_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id,
          entry.operation,
          json(entry.input),
          json(entry.actor),
          entry.sessionId ?? null,
          entry.workspaceId,
          entry.createdAt,
          entry.version,
        ],
      );
    },
  };
}

function readApi(tx: LockContext): DbRead {
  return {
    docs: docsRead(tx),
    bodies: bodiesRead(tx),
    links: linksRead(tx),
    blocks: blocks(tx),
    attachments: attachments(tx),
    threads: threads(tx),
    history: history(tx),
    activity: activity(tx),
    databases: databases(tx),
    search: createSearchPort(tx),
  };
}

export type DbPortOptions = {
  // Append applied operations to the upload queue (`operation_log`). Default true; a local-only
  // store (no sync peer, `mode: "local"`) turns it off.
  uploadQueue?: boolean;
};

export function createDbPort(db: CommonPowerSyncDatabase, options: DbPortOptions = {}): Db {
  const uploadQueue = options.uploadQueue ?? true;
  return {
    read: (fn) => db.readTransaction((tx) => fn(readApi(tx))),
    write: (fn) =>
      db.writeTransaction((tx) => {
        let savepoints = 0;
        const api: DbTx = {
          docs: { ...docsRead(tx), ...docsWrite(tx) },
          bodies: { ...bodiesRead(tx), ...bodiesWrite(tx) },
          links: { ...linksRead(tx), ...linksWrite(tx) },
          blocks: blocks(tx),
          attachments: attachments(tx),
          threads: threads(tx),
          history: history(tx),
          activity: activity(tx),
          databases: databases(tx),
          search: createSearchPort(tx),
          oplog: operationLog(tx, uploadQueue),
          async savepoint(inner) {
            const name = `lydie_sp_${++savepoints}`;
            await tx.execute(`SAVEPOINT ${name}`);
            try {
              const result = await inner();
              await tx.execute(`RELEASE ${name}`);
              return result;
            } catch (error) {
              await tx.execute(`ROLLBACK TO ${name}`);
              await tx.execute(`RELEASE ${name}`);
              throw error;
            }
          },
        };
        return fn(api);
      }),
  };
}

// Over the database, or over one transaction (`LockContext`), which queries run in.
export function createSearchPort(db: Pick<CommonPowerSyncDatabase, "getAll">): Search {
  const run = async <T>(q: { sql: string; parameters: readonly unknown[]; map: (r: Row) => T }) =>
    (await db.getAll<Row>(q.sql, [...q.parameters])).map(q.map);
  return {
    query: ({ workspaceId, query, limit }) => run(searchQuery(workspaceId, query, { limit })),
    mentions: ({ workspaceId, targetId, phrases, limit }) =>
      run(unlinkedMentions(workspaceId, targetId, phrases, { limit })),
  };
}
