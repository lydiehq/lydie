// In-memory implementations of every port, for tests and for code that needs a runtime without a
// database. Not optimised; fine for a few thousand documents.
import { actorRef, splitUniqueId } from "@lydie/contract";
import type {
  Activity,
  AppliedOperation,
  Attachment,
  Backlink,
  Block,
  Database,
  DatabaseProperty,
  DatabaseView,
  Document,
  DocumentBody,
  LydieEvent,
  SearchHit,
  TreeEntry,
  UnlinkedMention,
} from "@lydie/contract";

import { asciiLower } from "../database/view.ts";
import type {
  Blob,
  Db,
  DbTx,
  Events,
  HistoryRow,
  LinkRow,
  Search,
  ThreadRow,
  Versions,
} from "../ports.ts";
import { linkKey } from "../text.ts";
import { queryTrigrams, SIMILAR_TITLE, titleSimilarity } from "../trigrams.ts";
import { createMemoryVersionStore, createSnapshotVersions } from "../versions.ts";

export type MemoryState = {
  docs: Map<string, Document>;
  bodies: Map<string, DocumentBody & { workspaceId: string; updatedAt: string }>;
  links: Map<string, LinkRow>;
  blocks: Map<string, Block[]>;
  attachments: Map<string, Attachment>;
  threads: Map<string, ThreadRow>;
  databases: Map<string, Database>;
  properties: Map<string, DatabaseProperty>;
  views: Map<string, DatabaseView>;
  oplog: AppliedOperation[];
  history: HistoryRow[];
  activity: Activity[];
};

export type MemoryEvents = Events & {
  readonly published: LydieEvent[];
  subscribe(listener: (event: LydieEvent) => void): () => void;
};

export type MemoryBlob = Blob & { readonly size: number };

export type MemoryPorts = {
  db: Db;
  search: Search;
  blob: MemoryBlob;
  events: MemoryEvents;
  // Snapshot version history kept in memory.
  versions: Versions;
  state: MemoryState;
};

const bySortKey = (a: Document, b: Document) =>
  a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

const binary = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const newestActivity = (a: Activity, b: Activity) =>
  binary(b.lastAt, a.lastAt) || binary(b.id, a.id);

function emptyState(): MemoryState {
  return {
    docs: new Map(),
    bodies: new Map(),
    links: new Map(),
    blocks: new Map(),
    attachments: new Map(),
    threads: new Map(),
    databases: new Map(),
    properties: new Map(),
    views: new Map(),
    oplog: [],
    history: [],
    activity: [],
  };
}

export function createMemoryPorts(): MemoryPorts {
  let state = emptyState();
  let queue: Promise<unknown> = Promise.resolve();

  const source = (doc: Document) => ({
    id: doc.id,
    title: doc.title,
    parentId: doc.parentId,
    workspaceId: doc.workspaceId,
  });
  const toBacklink = (link: LinkRow, doc: Document): Backlink => ({
    source: source(doc),
    kind: link.kind,
    syntax: link.syntax ?? "wikilink",
    targetRef: link.targetRef,
    sourceBlockId: link.sourceBlockId ?? null,
    targetHeading: link.targetHeading ?? null,
    targetBlockId: link.targetBlockId ?? null,
    sourceProperty: link.sourceProperty ?? null,
  });
  // Binary order by (title, id), like the SQLite store.
  const byTitle = (a: { source: { title: string; id: string } }, b: typeof a) =>
    binary(a.source.title, b.source.title) || binary(a.source.id, b.source.id);
  const liveChildren = (parentId: string) =>
    [...state.docs.values()].filter((d) => d.parentId === parentId && !d.deletedAt);

  const tx: DbTx = {
    docs: {
      async get(id) {
        return clone(state.docs.get(id) ?? null);
      },
      async children(workspaceId, parentId, options) {
        return [...state.docs.values()]
          .filter(
            (d) =>
              d.workspaceId === workspaceId &&
              d.parentId === parentId &&
              (options?.includeDeleted || !d.deletedAt),
          )
          .sort(bySortKey)
          .map(clone);
      },
      async childEntries(workspaceId, parentId, options) {
        return (await tx.docs.children(workspaceId, parentId, options)).map((d) => ({
          ...d,
          childCount: liveChildren(d.id).length,
          teamspaceId: null,
          privateOwnerId: null,
        }));
      },
      async descendants(id) {
        const out: Document[] = [];
        const visit = (parentId: string) => {
          for (const d of state.docs.values()) {
            if (d.parentId === parentId) {
              out.push(clone(d));
              visit(d.id);
            }
          }
        };
        visit(id);
        return out;
      },
      async ancestors(id) {
        const out: Document[] = [];
        for (let p = state.docs.get(id)?.parentId; p;) {
          const parent = state.docs.get(p);
          if (!parent) break;
          out.push(clone(parent));
          p = parent.parentId;
        }
        return out;
      },
      async tree(workspaceId, { rootId, includeDeleted }) {
        const out: TreeEntry[] = [];
        const visit = async (parentId: string | null, depth: number) => {
          for (const d of await tx.docs.children(workspaceId, parentId, { includeDeleted })) {
            out.push({ ...d, depth, teamspaceId: null, privateOwnerId: null });
            await visit(d.id, depth + 1);
          }
        };
        await visit(rootId ?? null, 0);
        return out;
      },
      async findByLinkKey(workspaceId, key) {
        return (await tx.docs.findAllByLinkKey!(workspaceId, key))[0] ?? null;
      },
      async findAllByLinkKey(workspaceId, key) {
        return [...state.docs.values()]
          .filter((d) => d.workspaceId === workspaceId && !d.deletedAt && linkKey(d.title) === key)
          .sort(bySortKey)
          .map(clone);
      },
      async findAllByLinkKeys(workspaceId, keys) {
        const out = new Map<string, Document[]>();
        for (const key of new Set(keys)) {
          const found = await tx.docs.findAllByLinkKey!(workspaceId, key);
          if (found.length > 0) out.set(key, found);
        }
        return out;
      },
      async trashed(workspaceId) {
        return [...state.docs.values()]
          .filter((d) => {
            if (d.workspaceId !== workspaceId || !d.deletedAt) return false;
            const parent = d.parentId ? state.docs.get(d.parentId) : undefined;
            return parent?.deletedAt !== d.deletedAt;
          })
          .map((d) => {
            let descendantCount = 0;
            const visit = (id: string) => {
              for (const c of state.docs.values()) {
                if (c.parentId === id && c.deletedAt === d.deletedAt) {
                  descendantCount++;
                  visit(c.id);
                }
              }
            };
            visit(d.id);
            return { ...clone(d), descendantCount };
          });
      },
      async getMany(ids) {
        return ids.flatMap((id) => {
          const doc = state.docs.get(id);
          return doc ? [clone(doc)] : [];
        });
      },
      async insert(doc) {
        state.docs.set(doc.id, clone(doc));
      },
      async updateMany(updates) {
        for (const { id, patch } of updates) await tx.docs.update(id, patch);
      },
      async update(id, patch) {
        const doc = state.docs.get(id);
        if (doc) state.docs.set(id, { ...doc, ...clone(patch) });
      },
      async purge(ids) {
        for (const id of ids) {
          state.docs.delete(id);
          state.bodies.delete(id);
          state.blocks.delete(id);
        }
        const gone = new Set(ids);
        for (const id of ids) state.databases.delete(id);
        for (const [pid, p] of state.properties)
          if (gone.has(p.databaseId)) state.properties.delete(pid);
        for (const [vid, v] of state.views) if (gone.has(v.databaseId)) state.views.delete(vid);
        for (const [linkId, link] of state.links) {
          if (gone.has(link.sourceId)) state.links.delete(linkId);
          else if (link.targetId && gone.has(link.targetId)) link.targetId = null;
        }
      },
    },
    bodies: {
      async get(id) {
        const body = state.bodies.get(id);
        return body ? { markdown: body.markdown, version: body.version } : null;
      },
      async put(id, workspaceId, body, updatedAt) {
        state.bodies.set(id, { ...body, workspaceId, updatedAt });
      },
    },
    links: {
      async backlinks(targetId) {
        const out: Backlink[] = [];
        for (const link of state.links.values()) {
          const doc = state.docs.get(link.sourceId);
          if (link.targetId !== targetId || !doc || doc.deletedAt) continue;
          out.push(toBacklink(link, doc));
        }
        return out.sort(byTitle);
      },
      async blockBacklinks(targetId, blockId) {
        return (await tx.links.backlinks(targetId)).filter((b) => b.targetBlockId === blockId);
      },
      async from(sourceId) {
        return [...state.links.values()].filter((l) => l.sourceId === sourceId).map(clone);
      },
      async unresolved(workspaceId) {
        return [...state.links.values()]
          .filter(
            (l) =>
              l.workspaceId === workspaceId &&
              (l.targetId === null || state.docs.get(l.targetId)?.deletedAt !== null),
          )
          .flatMap((l) => {
            const doc = state.docs.get(l.sourceId);
            if (!doc || doc.deletedAt) return [];
            return [
              {
                source: source(doc),
                kind: l.kind,
                syntax: l.syntax ?? "wikilink",
                targetRef: l.targetRef,
              },
            ];
          })
          .sort((a, b) => binary(a.targetRef, b.targetRef) || byTitle(a, b));
      },
      async replaceFrom(sourceId, links) {
        for (const [id, link] of state.links) {
          if (link.sourceId === sourceId) state.links.delete(id);
        }
        for (const link of links) state.links.set(link.id, clone(link));
      },
      async resolveDangling(workspaceId, key, targetId) {
        for (const link of state.links.values()) {
          if (
            link.workspaceId === workspaceId &&
            link.targetId === null &&
            link.targetKey === key
          ) {
            link.targetId = targetId;
          }
        }
      },
    },
    blocks: {
      async list(docId) {
        return clone(state.blocks.get(docId) ?? []);
      },
      async replaceFor(docId, _workspaceId, blocks) {
        if (blocks.length === 0) state.blocks.delete(docId);
        else state.blocks.set(docId, clone([...blocks]));
      },
    },
    attachments: {
      async get(id) {
        return clone(state.attachments.get(id) ?? null);
      },
      async list(workspaceId, options) {
        return [...state.attachments.values()]
          .filter(
            (a) =>
              a.workspaceId === workspaceId &&
              (options?.includeDeleted || !a.deletedAt) &&
              (!options?.documentId || a.documentId === options.documentId),
          )
          .sort((a, b) => binary(b.createdAt, a.createdAt) || binary(b.id, a.id))
          .map(clone);
      },
      async countBySha256(sha256) {
        return [...state.attachments.values()].filter((a) => a.sha256 === sha256).length;
      },
      async insert(attachment) {
        state.attachments.set(attachment.id, clone(attachment));
      },
      async update(id, patch) {
        const row = state.attachments.get(id);
        if (row) state.attachments.set(id, { ...row, ...clone(patch) });
      },
      async purge(id) {
        state.attachments.delete(id);
      },
    },
    threads: {
      async get(id) {
        return clone(state.threads.get(id) ?? null);
      },
      async list(documentId, options) {
        return [...state.threads.values()]
          .filter((t) => t.documentId === documentId && (options?.includeDeleted || !t.deletedAt))
          .sort((a, b) => binary(a.createdAt, b.createdAt) || binary(a.id, b.id))
          .map(clone);
      },
      async insert(row) {
        state.threads.set(row.id, clone(row));
      },
      async update(id, patch) {
        const row = state.threads.get(id);
        if (row) state.threads.set(id, { ...row, ...clone(patch) });
      },
      async purgeFor(documentIds) {
        const gone = new Set(documentIds);
        for (const [id, row] of state.threads)
          if (gone.has(row.documentId)) state.threads.delete(id);
      },
    },
    history: {
      async list({ sessionId, afterId, includeUndone, limit }) {
        return state.history
          .filter(
            (e) =>
              (sessionId === undefined || e.sessionId === sessionId) &&
              (afterId === undefined || e.id > afterId) &&
              (includeUndone || e.undoneAt === null),
          )
          .slice(0, limit ?? Infinity)
          .map(clone);
      },
      async sessions({ workspaceId, limit }) {
        const by = new Map<string, HistoryRow[]>();
        for (const e of state.history) {
          if (!e.sessionId || (workspaceId && e.workspaceId !== workspaceId)) continue;
          by.set(e.sessionId, [...(by.get(e.sessionId) ?? []), e]);
        }
        return [...by.entries()]
          .map(([sessionId, entries]) => ({
            sessionId,
            actor: clone(entries[0]!.actor),
            workspaceId: entries[0]!.workspaceId,
            firstAt: entries[0]!.createdAt,
            lastAt: entries.at(-1)!.createdAt,
            count: entries.length,
            undoneCount: entries.filter((e) => e.undoneAt !== null).length,
          }))
          .sort((a, b) => binary(b.lastAt, a.lastAt))
          .slice(0, limit);
      },
      async append(entry) {
        state.history.push(clone(entry));
      },
      async markUndone(ids, at) {
        const set = new Set(ids);
        for (const e of state.history) if (set.has(e.id)) e.undoneAt = at;
      },
    },
    activity: {
      async list({ workspaceId, limit, after, actors, types, targetId, sessionId, search }) {
        const needle = search === undefined ? undefined : asciiLower(search);
        return state.activity
          .filter(
            (a) =>
              a.workspaceId === workspaceId &&
              (!after ||
                a.lastAt < after.lastAt ||
                (a.lastAt === after.lastAt && a.id < after.id)) &&
              (!actors || actors.includes(actorRef(a.actor))) &&
              (!types || types.includes(a.type)) &&
              (targetId === undefined || a.targetId === targetId) &&
              (sessionId === undefined || a.sessionId === sessionId) &&
              (needle === undefined || asciiLower(a.targetTitle ?? "").includes(needle)),
          )
          .sort(newestActivity)
          .slice(0, limit)
          .map(clone);
      },
      async latest({ workspaceId, actor, sessionId, type, targetId }) {
        const found = state.activity
          .filter(
            (a) =>
              a.workspaceId === workspaceId &&
              actorRef(a.actor) === actor &&
              a.sessionId === sessionId &&
              a.type === type &&
              a.targetId === targetId,
          )
          .sort(newestActivity)[0];
        return clone(found ?? null);
      },
      async latestMany(keys) {
        const rows = await Promise.all(keys.map((key) => tx.activity!.latest(key)));
        return rows.filter((r) => r !== null);
      },
      async insert(row) {
        state.activity.push(clone(row));
      },
      async insertMany(rows) {
        for (const row of rows) state.activity.push(clone(row));
      },
      async update(id, patch) {
        const row = state.activity.find((a) => a.id === id);
        if (row) Object.assign(row, clone(patch));
      },
      async updateMany(updates) {
        for (const { id, patch } of updates) await tx.activity!.update(id, patch);
      },
    },
    databases: {
      async get(id) {
        return clone(state.databases.get(id) ?? null);
      },
      async list(workspaceId, options) {
        return [...state.databases.values()]
          .filter((d) => d.workspaceId === workspaceId && (options?.includeDeleted || !d.deletedAt))
          .sort((a, b) => binary(a.id, b.id))
          .map(clone);
      },
      async properties(databaseId, options) {
        return [...state.properties.values()]
          .filter((p) => p.databaseId === databaseId && (options?.includeDeleted || !p.deletedAt))
          .sort((a, b) => binary(a.sortKey, b.sortKey) || binary(a.id, b.id))
          .map(clone);
      },
      async property(id) {
        return clone(state.properties.get(id) ?? null);
      },
      async views(databaseId, options) {
        return [...state.views.values()]
          .filter((v) => v.databaseId === databaseId && (options?.includeDeleted || !v.deletedAt))
          .sort((a, b) => binary(a.sortKey, b.sortKey) || binary(a.id, b.id))
          .map(clone);
      },
      async view(id) {
        return clone(state.views.get(id) ?? null);
      },
      async insert(database) {
        state.databases.set(database.id, clone(database));
      },
      async update(id, patch) {
        const row = state.databases.get(id);
        if (row) state.databases.set(id, { ...row, ...clone(patch) });
      },
      async insertProperty(property) {
        state.properties.set(property.id, clone(property));
      },
      async updateProperty(id, patch) {
        const row = state.properties.get(id);
        if (row) state.properties.set(id, { ...row, ...clone(patch) });
      },
      async insertView(view) {
        state.views.set(view.id, clone(view));
      },
      async updateView(id, patch) {
        const row = state.views.get(id);
        if (row) state.views.set(id, { ...row, ...clone(patch) });
      },
      async nextUniqueId(databaseId, key) {
        let max = 0;
        for (const doc of state.docs.values()) {
          const v = doc.parentId === databaseId ? doc.properties[key] : undefined;
          if (typeof v === "number" && Number.isSafeInteger(v) && v > max) max = v;
        }
        return max + 1;
      },
    },
    oplog: {
      async append(entry) {
        state.oplog.push(clone(entry));
      },
    },
    async savepoint(fn) {
      const snapshot = structuredClone(state);
      try {
        return await fn();
      } catch (error) {
        state = snapshot;
        throw error;
      }
    },
  };

  // Writes are serialised and roll back by restoring a snapshot.
  const db: Db = {
    read: (fn) => fn(tx),
    write(fn) {
      const run = queue.then(async () => {
        const snapshot = structuredClone(state);
        try {
          return await fn(tx);
        } catch (error) {
          state = snapshot;
          throw error;
        }
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };

  const textOf = (doc: Document) => state.bodies.get(doc.id)?.markdown ?? "";
  const search: Search = {
    async query({ workspaceId, query, limit }) {
      const terms = tokens(query);
      if (terms.length === 0) return [];
      const hits: SearchHit[] = [];
      for (const doc of state.docs.values()) {
        if (doc.workspaceId !== workspaceId || doc.deletedAt) continue;
        const body = textOf(doc);
        const titleWords = tokens(doc.title);
        const bodyWords = tokens(body);
        const matches = (words: string[], t: string) => words.filter((w) => w.startsWith(t)).length;
        if (!terms.every((t) => matches(titleWords, t) + matches(bodyWords, t) > 0)) continue;
        const score = -terms.reduce(
          (sum, t) => sum + 10 * matches(titleWords, t) + matches(bodyWords, t),
          0,
        );
        // A title equal to the query comes first (as @lydie/store: ASCII case, spaces trimmed).
        const exact = asciiLower(trimSpaces(doc.title)) === asciiLower(query.trim());
        hits.push({
          id: doc.id,
          title: doc.title,
          snippet: snippet(body, terms),
          score: exact ? score - 1e6 : score,
        });
      }
      // "LYD-12": the row numbered 12 by a uniqueId property with prefix LYD comes first.
      const id = splitUniqueId(query);
      if (id) {
        for (const p of state.properties.values()) {
          const prefix = p.config.prefix;
          if (p.type !== "uniqueId" || p.deletedAt || p.workspaceId !== workspaceId) continue;
          if (!prefix || prefix.toLowerCase() !== id.prefix.toLowerCase()) continue;
          if (state.databases.get(p.databaseId)?.deletedAt !== null) continue;
          for (const doc of state.docs.values()) {
            if (doc.parentId !== p.databaseId || doc.deletedAt || doc.properties[p.key] !== id.n)
              continue;
            const i = hits.findIndex((h) => h.id === doc.id);
            if (i !== -1) hits.splice(i, 1);
            const snippet = `<mark>${prefix}-${id.n}</mark>`;
            hits.push({ id: doc.id, title: doc.title, snippet, score: -1e9 });
          }
        }
      }
      if (hits.length > 0) return hits.sort((a, b) => a.score - b.score).slice(0, limit);
      // Nothing matched: titles close to the query, scored after any real match would be.
      const grams = queryTrigrams(query);
      const similar: Array<{ hit: SearchHit; length: number }> = [];
      for (const doc of state.docs.values()) {
        if (doc.workspaceId !== workspaceId || doc.deletedAt) continue;
        const similarity = titleSimilarity(grams, doc.title);
        if (similarity < SIMILAR_TITLE) continue;
        const hit = { id: doc.id, title: doc.title, snippet: doc.title, score: 1 - similarity };
        similar.push({ hit, length: [...doc.title].length });
      }
      return similar
        .sort(
          (a, b) => a.hit.score - b.hit.score || a.length - b.length || binary(a.hit.id, b.hit.id),
        )
        .slice(0, limit)
        .map((s) => s.hit);
    },
    async mentions({ workspaceId, targetId, phrases, limit }) {
      const linking = new Set(
        [...state.links.values()].filter((l) => l.targetId === targetId).map((l) => l.sourceId),
      );
      const wanted = phrases.map((p) => tokens(p)).filter((t) => t.length > 0);
      const out: UnlinkedMention[] = [];
      for (const doc of [...state.docs.values()].sort(bySortKey)) {
        if (doc.workspaceId !== workspaceId || doc.deletedAt) continue;
        if (doc.id === targetId || linking.has(doc.id)) continue;
        const words = tokens(textOf(doc));
        const hit = wanted.find((phrase) =>
          words.some((_, i) => phrase.every((w, j) => words[i + j] === w)),
        );
        if (hit) out.push({ source: source(doc), snippet: snippet(textOf(doc), hit) });
      }
      return out.sort(byTitle).slice(0, limit);
    },
  };

  const blobs = new Map<string, Uint8Array>();
  const blob: MemoryBlob = {
    async put(key, data) {
      blobs.set(key, data.slice());
    },
    async get(key) {
      return blobs.get(key)?.slice() ?? null;
    },
    async delete(key) {
      blobs.delete(key);
    },
    async has(key) {
      return blobs.has(key);
    },
    get size() {
      return blobs.size;
    },
  };

  const listeners = new Set<(event: LydieEvent) => void>();
  const published: LydieEvent[] = [];
  const events: MemoryEvents = {
    published,
    publish(batch) {
      for (const event of batch) {
        published.push(event);
        for (const listener of listeners) listener(event);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return {
    db,
    search,
    blob,
    events,
    versions: createSnapshotVersions(createMemoryVersionStore()),
    get state() {
      return state;
    },
  };
}

function clone<T>(value: T): T {
  return value === null || typeof value !== "object" ? value : structuredClone(value);
}

// SQLite's trim(), which @lydie/store's search uses.
const trimSpaces = (text: string) => text.replace(/^ +| +$/g, "");

function tokens(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function snippet(body: string, terms: string[]): string {
  const lower = body.toLowerCase();
  const at = Math.max(0, Math.min(...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0)));
  const start = Math.max(0, at - 40);
  let excerpt = body.slice(start, start + 120);
  for (const t of terms) {
    excerpt = excerpt.replace(
      new RegExp(`(${escape(t)}[\\p{L}\\p{N}]*)`, "giu"),
      "<mark>$1</mark>",
    );
  }
  return (start > 0 ? "…" : "") + excerpt;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
