// The file bridge: keeps the database an index of a folder of Markdown files, and the folder in step
// with operations. The folder is the source of truth (plan §1): everything the bridge puts in the
// database can be rebuilt from the folder and `.lydie/`.
//
//   open    index(): scan, compare with file_index (mtime+size, then hash), read what changed,
//           write the database directly in a few transactions (indexing is not an operation).
//   watch   syncPaths(): rescan what the watcher reported, pair deletes with creates (renames),
//           apply the difference as operations by the `system:file-bridge` actor (journaled, so
//           agent-session undo sees them, but never on an undo stack).
//   write   handleEvents(): for every document an operation touched, make the file match the
//           database (create, write, rename/move with link rewriting, trash, restore, purge).
//   merge   open documents (S2): external edits are reconciled with the editor's state.
import { realpathSync } from "node:fs";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join, posix } from "node:path";

import {
  fromBase,
  fromFileValue,
  frontmatterBlock,
  isLydieError,
  toBase,
  toFileValue,
} from "@lydie/contract";
import type {
  Actor,
  Attachment,
  DatabaseDefinition,
  DatabaseProperty,
  Document,
  DocumentBody,
  LydieEvent,
  OperationId,
  Properties,
  PropertyInput,
} from "@lydie/contract";
import { merge3, parse, reconcile, rewriteLinks, save } from "@lydie/markdown";
import type { DocInput, ParseResult, ReplaceStepJSON, TextConflict } from "@lydie/markdown";
import {
  bodyVersion,
  linkKey,
  propertyLinks,
  relationKeysOf,
  resolveLink,
  targetKey,
  uuid,
} from "@lydie/runtime";
import type { DbRead, Extracted, LinkRow, Runtime } from "@lydie/runtime";
import type { FileIndexEntry, Store } from "@lydie/store";
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

import { dominantEol, extractBody, fitBody, mergeFrontmatter, readContent } from "./content.ts";
import type { FileContent } from "./content.ts";
import {
  BASE_EXT,
  baseDefinitionOf,
  baseFileFor,
  baseIdOf,
  obsidianTypes,
  sameDefinition,
} from "./databases.ts";
import {
  atomicWrite,
  exists,
  isDirectory,
  move,
  readFileState,
  removeIfEmpty,
  sha256,
} from "./fs.ts";
import type { FileRead, WriteHooks } from "./fs.ts";
import { assignId, defaultId, deriveId } from "./ids.ts";
import { VaultMeta } from "./meta.ts";
import type { AttachmentRecord } from "./meta.ts";
import {
  baseName,
  compareNames,
  fileNameFor,
  filePath,
  globMatcher,
  isHiddenName,
  isTrashKey,
  isUnder,
  joinKey,
  MD,
  META_DIR,
  parentKey,
  rebase,
  titleOf,
  TRASH_DIR,
  uniqueName,
} from "./paths.ts";
import { mapLimit, SerialQueue } from "./queue.ts";
import { scan } from "./scan.ts";
import type { DiskEntry } from "./scan.ts";
import type { ExternalChange, FileConflict, IndexReport, VaultStatus } from "./service.ts";
import type { LinkFormat } from "./settings.ts";
import { watchFolder } from "./watch.ts";
import type { FolderWatcher, WatchOptions } from "./watch.ts";

export type {
  ExternalChange,
  FileConflict,
  IndexReport,
  VaultState,
  VaultStatus,
} from "./service.ts";

export const BRIDGE_ACTOR: Actor = { type: "system", id: "file-bridge" };
const BRIDGE_REF = "system:file-bridge";

// Bumped when what the bridge extracts from a file changes: rows indexed by another version are
// re-read on the next open even if the file did not change (LYD-168).
const INDEX_VERSION = "b3";

type Entry = {
  id: string;
  key: string;
  file: boolean;
  dir: boolean;
  // sha256 of the file as last agreed (written, or applied to the database); "" without a file.
  hash: string;
  // sha256 last seen on disk, even when it was not applied yet (rename pairing). In memory only.
  seen?: string;
  // The id came from the file's `id:` frontmatter.
  fmId: boolean;
  mtime: number;
  size: number;
  // Last agreed file text: the base for three-way merges.
  lca: string | null;
  trashed: boolean;
  // Indexed by another INDEX_VERSION: re-read even if unchanged.
  stale?: boolean;
};

type Read = { text: string; hash: string; content: FileContent; mtime: number; size: number };

type Observed = DiskEntry & { read?: Read | null };

type Plan = {
  same: { entry: Entry; obs: Observed; changed: boolean }[];
  moved: { entry: Entry; obs: Observed; changed: boolean }[];
  created: { obs: Observed; id: string; fmId: boolean }[];
  removed: Entry[];
};

// Who holds an open document and receives external changes (S2). The editor applies `steps` to
// its document in order (`tr.replace(from, to, Slice.fromJSON(schema, slice))`).
export type DocumentHandle = {
  // The editor's current document (ProseMirror JSON or node in the Lydie schema).
  getDoc(): DocInput | Promise<DocInput>;
  applySteps(steps: ReplaceStepJSON[], info: { source: string }): void | Promise<void>;
  onConflict?(conflict: FileConflict): void;
  // The file was deleted or the document purged.
  onClosed?(reason: "deleted"): void;
};

export type OpenDocument = {
  // The file text the editor should load (`parse(source)`); "" for a folder without a note.
  readonly source: string;
  // Splice-saves the editor's document onto the last agreed text and writes it (doc.updateBody).
  save(doc: DocInput): Promise<{ changed: boolean; verified: boolean }>;
  close(): void;
};

export type BridgeOptions = {
  root: string;
  workspaceId: string;
  store: Store;
  attachmentsFolder: string;
  exclude?: readonly string[];
  // How new links are written (folder setting `linkFormat`, default "wiki"). Relation and file
  // values in frontmatter stay `[[wikilinks]]` either way: Obsidian resolves only those there.
  linkFormat?: LinkFormat;
  hooks?: WriteHooks;
  watch?: WatchOptions;
  // The actor that editor saves run as.
  actor: Actor;
  onError?: (error: unknown) => void;
};

// `base`: the last agreed text of an open document; `parsed`: its parse once known, the original
// of the next save (parsing a large note is most of a save's cost).
type Session = { id: string; handle: DocumentHandle; base: string; parsed: ParseResult | null };

// Operations whose files are written together (see handleEvents). `ids` has each operation's
// documents, repeats included: one `pending` count each.
type WriteBatch = { events: LydieEvent[]; ids: string[]; done: Promise<void> };

// A document and its body (null: none; undefined: not read).
type Row = { document: Document; body?: DocumentBody | null };

// A document whose files are in place, waiting for its content (`writeContents`).
type Placed = { entry: Entry; created: boolean; isDatabase: boolean };

// A written file and what went into it. `from`: the database state it was written from.
type Written = {
  entry: Entry;
  source: string;
  final: string;
  conflicts: TextConflict[] | null;
  external: boolean;
  from: { body: string | null | undefined; parentId: string | null; properties: Properties };
  emptyBody: boolean;
};

// Files written at once by an operation that touches many documents (database rows).
const WRITE_CONCURRENCY = 8;

export class Bridge {
  readonly root: string;
  readonly workspaceId: string;
  private readonly store: Store;
  private runtime!: Runtime;
  private readonly queue = new SerialQueue();
  private readonly entries = new Map<string, Entry>();
  private readonly byKey = new Map<string, string>();
  private meta!: VaultMeta;
  private excluded: (key: string) => boolean;
  private attachmentsFolder: string;
  private _linkFormat: LinkFormat;
  private watcher: FolderWatcher | null = null;
  private readonly sessions = new Map<string, Session>();
  private readonly purgedBytes = new Map<string, string>();
  // Properties of each live database (id = its document), for typing row values and rollups.
  private readonly schemas = new Map<string, DatabaseProperty[]>();
  // Databases whose .base file must be (re)written, with the file name it had before a move.
  private readonly baseDirty = new Map<string, string | undefined>();
  // `lydie.id`s whose relations are being followed (`retargetTo`), so two databases that relate to
  // each other are read again once.
  private readonly retargeting = new Set<string>();
  // `lydie.id` → document id for database files read this session that named another id than their
  // folder's, since writing the file back replaces it.
  private readonly baseAliases = new Map<string, string>();
  private types: Record<string, string> = {};
  // Documents with committed operations whose files are not written yet (count per document).
  private readonly pending = new Map<string, number>();
  // Operations' writes waiting for the queue; later operations join them.
  private waiting: WriteBatch | null = null;
  private readonly unpersisted = new Set<Entry>();
  // Counts syncPaths runs: what was read before one may be out of date.
  private rescans = 0;
  private readonly statusListeners = new Set<(status: VaultStatus) => void>();
  private readonly changeListeners = new Set<(change: ExternalChange) => void>();
  private readonly conflictListeners = new Set<(conflict: FileConflict) => void>();
  private readonly onError: (error: unknown) => void;
  private closed = false;
  private _status: VaultStatus;

  constructor(private readonly options: BridgeOptions) {
    this.root = realpathSync(options.root);
    this.workspaceId = options.workspaceId;
    this.store = options.store;
    this.attachmentsFolder = options.attachmentsFolder;
    this._linkFormat = options.linkFormat ?? "wiki";
    this.excluded = exclusions(options.attachmentsFolder, options.exclude ?? []);
    this.onError = options.onError ?? ((error) => console.error("[bridge-fs]", error));
    this._status = {
      state: "opening",
      folder: this.root,
      workspaceId: this.workspaceId,
      indexed: 0,
      total: 0,
      documents: 0,
      watching: false,
      lastIndex: null,
      error: null,
    };
  }

  // The runtime is created with this bridge as its events port, hence the two steps.
  attach(runtime: Runtime): void {
    this.runtime = runtime;
  }

  // ---- Status and listeners

  get status(): VaultStatus {
    return this._status;
  }

  private setStatus(patch: Partial<VaultStatus>): void {
    this._status = { ...this._status, ...patch };
    for (const listener of this.statusListeners) listener(this._status);
  }

  onStatus(listener: (status: VaultStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onExternalChange(listener: (change: ExternalChange) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  onConflict(listener: (conflict: FileConflict) => void): () => void {
    this.conflictListeners.add(listener);
    return () => this.conflictListeners.delete(listener);
  }

  // Resolves when queued work and pending watcher batches are done (tests, CLI exit).
  async idle(): Promise<void> {
    for (let i = 0; i < 100; i++) {
      await this.queue.idle();
      if (!this.watcher?.pending()) {
        await this.queue.idle();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  // Path of a document's file (or folder, for a folder without a note), relative to the vault.
  pathOf(id: string): string | null {
    const entry = this.entries.get(id);
    if (!entry) return null;
    return entry.file ? filePath(entry.key) : `${entry.key}/`;
  }

  idOf(path: string): string | null {
    const key = path.replace(/\/+$/, "").replace(/\.md$/, "");
    return this.byKey.get(key) ?? null;
  }

  // ---- Entries

  private abs(key: string): string {
    return join(this.root, key);
  }

  private absFile(key: string): string {
    return join(this.root, filePath(key));
  }

  private setEntry(entry: Entry): void {
    const previous = this.entries.get(entry.id);
    if (previous && this.byKey.get(previous.key) === entry.id) this.byKey.delete(previous.key);
    this.entries.set(entry.id, entry);
    this.byKey.set(entry.key, entry.id);
  }

  private dropEntry(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (this.byKey.get(entry.key) === id) this.byKey.delete(entry.key);
    this.entries.delete(id);
  }

  private entryAt(key: string): Entry | undefined {
    const id = this.byKey.get(key);
    return id ? this.entries.get(id) : undefined;
  }

  private indexRow(entry: Entry): FileIndexEntry {
    return {
      id: entry.id,
      workspaceId: this.workspaceId,
      path: entry.file ? filePath(entry.key) : `${entry.key}/`,
      mtime: entry.mtime,
      size: entry.size,
      hash: `${INDEX_VERSION}:${entry.fmId ? "f" : "-"}:${entry.hash}`,
      lca: entry.lca,
      indexedAt: new Date().toISOString(),
    };
  }

  private async persist(entries: Iterable<Entry>): Promise<void> {
    // One transaction, not one per file (a first open records every file).
    await this.store.fileIndex.putMany([...entries].map((e) => this.indexRow(e)));
  }

  private async forget(ids: Iterable<string>): Promise<void> {
    await this.store.fileIndex.removeMany([...ids]);
  }

  private fromRow(row: FileIndexEntry): Entry {
    const dirOnly = row.path.endsWith("/");
    const key = dirOnly ? row.path.slice(0, -1) : row.path.replace(/\.md$/, "");
    const [version, fm, hash = ""] = row.hash.split(":");
    return {
      id: row.id,
      key,
      file: !dirOnly,
      dir: dirOnly,
      hash,
      fmId: fm === "f",
      mtime: row.mtime,
      size: row.size,
      lca: row.lca,
      trashed: isTrashKey(key),
      stale: version !== INDEX_VERSION,
    };
  }

  // Live entries directly inside folder `folderKey`.
  private childrenOf(folderKey: string): Entry[] {
    const out: Entry[] = [];
    for (const e of this.entries.values()) {
      if (!e.trashed && parentKey(e.key) === folderKey && e.key !== folderKey) out.push(e);
    }
    return out;
  }

  private subtree(key: string): Entry[] {
    return [...this.entries.values()].filter((e) => isUnder(e.key, key));
  }

  // Moves the keys of `from` and everything under it to `to` (in memory).
  private rekey(from: string, to: string): Entry[] {
    const moved = this.subtree(from);
    for (const e of moved) {
      if (this.byKey.get(e.key) === e.id) this.byKey.delete(e.key);
    }
    for (const e of moved) {
      e.key = rebase(e.key, from, to);
      e.trashed = isTrashKey(e.key);
      this.byKey.set(e.key, e.id);
    }
    return moved;
  }

  // Keeps `.lydie/ids.json` minimal: an entry only where the id differs from the default rule.
  private noteId(entry: Entry, previousKey?: string): void {
    const ids = this.meta.files.ids;
    if (previousKey !== undefined && ids[previousKey] === entry.id) delete ids[previousKey];
    if (entry.trashed) {
      if (ids[entry.key] === entry.id) delete ids[entry.key];
      return;
    }
    const fallback = defaultId(this.workspaceId, entry.key, entry.fmId ? entry.id : null);
    if (fallback === entry.id) {
      if (ids[entry.key] !== undefined) delete ids[entry.key];
    } else {
      ids[entry.key] = entry.id;
    }
  }

  // ---- Opening

  async open(options: { watch: boolean }): Promise<IndexReport> {
    this.meta = await VaultMeta.load(this.root, this.options.hooks);
    this.types = await obsidianTypes(this.root);
    const report = await this.queue.run(() => this.index());
    if (options.watch) {
      this.watcher = await watchFolder(
        this.root,
        (batch) => {
          void this.queue
            .run(() => (batch.rescan ? this.syncPaths([""]) : this.syncPaths([...batch.paths])))
            .catch((error: unknown) => this.fail(error));
        },
        this.options.watch,
      );
      this.setStatus({ watching: true });
    }
    return report;
  }

  private fail(error: unknown): void {
    this.onError(error);
    this.setStatus({ error: error instanceof Error ? error.message : String(error) });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.watcher?.close();
    this.watcher = null;
    await this.queue.idle();
    for (const session of this.sessions.values()) session.handle.onClosed?.("deleted");
    this.sessions.clear();
    this.setStatus({ state: "closed", watching: false });
  }

  // Reads what changed since the database last saw the folder and writes it into the database.
  private async index(): Promise<IndexReport> {
    const started = performance.now();
    this.setStatus({ state: "indexing", indexed: 0, total: 0 });
    const ws = this.workspaceId;
    const [disk, trashDisk, rows, docs] = await Promise.all([
      scan(this.root, "", { excluded: this.excluded, cleanTemp: true }),
      scan(this.root, TRASH_DIR, { excluded: () => false }),
      this.store.fileIndex.list(ws),
      this.store.ports.db.read((tx) => tx.docs.tree(ws, { includeDeleted: true })),
    ]);
    const dbDocs = new Map<string, Document>(docs.map((d) => [d.id, d]));
    this.entries.clear();
    this.byKey.clear();
    for (const row of rows) this.setEntry(this.fromRow(row));

    // Trash: only what Lydie put there (trash.json) is part of the workspace.
    const trash = this.meta.files.trash;
    const trashObserved = new Map<string, DiskEntry>();
    for (const [id, record] of Object.entries(trash)) {
      const seen = trashDisk.get(record.key);
      if (seen && (seen.file || seen.dir)) trashObserved.set(record.key, seen);
      else delete trash[id];
    }
    const trashedIds = new Set(Object.keys(trash));

    const live = [...this.entries.values()].filter((e) => !e.trashed);
    const trashed = [...this.entries.values()].filter((e) => e.trashed);
    // A row whose document is missing from the database (a rebuilt or partial database): re-read.
    for (const e of this.entries.values()) if (!dbDocs.has(e.id)) e.stale = true;

    const total = { n: 0 };
    const taken = new Set<string>([...this.entries.keys(), ...trashedIds]);
    const plan = await this.plan(live, disk, taken, total);
    const trashPlan = await this.plan(trashed, trashObserved, taken, total, (key) => {
      const id = Object.entries(trash).find(([, r]) => r.key === key)?.[0];
      return id ?? null;
    });

    // Apply the plans to the in-memory entries.
    const contents = new Map<string, FileContent>();
    const removed = [...plan.removed, ...trashPlan.removed];
    for (const e of removed) this.dropEntry(e.id);
    const touched: Entry[] = [];
    const apply = (entry: Entry, obs: Observed, read: Read | null | undefined) => {
      const previousKey = entry.key;
      entry.key = obs.key;
      entry.dir = obs.dir;
      entry.trashed = isTrashKey(obs.key);
      entry.stale = false;
      if (obs.file && read) {
        entry.file = true;
        entry.hash = read.hash;
        entry.mtime = read.mtime;
        entry.size = read.size;
        entry.lca = read.text;
        contents.set(entry.id, read.content);
      } else if (obs.file) {
        entry.mtime = obs.file.mtime;
        entry.size = obs.file.size;
      } else {
        entry.file = false;
        entry.hash = "";
        entry.mtime = 0;
        entry.size = 0;
        entry.lca = null;
      }
      this.setEntry(entry);
      if (read || previousKey !== entry.key) this.noteId(entry, previousKey);
      touched.push(entry);
    };
    for (const p of [...plan.same, ...trashPlan.same]) {
      if (p.changed || p.entry.mtime !== p.obs.file?.mtime || p.entry.dir !== p.obs.dir) {
        apply(p.entry, p.obs, p.obs.read);
      }
    }
    for (const p of [...plan.moved, ...trashPlan.moved]) apply(p.entry, p.obs, p.obs.read);
    for (const c of [...plan.created, ...trashPlan.created]) {
      const entry: Entry = {
        id: c.id,
        key: c.obs.key,
        file: false,
        dir: false,
        hash: "",
        fmId: c.fmId,
        mtime: 0,
        size: 0,
        lca: null,
        trashed: false,
      };
      apply(entry, c.obs, c.obs.read);
    }

    // Desired documents.
    const now = new Date().toISOString();
    const desired = new Map<string, Document>();
    const liveIds = [...this.entries.values()].filter((e) => !e.trashed).map((e) => e.id);
    const sortKeys = this.computeSortKeys(dbDocs);
    for (const entry of this.entries.values()) {
      const existing = dbDocs.get(entry.id);
      const content = contents.get(entry.id);
      const record = entry.trashed ? trash[entry.id] : undefined;
      let parentId: string | null = this.entryAt(parentKey(entry.key))?.id ?? null;
      // The root of a trashed subtree remembers where it goes back to.
      if (entry.trashed && record?.parentId !== undefined) parentId = record.parentId;
      if (parentId && !this.entries.has(parentId) && !dbDocs.has(parentId)) parentId = null;
      const title = record?.title ?? titleOf(baseName(entry.key));
      const properties = content ? content.properties : (existing?.properties ?? {});
      const sortKey =
        sortKeys.get(entry.id) ??
        record?.sortKey ??
        existing?.sortKey ??
        generateKeyBetween(null, null);
      desired.set(entry.id, {
        id: entry.id,
        workspaceId: ws,
        parentId,
        title,
        sortKey,
        properties,
        createdAt: existing?.createdAt ?? (entry.mtime ? new Date(entry.mtime).toISOString() : now),
        updatedAt: existing?.updatedAt ?? (entry.mtime ? new Date(entry.mtime).toISOString() : now),
        deletedAt: record?.deletedAt ?? null,
        createdBy: existing?.createdBy ?? BRIDGE_REF,
        updatedBy: existing?.updatedBy ?? BRIDGE_REF,
      });
    }

    let created = 0;
    let updated = 0;
    const retitled: Document[] = [];
    await this.store.ports.db.write(async (tx) => {
      const purge = [...dbDocs.keys()].filter((id) => !desired.has(id));
      if (purge.length && tx.docs.purge) await tx.docs.purge(purge);
      // New documents in one statement where the store can (a first open inserts them all).
      const fresh = [...desired.values()].filter((doc) => !dbDocs.has(doc.id));
      if (tx.docs.insertMany) await tx.docs.insertMany(fresh);
      else for (const doc of fresh) await tx.docs.insert(doc);
      created += fresh.length;
      retitled.push(...fresh);
      for (const doc of desired.values()) {
        const existing = dbDocs.get(doc.id);
        if (!existing) continue;
        const patch: Partial<Document> = {};
        if (existing.parentId !== doc.parentId) patch.parentId = doc.parentId;
        if (existing.title !== doc.title) patch.title = doc.title;
        if (existing.sortKey !== doc.sortKey) patch.sortKey = doc.sortKey;
        if (existing.deletedAt !== doc.deletedAt) patch.deletedAt = doc.deletedAt;
        if (JSON.stringify(existing.properties) !== JSON.stringify(doc.properties)) {
          patch.properties = doc.properties;
        }
        if (Object.keys(patch).length) {
          await tx.docs.update(doc.id, { ...patch, updatedAt: now, updatedBy: BRIDGE_REF });
          updated++;
          if (patch.title) retitled.push(doc);
        }
      }
    });

    const treeMs = Math.round(performance.now() - started);

    // Bodies, links and blocks of everything that was read, resolved in memory with the
    // runtime's own rules (the database round trips per link would dominate otherwise).
    const memory = memoryDocs(desired);
    const bodies = [...contents.entries()];
    const chunk = 500;
    for (let i = 0; i < bodies.length; i += chunk) {
      const slice = bodies.slice(i, i + chunk).map(([id, content]) => {
        const x = extractBody(content.body);
        return { id, content, x };
      });
      const prepared: {
        id: string;
        content: FileContent;
        x: Extracted;
        links: LinkRow[];
        doc: Document;
      }[] = [];
      for (const { id, content, x } of slice) {
        const doc = desired.get(id)!;
        const links: LinkRow[] = [];
        // Body links, then [[links]] in properties (relation values are added once databases
        // are known, see indexDatabases).
        const all = [
          ...x.links.map((link) => ({ link, property: null as string | null })),
          ...propertyLinks(doc.properties).map((link) => ({ link, property: link.property })),
        ];
        for (const { link, property } of all) {
          const targetId = await resolveLink(memory, doc, link);
          links.push({
            id: uuid(),
            workspaceId: ws,
            sourceId: id,
            sourceBlockId: link.sourceBlockId,
            targetId,
            targetRef: link.target,
            targetKey: targetKey(link.target),
            targetHeading: link.heading,
            targetBlockId: link.blockId,
            kind: link.kind,
            syntax: link.syntax,
            sourceProperty: property,
          });
        }
        prepared.push({ id, content, x, links, doc });
      }
      const blocksOf = (id: string, x: Extracted) =>
        x.blocks.map((b) => ({
          docId: id,
          blockId: b.id,
          type: b.type,
          text: b.text,
          order: b.order,
        }));
      await this.store.ports.db.write(async (tx) => {
        // A chunk in a few statements where the store can: per-row statements are round trips to
        // the database worker, which dominated a first open.
        const { bodies: b, links: l, blocks: k } = tx;
        if (b.putMany && l.replaceFromMany && k?.replaceForMany) {
          await b.putMany(
            prepared.map(({ id, content, doc }) => ({
              id,
              workspaceId: ws,
              body: { markdown: content.body, version: bodyVersion(content.body) },
              updatedAt: doc.updatedAt,
            })),
          );
          await l.replaceFromMany(prepared.map(({ id, links }) => ({ sourceId: id, links })));
          await k.replaceForMany(
            prepared.map(({ id, x }) => ({ docId: id, workspaceId: ws, blocks: blocksOf(id, x) })),
          );
          return;
        }
        for (const { id, content, x, links, doc } of prepared) {
          const markdown = content.body;
          await b.put(id, ws, { markdown, version: bodyVersion(markdown) }, doc.updatedAt);
          await l.replaceFrom(id, links);
          await k?.replaceFor(id, ws, blocksOf(id, x));
        }
      });
      this.setStatus({ indexed: Math.min(i + chunk, bodies.length) });
    }
    // Sources that were not re-read keep their links; new and renamed titles may resolve some of
    // their dangling ones.
    if (contents.size < desired.size && retitled.length) {
      const targets = retitled
        .filter((d) => !d.deletedAt)
        .map((d) => ({ key: linkKey(d.title), targetId: d.id }));
      await this.store.ports.db.write(async (tx) => {
        if (tx.links.resolveDanglingMany) await tx.links.resolveDanglingMany(ws, targets);
        else for (const t of targets) await tx.links.resolveDangling(ws, t.key, t.targetId);
      });
    }

    await this.indexAttachments();
    await this.indexDatabases(disk, contents, trashDisk);
    await this.forget(removed.map((e) => e.id));
    await this.persist(touched);
    for (const key of Object.keys(this.meta.files.ids)) {
      const entry = this.entryAt(key);
      if (!entry || entry.trashed) delete this.meta.files.ids[key];
    }
    await this.meta.flush();

    const report: IndexReport = {
      ms: Math.round(performance.now() - started),
      treeMs,
      documents: liveIds.length,
      read: contents.size,
      created,
      updated,
      moved: plan.moved.length + trashPlan.moved.length,
      removed: removed.length,
    };
    this.setStatus({
      state: "ready",
      documents: liveIds.length,
      indexed: total.n,
      total: total.n,
      lastIndex: report,
    });
    return report;
  }

  // Sort keys for every live folder: `.lydie/order.json` names first, in that order, then the rest
  // by name. Existing keys are kept when they already sort that way.
  private computeSortKeys(dbDocs: Map<string, Document>): Map<string, string> {
    const out = new Map<string, string>();
    const folders = new Map<string, Entry[]>();
    for (const e of this.entries.values()) {
      if (e.trashed) continue;
      const parent = parentKey(e.key);
      let list = folders.get(parent);
      if (!list) folders.set(parent, (list = []));
      list.push(e);
    }
    for (const [folder, children] of folders) {
      const parentId = this.entryAt(folder)?.id ?? null;
      const ordered = this.canonicalOrder(folder, children);
      const keys = ordered.map((e) => {
        const doc = dbDocs.get(e.id);
        return doc && doc.parentId === parentId && !doc.deletedAt ? doc.sortKey : null;
      });
      const present = keys.filter((k): k is string => k !== null);
      const increasing = present.every((k, i) => i === 0 || present[i - 1]! < k);
      if (!increasing) {
        const fresh = generateNKeysBetween(null, null, ordered.length);
        ordered.forEach((e, i) => out.set(e.id, fresh[i]!));
        continue;
      }
      for (let i = 0; i < ordered.length;) {
        if (keys[i] !== null) {
          out.set(ordered[i]!.id, keys[i]!);
          i++;
          continue;
        }
        let j = i;
        while (j < ordered.length && keys[j] === null) j++;
        const fresh = generateNKeysBetween(keys[i - 1] ?? null, keys[j] ?? null, j - i);
        for (let k = i; k < j; k++) out.set(ordered[k]!.id, fresh[k - i]!);
        i = j;
      }
    }
    return out;
  }

  private canonicalOrder<T extends { key: string }>(folder: string, children: T[]): T[] {
    const listed = this.meta.files.order[folder] ?? [];
    const byName = new Map(children.map((c) => [baseName(c.key), c]));
    const out: T[] = [];
    for (const name of listed) {
      const c = byName.get(name);
      if (c) {
        out.push(c);
        byName.delete(name);
      }
    }
    const rest = [...byName.values()].sort((a, b) =>
      compareNames(baseName(a.key), baseName(b.key)),
    );
    return [...out, ...rest];
  }

  // Compares what the index knows under some keys with what is on disk: same key, renamed or
  // moved (paired by content hash, then by id, folders by their paired contents), created, removed.
  private async plan(
    known: Entry[],
    observed: Map<string, DiskEntry>,
    taken: Set<string>,
    progress: { n: number },
    idFor?: (key: string) => string | null,
  ): Promise<Plan> {
    const byKey = new Map(known.map((e) => [e.key, e]));
    const same: Plan["same"] = [];
    const fresh: Observed[] = [];
    const toRead: Observed[] = [];
    for (const d of observed.values()) {
      const obs: Observed = { ...d };
      const entry = byKey.get(d.key);
      if (entry) {
        byKey.delete(d.key);
        same.push({ entry, obs, changed: false });
        if (
          d.file &&
          (!entry.file || entry.stale || entry.mtime !== d.file.mtime || entry.size !== d.file.size)
        ) {
          toRead.push(obs);
        }
      } else {
        fresh.push(obs);
        if (d.file) toRead.push(obs);
      }
    }
    progress.n += toRead.length;
    this.setStatus({ total: progress.n });
    let done = 0;
    await mapLimit(toRead, 32, async (obs) => {
      const state = await readFileState(this.absFile(obs.key));
      if (!state || state.text === null) {
        obs.read = null;
      } else {
        obs.read = {
          text: state.text,
          hash: state.hash,
          content: readContent(state.text),
          mtime: state.mtime,
          size: state.size,
        };
      }
      if (++done % 200 === 0) this.setStatus({ indexed: done });
    });

    for (const p of same) {
      const { entry, obs } = p;
      if (obs.file) {
        p.changed = obs.read ? obs.read.hash !== entry.hash || !entry.file || !!entry.stale : false;
      } else {
        p.changed = entry.file;
      }
    }

    // Pairing.
    const gone = new Map([...byKey.values()].map((e) => [e.id, e]));
    const moved: Plan["moved"] = [];
    const remaining = new Set(fresh.filter((o) => !o.file || o.read));
    const pair = (entry: Entry, obs: Observed, changed: boolean) => {
      gone.delete(entry.id);
      remaining.delete(obs);
      moved.push({ entry, obs, changed });
    };
    const byHash = new Map<string, Entry[]>();
    for (const e of gone.values()) {
      if (!e.file) continue;
      for (const h of new Set([e.hash, e.seen])) {
        if (!h) continue;
        const list = byHash.get(h) ?? [];
        list.push(e);
        byHash.set(h, list);
      }
    }
    for (const obs of [...remaining]) {
      if (!obs.read) continue;
      const candidates = (byHash.get(obs.read.hash) ?? []).filter((e) => gone.has(e.id));
      if (!candidates.length) continue;
      const best =
        candidates.find((e) => baseName(e.key) === baseName(obs.key)) ??
        candidates.find((e) => parentKey(e.key) === parentKey(obs.key)) ??
        candidates[0]!;
      pair(best, obs, false);
    }
    for (const obs of [...remaining]) {
      const id = idFor?.(obs.key) ?? this.meta.files.ids[obs.key] ?? obs.read?.content.id ?? null;
      const entry = id ? gone.get(id) : undefined;
      if (entry) pair(entry, obs, true);
    }
    // Folders follow their contents: walk up from each moved pair while both sides are unpaired
    // folders at the same relative position.
    const goneByKey = new Map([...gone.values()].map((e) => [e.key, e]));
    const freshByKey = new Map([...remaining].map((o) => [o.key, o]));
    for (const m of [...moved]) {
      let from = parentKey(m.entry.key);
      let to = parentKey(m.obs.key);
      while (from !== "" && to !== "") {
        const entry = goneByKey.get(from);
        const obs = freshByKey.get(to);
        if (!entry || !obs || !gone.has(entry.id) || !remaining.has(obs)) break;
        pair(entry, obs, entry.file !== !!obs.file || (!!obs.read && obs.read.hash !== entry.hash));
        from = parentKey(from);
        to = parentKey(to);
      }
    }

    const created: Plan["created"] = [];
    const ordered = [...remaining].sort((a, b) => (a.key < b.key ? -1 : 1));
    for (const obs of ordered) {
      const forced = idFor?.(obs.key);
      const fm = obs.read?.content.id ?? null;
      // Trash records name their ids; they are authoritative.
      const id =
        forced ?? assignId(this.workspaceId, obs.key, fm, this.meta.files.ids, (x) => taken.has(x));
      taken.add(id);
      created.push({ obs, id, fmId: fm !== null && id === fm });
    }
    return { same, moved, created, removed: [...gone.values()] };
  }

  private async indexAttachments(): Promise<void> {
    const records = this.meta.files.attachments;
    if (!Object.keys(records).length) return;
    await this.store.ports.db.write(async (tx) => {
      if (!tx.attachments) return;
      for (const [id, r] of Object.entries(records)) {
        if (await tx.attachments.get(id)) continue;
        await tx.attachments.insert(attachmentOf(id, r));
      }
    });
  }

  // ---- Databases (`<Folder>/<Folder>.base`, see databases.ts)

  // Folders with a database .base file become databases; databases whose file is gone become
  // pages again; row values read from files get their relation and file links resolved.
  private async indexDatabases(
    disk: Map<string, DiskEntry>,
    contents: Map<string, FileContent>,
    trashDisk: Map<string, DiskEntry>,
  ): Promise<void> {
    const listed = (
      (await this.runtime.execute("database.list", { workspaceId: this.workspaceId })) as {
        databases: { id: string }[];
      }
    ).databases;
    const found = new Set<string>();
    for (const [key, d] of disk) {
      if (!d.bases?.length) continue;
      const entry = this.entryAt(key);
      if (!entry || entry.trashed) continue;
      const name = await this.pickBase(entry, d.bases);
      if (!name) continue;
      found.add(entry.id);
      try {
        await this.baseFromDisk(entry, name);
      } catch (error) {
        this.onError(error);
      }
    }
    for (const { id } of listed) {
      const entry = this.entries.get(id);
      if (found.has(id) || !entry || entry.trashed) continue;
      await this.exec("database.delete", { id });
    }
    await this.indexTrashedDatabases(trashDisk);
    this.schemas.clear();
    for (const { id } of (
      (await this.runtime.execute("database.list", { workspaceId: this.workspaceId })) as {
        databases: { id: string }[];
      }
    ).databases) {
      await this.loadSchema(id);
    }
    // Row values: `[[links]]` in relation and file properties become ids.
    const updates: { id: string; properties: Properties }[] = [];
    for (const [id, content] of contents) {
      const entry = this.entries.get(id);
      if (!entry || entry.trashed) continue;
      const parentId = this.entryAt(parentKey(entry.key))?.id ?? null;
      const mapped = this.dbProperties(parentId, content);
      if (JSON.stringify(mapped) !== JSON.stringify(content.properties)) {
        updates.push({ id, properties: mapped });
      }
    }
    if (updates.length) {
      await this.store.ports.db.write(async (tx) => {
        for (const u of updates) {
          await tx.docs.update(u.id, { properties: u.properties });
          // Its property links are now relation ids: rebuild them as the runtime would.
          const doc = await tx.docs.get(u.id);
          if (!doc || !tx.links.from) continue;
          const keep = (await tx.links.from(u.id)).filter((l) => !l.sourceProperty);
          const rows: LinkRow[] = [...keep];
          for (const link of propertyLinks(doc.properties, await relationKeysOf(tx, doc))) {
            rows.push({
              id: uuid(),
              workspaceId: doc.workspaceId,
              sourceId: doc.id,
              sourceBlockId: null,
              // A relation id keeps its target in the trash, as a live link would.
              targetId:
                (await resolveLink(tx, doc, link)) ??
                ((await tx.docs.get(link.target)) ? link.target : null),
              targetRef: link.target,
              targetKey: targetKey(link.target),
              targetHeading: link.heading,
              targetBlockId: link.blockId,
              kind: link.kind,
              syntax: link.syntax,
              sourceProperty: link.property,
            });
          }
          await tx.links.replaceFrom(u.id, rows);
        }
      });
    }
    await this.flushBases();
  }

  // Databases in the trash (a rebuilt index): their folder in `.trash/` still holds the .base file.
  // Operations only make live documents databases, so the document is live for the moment it takes
  // to apply the file (direct writes, no events), then back in the trash as it was.
  private async indexTrashedDatabases(trashDisk: Map<string, DiskEntry>): Promise<void> {
    for (const entry of [...this.entries.values()]) {
      if (!entry.trashed) continue;
      const names = trashDisk.get(entry.key)?.bases;
      if (!names?.length) continue;
      const known = await this.store.ports.db.read(
        async (tx) => (await tx.databases?.get(entry.id)) ?? null,
      );
      if (known) continue;
      const name = await this.pickBase(entry, names);
      if (!name) continue;
      const doc = await this.store.getDoc(entry.id, { includeBody: false });
      const deletedAt = doc?.document.deletedAt;
      if (!deletedAt) continue;
      await this.store.ports.db.write((tx) => tx.docs.update(entry.id, { deletedAt: null }));
      try {
        await this.baseFromDisk(entry, name);
      } catch (error) {
        this.onError(error);
      } finally {
        await this.store.ports.db.write((tx) => tx.docs.update(entry.id, { deletedAt }));
        this.schemas.delete(entry.id);
        this.baseDirty.delete(entry.id);
      }
    }
  }

  // The .base file of a database folder: `<Folder>.base`, or (after the folder was renamed by
  // another program) a .base file naming this document in `lydie.id`.
  private async pickBase(entry: Entry, names: readonly string[]): Promise<string | null> {
    const canonical = baseFileFor(entry.key);
    if (names.includes(canonical)) return canonical;
    for (const name of names) {
      const text = await readFile(join(this.abs(entry.key), name), "utf8").catch(() => null);
      if (text !== null && baseIdOf(text) === entry.id) return name;
    }
    return null;
  }

  private async databaseDef(id: string): Promise<DatabaseDefinition | null> {
    try {
      const def = (await this.runtime.execute("database.get", { id })) as DatabaseDefinition;
      return def.database.deletedAt ? null : def;
    } catch (error) {
      if (isLydieError(error) && error.code === "not_found") return null;
      throw error;
    }
  }

  private async loadSchema(id: string): Promise<void> {
    const def = await this.databaseDef(id);
    if (def) this.schemas.set(id, def.properties);
    else this.schemas.delete(id);
  }

  private baseOptions(folder: string) {
    return {
      folder,
      linkFor: (id: string) => this.linkFor(id),
      resolveProperty: (propertyId: string) => {
        for (const props of this.schemas.values()) {
          const p = props.find((x) => x.id === propertyId);
          if (p) return { type: p.type, key: p.key };
        }
        return null;
      },
    };
  }

  // Applies a database folder's .base file (the file wins for what Obsidian understands). A file
  // seen for the first time gets ids derived from the document id, so a rebuild gives the same
  // ones without writing to the file; ids minted for things added later are written back.
  private async baseFromDisk(entry: Entry, name: string, force = false): Promise<void> {
    const text = await readFile(join(this.abs(entry.key), name), "utf8").catch(() => null);
    if (text === null) return;
    const canonical = baseFileFor(entry.key);
    const current = await this.databaseDef(entry.id);
    if (
      !force &&
      current &&
      name === canonical &&
      toBase(baseDefinitionOf(current), this.baseOptions(entry.key)) === text
    ) {
      return;
    }
    let n = 0;
    let minted = 0;
    const read = fromBase(text, {
      newId: () => {
        minted++;
        return current ? uuid() : deriveId(this.workspaceId, `base:${entry.id}`, n++);
      },
      ...(current ? { existing: { properties: current.properties, views: current.views } } : {}),
      types: this.types,
      idFor: (link) => this.idForLink(link),
    });
    for (const warning of read.warnings) {
      this.onError(new Error(`${entry.key}/${name}: ${warning}`));
    }
    const retargeted = await this.retargetRelations(read.definition.properties);
    if (!current) {
      const title = read.definition.properties.find((p) => p.type === "title");
      const view = read.definition.views[0];
      await this.exec("database.create", {
        workspaceId: this.workspaceId,
        documentId: entry.id,
        ...(title ? { titlePropertyId: title.id } : {}),
        ...(view ? { viewId: view.id, viewType: view.type } : {}),
      });
    }
    const now = current ?? (await this.databaseDef(entry.id));
    if (now && !sameDefinition(now, read.definition)) {
      await this.exec("database.setDefinition", { id: entry.id, definition: read.definition });
    }
    await this.loadSchema(entry.id);
    if (read.id && read.id !== entry.id) {
      this.baseAliases.set(read.id, entry.id);
      await this.retargetTo(read.id);
    }
    // Persist ids minted for an edit made elsewhere and relation targets found under another id, and
    // move a renamed folder's file into place.
    if ((current && minted > 0) || retargeted || name !== canonical) {
      this.baseDirty.set(entry.id, name === canonical ? undefined : name);
    }
  }

  // A relation names its target database by id, and a database's id is its folder's document id.
  // The folder can have another id here than in the file that wrote the relation (indexed while
  // another Lydie process was still writing the folder, or copied without `.lydie/`), but its own
  // .base still names that id in `lydie.id`: follow it, or the relation points at nothing.
  private async retargetRelations(properties: PropertyInput[]): Promise<boolean> {
    let changed = false;
    for (const p of properties) {
      const relation = p.type === "relation" ? p.config?.relation : undefined;
      if (!relation?.databaseId || this.entries.has(relation.databaseId)) continue;
      const id = await this.databaseNamed(relation.databaseId);
      if (!id) continue;
      p.config = { ...p.config, relation: { ...relation, databaseId: id } };
      changed = true;
    }
    return changed;
  }

  // A database whose file names another id than its folder's arrived after other .base files that
  // relate to it were applied: read those again, so their relations find it.
  private async retargetTo(baseId: string): Promise<void> {
    if (this.retargeting.has(baseId)) return;
    this.retargeting.add(baseId);
    try {
      for (const [id, props] of [...this.schemas]) {
        if (!props.some((p) => p.type === "relation" && p.config.relation?.databaseId === baseId)) {
          continue;
        }
        const entry = this.entries.get(id);
        if (!entry || entry.trashed) continue;
        const name = baseFileFor(entry.key);
        if (await exists(join(this.abs(entry.key), name))) {
          await this.baseFromDisk(entry, name, true);
        }
      }
    } finally {
      this.retargeting.delete(baseId);
    }
  }

  // The folder whose .base file names `baseId` in `lydie.id`. Read from disk, so it does not matter
  // which .base file was applied first.
  private async databaseNamed(baseId: string): Promise<string | null> {
    const alias = this.baseAliases.get(baseId);
    if (alias && this.entries.get(alias)?.trashed === false) return alias;
    for (const e of this.entries.values()) {
      if (e.trashed || !e.dir) continue;
      const file = join(this.abs(e.key), baseFileFor(e.key));
      const text = await readFile(file, "utf8").catch(() => null);
      if (text !== null && baseIdOf(text) === baseId) return e.id;
    }
    return null;
  }

  private async flushBases(): Promise<void> {
    for (const [id, previous] of [...this.baseDirty]) {
      this.baseDirty.delete(id);
      try {
        await this.baseToDisk(id, previous);
      } catch (error) {
        this.onError(error);
      }
    }
  }

  // Writes a database's .base file (only when its text changes). A database turned back into a
  // page has its file moved to the trash.
  private async baseToDisk(id: string, previousName?: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry || entry.trashed) return;
    const dir = this.abs(entry.key);
    const canonical = join(dir, baseFileFor(entry.key));
    const def = await this.databaseDef(id);
    if (!def) {
      this.schemas.delete(id);
      for (const name of [baseFileFor(entry.key), previousName]) {
        if (!name || !(await exists(join(dir, name)))) continue;
        let target = join(this.root, TRASH_DIR, entry.key, name);
        for (let i = 1; await exists(target); i++) {
          target = join(
            this.root,
            TRASH_DIR,
            entry.key,
            `${name.slice(0, -BASE_EXT.length)} ${i}${BASE_EXT}`,
          );
        }
        await move(join(dir, name), target);
      }
      return;
    }
    this.schemas.set(id, def.properties);
    await mkdir(dir, { recursive: true });
    if (!entry.dir) {
      entry.dir = true;
      await this.persist([entry]);
    }
    const text = toBase(baseDefinitionOf(def), this.baseOptions(entry.key));
    const current = await readFile(canonical, "utf8").catch(() => null);
    if (current !== text) await atomicWrite(canonical, text, this.options.hooks);
    // Files from before a rename that still name this database.
    for (const name of await readdir(dir).catch(() => [] as string[])) {
      if (!name.endsWith(BASE_EXT) || join(dir, name) === canonical) continue;
      const other = await readFile(join(dir, name), "utf8").catch(() => null);
      if (name === previousName || (other !== null && baseIdOf(other) === id)) {
        await rm(join(dir, name), { force: true });
      }
    }
  }

  // Link target of a document (its vault path without .md) or attachment (its file path).
  private linkFor(id: string): string | null {
    const entry = this.entries.get(id);
    if (entry && !entry.trashed) return entry.key;
    return this.meta.files.attachments[id]?.path ?? null;
  }

  private idForLink(target: string): string | null {
    const clean = target.trim().replace(/^\/+/, "");
    const key = clean.replace(/\.md$/i, "");
    const entry = this.entryAt(key);
    if (entry && !entry.trashed) return entry.id;
    // A relation to a document in the trash keeps pointing at it (as the database does).
    const trashed = this.entryAt(`${TRASH_DIR}/${key}`);
    if (trashed?.trashed) return trashed.id;
    for (const [id, r] of Object.entries(this.meta.files.attachments)) {
      if (r.path === clean && !r.deletedAt) return id;
    }
    // A bare title, if it names one document.
    if (key.includes("/")) return null;
    const lower = key.toLowerCase();
    let found: string | null = null;
    for (const e of this.entries.values()) {
      if (e.trashed || baseName(e.key).toLowerCase() !== lower) continue;
      if (found) return null;
      found = e.id;
    }
    return found;
  }

  private rowSchema(parentId: string | null): DatabaseProperty[] | null {
    const props = parentId ? this.schemas.get(parentId) : undefined;
    return props?.filter((p) => p.type === "relation" || p.type === "files") ?? null;
  }

  // A file's properties as the database stores them: in rows, relation and file links become ids.
  private dbProperties(parentId: string | null, content: FileContent): Properties {
    const linked = this.rowSchema(parentId);
    if (!linked?.length || !content.frontmatter) return content.properties;
    const out: Properties = { ...content.properties };
    for (const p of linked) {
      if (!Object.hasOwn(content.frontmatter, p.key)) continue;
      out[p.key] = fromFileValue(p, content.frontmatter[p.key], {
        idFor: (t) => this.idForLink(t),
      });
    }
    return out;
  }

  // The inverse: relation and file ids become `[[path]]` links in the row's frontmatter.
  private fileProperties(parentId: string | null, properties: Properties): Properties {
    const linked = this.rowSchema(parentId);
    if (!linked?.length) return properties;
    const out: Properties = { ...properties };
    for (const p of linked) {
      const value = out[p.key];
      if (value === undefined || value === null) continue;
      out[p.key] = toFileValue(p, value, { linkFor: (id) => this.linkFor(id) });
    }
    return out;
  }

  // Relation and file values that were links to nothing when their row was read stay as written;
  // documents that arrived or moved since may be what they name. Rows are written as the bridge.
  private async resolveRowLinks(): Promise<string[]> {
    const changed: string[] = [];
    for (const [dbId, props] of this.schemas) {
      const linked = props.filter((p) => p.type === "relation" || p.type === "files");
      if (!linked.length) continue;
      const rows = await this.store.ports.db.read((tx) => tx.docs.children(this.workspaceId, dbId));
      for (const row of rows) {
        const set: Properties = {};
        for (const p of linked) {
          const value = row.properties[p.key];
          if (!Array.isArray(value) || !value.some((x) => x.startsWith("[["))) continue;
          const next = fromFileValue(p, value, { idFor: (t) => this.idForLink(t) });
          if (JSON.stringify(next) !== JSON.stringify(value)) set[p.key] = next;
        }
        if (Object.keys(set).length === 0) continue;
        try {
          await this.exec("doc.setProperties", { id: row.id, set });
          changed.push(row.id);
        } catch (error) {
          this.onError(error);
        }
      }
    }
    return changed;
  }

  // Rows whose relation or file values point at any of `ids`, so their links follow a move.
  private async rowsReferencing(ids: ReadonlySet<string>): Promise<string[]> {
    const out: string[] = [];
    for (const [dbId, props] of this.schemas) {
      const linked = props.filter((p) => p.type === "relation" || p.type === "files");
      if (!linked.length) continue;
      const rows = await this.store.ports.db.read((tx) => tx.docs.children(this.workspaceId, dbId));
      for (const row of rows) {
        const hit = linked.some((p) => {
          const v = row.properties[p.key];
          return Array.isArray(v) && v.some((x) => ids.has(x));
        });
        if (hit) out.push(row.id);
      }
    }
    return out;
  }

  // ---- External changes (watcher)

  // Rescans the given vault-relative paths and applies what changed as operations.
  async rescan(paths: string[] = [""]): Promise<void> {
    await this.queue.run(() => this.syncPaths(paths));
  }

  get linkFormat(): LinkFormat {
    return this._linkFormat;
  }

  setLinkFormat(format: LinkFormat): void {
    this._linkFormat = format;
  }

  // New attachment folder and exclude patterns (folder settings): notes that become excluded leave
  // the index and come back with their ids when no longer excluded, as with any rescan.
  async setExclusions(attachmentsFolder: string, exclude: readonly string[]): Promise<void> {
    await this.queue.run(async () => {
      this.attachmentsFolder = attachmentsFolder;
      this.excluded = exclusions(attachmentsFolder, exclude);
      await this.syncPaths([""]);
    });
  }

  private async syncPaths(rawPaths: string[]): Promise<void> {
    if (this.closed) return;
    this.rescans++;
    // Paths to the keys whose subtree to rescan; the trash and .lydie are handled separately.
    const roots = new Set<string>();
    // Folders whose .base file changed.
    const baseFolders = new Set<string>();
    let trashTouched = false;
    for (const raw of rawPaths) {
      const path = raw.replace(/\/+$/, "");
      if (path.startsWith(`${META_DIR}/`) || path === META_DIR) continue;
      if (isTrashKey(path)) {
        trashTouched = true;
        continue;
      }
      if (path.split("/").some(isHiddenName)) continue;
      if (path.endsWith(BASE_EXT)) {
        if (path.includes("/")) baseFolders.add(parentKey(path));
        continue;
      }
      const key = path.endsWith(MD) ? path.slice(0, -MD.length) : path;
      if (key !== "" && this.excluded(key)) continue;
      roots.add(key);
    }
    const sorted = [...roots].sort((a, b) => a.length - b.length);
    const tops: string[] = [];
    for (const key of sorted) if (!tops.some((t) => isUnder(key, t))) tops.push(key);

    const observed = new Map<string, DiskEntry>();
    const known: Entry[] = [];
    const knownIds = new Set<string>();
    for (const top of tops) {
      // A file event names `<key>.md`, a folder event `<key>`: rescanning the key covers both.
      for (const [k, d] of await scan(this.root, top, { excluded: this.excluded })) {
        observed.set(k, d);
      }
      for (const e of top === "" ? this.entries.values() : this.subtree(top)) {
        if (!e.trashed && !knownIds.has(e.id)) {
          known.push(e);
          knownIds.add(e.id);
        }
      }
    }
    // A pending delete of `a` and create of `b` arrive as two roots: both are in `known`/`observed`.
    const taken = new Set(this.entries.keys());
    const plan = await this.plan(known, observed, taken, { n: 0 });
    const changedIds = await this.applyPlan(plan);
    if (trashTouched) changedIds.push(...(await this.syncTrash()));
    // Folders that arrived or moved may carry a database; a full rescan checks every database.
    for (const item of [...plan.created, ...plan.moved]) {
      if (item.obs.bases?.length) baseFolders.add(item.obs.key);
    }
    if (tops.includes("")) {
      for (const [key, d] of observed) if (d.bases?.length) baseFolders.add(key);
      for (const id of this.schemas.keys()) {
        const entry = this.entries.get(id);
        if (entry) baseFolders.add(entry.key);
      }
    }
    changedIds.push(...(await this.syncBases(baseFolders)));
    if (plan.created.length || plan.moved.length)
      changedIds.push(...(await this.resolveRowLinks()));
    await this.flushBases();
    await this.meta.flush();
    if (changedIds.length) {
      for (const listener of this.changeListeners) listener({ ids: changedIds });
    }
  }

  // Re-reads the .base files of these folders: a new or edited file is applied, a database whose
  // file is gone becomes a page again.
  private async syncBases(folders: ReadonlySet<string>): Promise<string[]> {
    const changed: string[] = [];
    for (const folder of folders) {
      const entry = this.entryAt(folder);
      if (!entry || entry.trashed) continue;
      const names = (await readdir(this.abs(folder)).catch(() => [] as string[])).filter((n) =>
        n.endsWith(BASE_EXT),
      );
      try {
        const name = await this.pickBase(entry, names);
        if (name) {
          await this.baseFromDisk(entry, name);
        } else if (this.schemas.has(entry.id)) {
          await this.exec("database.delete", { id: entry.id });
          this.schemas.delete(entry.id);
        } else {
          continue;
        }
        changed.push(entry.id);
      } catch (error) {
        this.onError(error);
      }
    }
    return changed;
  }

  private exec(id: OperationId, input: Record<string, unknown>): Promise<unknown> {
    return this.runtime.execute(id, input as never, { actor: BRIDGE_ACTOR, history: false });
  }

  private async applyPlan(plan: Plan): Promise<string[]> {
    const changed: string[] = [];
    const ws = this.workspaceId;
    // Removals first (a removed name may be reused by a created one), parents first: deleting a
    // document deletes its subtree.
    const removals = [...plan.removed].sort((a, b) => a.key.length - b.key.length);
    for (const entry of removals) {
      if (this.entries.get(entry.id) !== entry) continue;
      // Changed by an operation whose file is not written yet: writing it recreates the file.
      if (this.pending.has(entry.id)) continue;
      try {
        const doc = await this.store.getDoc(entry.id, { includeBody: false });
        if (doc && !doc.document.deletedAt) await this.exec("doc.delete", { id: entry.id });
        if (doc) await this.exec("doc.purge", { id: entry.id });
      } catch (error) {
        this.onError(error);
      }
      const gone = this.subtree(entry.key);
      for (const e of gone) {
        this.dropEntry(e.id);
        this.sessions.get(e.id)?.handle.onClosed?.("deleted");
        this.sessions.delete(e.id);
        if (this.meta.files.ids[e.key] === e.id) delete this.meta.files.ids[e.key];
        changed.push(e.id);
      }
      await this.forget(gone.map((e) => e.id));
    }

    // Moves and creations, parents before children.
    type Item =
      | { kind: "moved"; entry: Entry; obs: Observed; changed: boolean }
      | { kind: "created"; obs: Observed; id: string; fmId: boolean };
    const items: Item[] = [
      ...plan.moved.map((m) => ({ kind: "moved" as const, ...m })),
      ...plan.created.map((c) => ({ kind: "created" as const, ...c })),
    ].sort((a, b) => a.obs.key.split("/").length - b.obs.key.split("/").length);

    // Rekey moved entries first so parents resolve by their new keys.
    for (const item of items) {
      if (item.kind !== "moved") continue;
      const previous = item.entry.key;
      if (this.byKey.get(previous) === item.entry.id) this.byKey.delete(previous);
      item.entry.key = item.obs.key;
      item.entry.trashed = false;
      this.byKey.set(item.entry.key, item.entry.id);
      this.noteId(item.entry, previous);
    }
    for (const item of items) {
      if (item.kind !== "created") continue;
      this.setEntry({
        id: item.id,
        key: item.obs.key,
        file: false,
        dir: false,
        hash: "",
        fmId: item.fmId,
        mtime: 0,
        size: 0,
        lca: null,
        trashed: false,
      });
    }

    for (const item of items) {
      const id = item.kind === "moved" ? item.entry.id : item.id;
      const entry = this.entries.get(id)!;
      const read = item.obs.read;
      const parentId = this.entryAt(parentKey(entry.key))?.id ?? null;
      const title = titleOf(baseName(entry.key));
      const placement = await this.placement(entry, parentId);
      let applied = true;
      try {
        if (item.kind === "created") {
          await this.exec("doc.create", {
            workspaceId: ws,
            id,
            parentId,
            title,
            properties: read ? this.dbProperties(parentId, read.content) : {},
            ...(read ? { markdown: read.content.body } : {}),
            ...placement,
          });
        } else {
          const doc = await this.store.getDoc(id, { includeBody: true });
          if (doc && doc.document.parentId !== parentId) {
            await this.exec("doc.move", { id, parentId, ...placement });
          }
          if (doc && doc.document.title !== title) await this.exec("doc.rename", { id, title });
          if (doc && read && (item.changed || doc.body?.markdown !== read.content.body)) {
            applied = await this.contentFromDisk(id, item.obs);
          }
        }
      } catch (error) {
        this.onError(error);
      }
      if (applied) this.applyObserved(entry, item.obs);
      else this.observedOnly(entry, item.obs);
      this.noteId(entry);
      await this.persist([entry]);
      changed.push(id);
    }

    // Same key, changed content (or a folder gaining or losing its note).
    for (const { entry, obs, changed: contentChanged } of plan.same) {
      const dirChanged = entry.dir !== obs.dir;
      if (!contentChanged && !dirChanged) {
        if (obs.file && obs.file.mtime !== entry.mtime) {
          entry.mtime = obs.file.mtime;
          await this.persist([entry]);
        }
        continue;
      }
      let applied = true;
      if (contentChanged) {
        applied = await this.contentFromDisk(entry.id, obs);
        if (applied) changed.push(entry.id);
      }
      if (applied) this.applyObserved(entry, obs);
      else this.observedOnly(entry, obs);
      await this.persist([entry]);
      if (applied && contentChanged && obs.read) await this.notifySession(entry.id, obs.read.text);
    }
    return changed;
  }

  // Applies a file's content to its document, unless an operation changed the document and its
  // file is not written yet: writing that operation will merge the two (its base is the entry's
  // last agreed text, which is therefore left as it is). Returns whether it was applied.
  private async contentFromDisk(id: string, obs: Observed): Promise<boolean> {
    if (this.pending.has(id)) return false;
    const doc = await this.store.getDoc(id, { includeBody: true });
    if (!doc) return true;
    const content = obs.read ? obs.read.content : readContent("");
    try {
      return await this.applyContent(
        id,
        doc.document,
        doc.body?.markdown ?? null,
        content,
        doc.body?.version,
      );
    } catch (error) {
      this.onError(error);
      return true;
    }
  }

  // The file changed but its content was not applied (see contentFromDisk): keep the agreed state
  // for the merge, remember what is on disk for rename pairing.
  private observedOnly(entry: Entry, obs: Observed): void {
    entry.dir = obs.dir;
    if (obs.read) entry.seen = obs.read.hash;
  }

  private applyObserved(entry: Entry, obs: Observed): void {
    entry.dir = obs.dir;
    entry.stale = false;
    entry.seen = undefined;
    if (obs.file && obs.read) {
      entry.file = true;
      entry.hash = obs.read.hash;
      entry.mtime = obs.read.mtime;
      entry.size = obs.read.size;
      entry.lca = obs.read.text;
    } else if (obs.file) {
      entry.mtime = obs.file.mtime;
      entry.size = obs.file.size;
    } else {
      entry.file = false;
      entry.hash = "";
      entry.mtime = 0;
      entry.size = 0;
      entry.lca = null;
    }
  }

  // Makes a document's body and properties in the database match file content (as the bridge).
  // Returns false when the body changed in the database since `body` was read (an operation
  // committed meanwhile): then nothing is applied, and writing that operation merges both sides.
  private async applyContent(
    id: string,
    doc: Document,
    body: string | null,
    content: FileContent,
    version?: string,
  ): Promise<boolean> {
    if (body !== content.body) {
      try {
        await this.exec("doc.updateBody", {
          id,
          markdown: content.body,
          ...(version !== undefined ? { expectedVersion: version } : {}),
        });
      } catch (error) {
        if (isLydieError(error) && error.code === "conflict") return false;
        throw error;
      }
    }
    const properties = this.dbProperties(doc.parentId, content);
    const set: Properties = {};
    const unset: string[] = [];
    for (const [key, value] of Object.entries(properties)) {
      if (JSON.stringify(doc.properties[key]) !== JSON.stringify(value)) set[key] = value;
    }
    for (const key of Object.keys(doc.properties)) {
      if (!Object.hasOwn(properties, key)) unset.push(key);
    }
    if (Object.keys(set).length || unset.length) {
      await this.exec("doc.setProperties", { id, set, unset });
    }
    return true;
  }

  // Where a document coming from disk goes among its live siblings, following the canonical order.
  private async placement(
    entry: Entry,
    parentId: string | null,
  ): Promise<{ afterId?: string; beforeId?: string }> {
    const folder = parentKey(entry.key);
    const siblings = await this.store.ports.db.read((tx) =>
      tx.docs.children(this.workspaceId, parentId),
    );
    const placed = new Set(siblings.map((d) => d.id));
    const ordered = this.canonicalOrder(folder, this.childrenOf(folder));
    const at = ordered.findIndex((e) => e.id === entry.id);
    for (let i = at - 1; i >= 0; i--) {
      const id = ordered[i]!.id;
      if (placed.has(id) && id !== entry.id) return { afterId: id };
    }
    for (let i = at + 1; i < ordered.length; i++) {
      const id = ordered[i]!.id;
      if (placed.has(id) && id !== entry.id) return { beforeId: id };
    }
    return {};
  }

  // Trashed files that vanished (emptied by another program) are purged.
  private async syncTrash(): Promise<string[]> {
    const out: string[] = [];
    for (const [id, record] of Object.entries(this.meta.files.trash)) {
      const present =
        (await exists(this.absFile(record.key))) || (await isDirectory(this.abs(record.key)));
      if (present) continue;
      delete this.meta.files.trash[id];
      try {
        if (await this.store.getDoc(id, { includeBody: false })) {
          await this.exec("doc.purge", { id });
        }
      } catch (error) {
        this.onError(error);
      }
      this.dropEntry(id);
      await this.store.fileIndex.remove(id);
      out.push(id);
    }
    return out;
  }

  // ---- Operations → files

  // The runtime's events port: runs after an operation commits and resolves once the folder
  // reflects it, so an operation is complete only when its files have landed (plan §1).
  // Operations that commit while earlier ones wait for the queue share their write: a burst of
  // renames (typing a title) renames the file and rewrites the links to it once.
  async handleEvents(events: readonly LydieEvent[]): Promise<void> {
    if (events.length === 0 || this.closed) return;
    if (events.every((e) => e.actor.type === "system" && e.actor.id === BRIDGE_ACTOR.id)) return;
    const ids = idsOf(events);
    // Until their files are written, these documents are ahead of the folder: a watcher batch must
    // not overwrite them from disk (it would undo the operation).
    for (const id of ids) this.pending.set(id, (this.pending.get(id) ?? 0) + 1);
    let batch = this.waiting;
    if (batch) {
      batch.events.push(...events);
      batch.ids.push(...ids);
    } else {
      const next: WriteBatch = { events: [...events], ids: [...ids], done: Promise.resolve() };
      this.waiting = batch = next;
      next.done = this.queue.run(
        async () => {
          // Operations from now on wait for the next batch.
          if (this.waiting === next) this.waiting = null;
          try {
            await this.writeEvents(next.events, idsOf(next.events));
          } finally {
            for (const id of next.ids) {
              const n = (this.pending.get(id) ?? 1) - 1;
              if (n > 0) this.pending.set(id, n);
              else this.pending.delete(id);
            }
          }
        },
        { urgent: true },
      );
    }
    await batch.done;
  }

  private async writeEvents(events: readonly LydieEvent[], ids: string[]): Promise<void> {
    const attachments = events.some((e) => e.type.startsWith("attachment."));
    // Schema first: whether a document is a database, and how its rows' values are written.
    for (const e of events) {
      if (e.type !== "database.changed") continue;
      await this.loadSchema(e.data.id);
      this.baseDirty.set(e.data.id, this.baseDirty.get(e.data.id));
    }
    const touchedFolders = new Set<string>();
    try {
      // Places one at a time (names, moves and the trash depend on each other), then contents.
      const rows = await this.readRows(ids);
      const rescans = this.rescans;
      const placed: Placed[] = [];
      for (const id of ids) {
        try {
          // A rescan meanwhile may have applied changes from disk: read again.
          const doc = this.rescans === rescans ? (rows.get(id)?.document ?? null) : undefined;
          const p = await this.placeDoc(id, touchedFolders, new Set(), false, doc);
          if (p) placed.push(p);
        } catch (error) {
          this.fail(error);
        }
      }
      await this.writeContents(placed, propertiesOnly(events));
      for (const folder of touchedFolders) await this.syncOrder(folder);
      if (attachments) await this.syncAttachments(events);
      await this.flushBases();
    } finally {
      await this.persistDeferred();
      await this.meta.flush();
    }
  }

  // Documents with their bodies where `withBody` names them (body undefined: not read), in one
  // read rather than a round trip per document.
  private async readRows(
    ids: readonly string[],
    withBody: ReadonlySet<string> = new Set(),
  ): Promise<Map<string, Row>> {
    return this.store.ports.db.read(async (tx) => {
      const docs = tx.docs.getMany
        ? await tx.docs.getMany(ids)
        : (await Promise.all(ids.map((id) => tx.docs.get(id)))).filter((d) => d !== null);
      const out = new Map<string, Row>();
      for (const document of docs) {
        out.set(document.id, {
          document,
          body: withBody.has(document.id) ? await tx.bodies.get(document.id) : undefined,
        });
      }
      return out;
    });
  }

  // Makes the files of one document match the database.
  private async syncDocToDisk(id: string, folders: Set<string>, visiting: Set<string>) {
    const placed = await this.placeDoc(id, folders, visiting);
    if (placed) await this.writeContents([placed], new Set());
  }

  // Makes a document's files be where the database says (created, moved, renamed, trashed or
  // restored); its content is written by `writeContents`. `prefetched`: the document as read
  // for the batch (null: none), else it is read here.
  private async placeDoc(
    id: string,
    folders: Set<string>,
    visiting: Set<string>,
    rescanned = false,
    prefetched?: Document | null,
  ): Promise<Placed | null> {
    if (visiting.has(id)) return null;
    visiting.add(id);
    const doc =
      prefetched !== undefined
        ? prefetched
        : ((await this.store.getDoc(id, { includeBody: false }))?.document ?? null);
    let entry = this.entries.get(id);

    if (!doc) {
      if (entry) await this.purgeEntry(entry);
      return null;
    }
    if (doc.workspaceId !== this.workspaceId) return null;

    // Another program moved or deleted the file and the watcher has not reported it yet: rescan
    // first so the change lands where the file is now. If the file is gone, the database's version
    // is written back as a new file rather than dropped.
    if (entry && !entry.trashed && !rescanned && !(await this.present(entry))) {
      const lostKey = entry.key;
      await this.syncPaths([""]);
      entry = this.entries.get(id);
      if (!entry) {
        const row = await this.store.getDoc(id, { includeBody: true });
        if (row) await this.recover(row, lostKey);
        return null;
      }
      visiting.delete(id);
      return this.placeDoc(id, folders, visiting, true);
    }

    if (doc.deletedAt) {
      if (!entry || entry.trashed) return null;
      // Trash the topmost document deleted together with this one; its folder carries the rest.
      let root = doc;
      for (let p = doc.parentId; p;) {
        const parent = await this.store.getDoc(p, { includeBody: false });
        if (!parent || parent.document.deletedAt !== doc.deletedAt) break;
        root = parent.document;
        p = parent.document.parentId;
      }
      const rootEntry = this.entries.get(root.id);
      if (rootEntry && !rootEntry.trashed) await this.moveToTrash(rootEntry, root, folders);
      return null;
    }

    // The parent's files first (a document created under a new document, a restore).
    let folder = "";
    if (doc.parentId) {
      let parent = this.entries.get(doc.parentId);
      if (!parent || parent.trashed) {
        await this.syncDocToDisk(doc.parentId, folders, visiting);
        parent = this.entries.get(doc.parentId);
      }
      if (!parent || parent.trashed)
        throw new Error(`Parent ${doc.parentId} of ${id} has no files`);
      folder = parent.key;
    }

    if (entry?.trashed) {
      entry = await this.restoreFromTrash(entry, doc, folder, folders);
      if (this.schemas.has(id)) this.baseDirty.set(id, undefined);
    }
    const created = !entry;
    // A database is a folder (rows and its .base file); it has a note only if given a body.
    const isDatabase = this.schemas.has(id);
    if (!entry) {
      const name = await this.freeName(folder, fileNameFor(doc.title), id);
      entry = {
        id,
        key: joinKey(folder, name),
        file: false,
        dir: false,
        hash: "",
        fmId: false,
        mtime: 0,
        size: 0,
        lca: null,
        trashed: false,
      };
      this.setEntry(entry);
    } else {
      const current = baseName(entry.key);
      if (parentKey(entry.key) !== folder || titleOf(current) !== doc.title) {
        const wanted = titleOf(current) === doc.title ? current : fileNameFor(doc.title);
        const target = joinKey(folder, await this.freeName(folder, wanted, id));
        if (target !== entry.key) await this.relocate(entry, target, folders);
      }
    }
    folders.add(parentKey(entry.key));
    // The file name is the title: when the title could not be used as is (characters files cannot
    // hold, a name taken), the title follows the name so a rebuild gives the same title.
    const name = baseName(entry.key);
    if (titleOf(name) !== doc.title) await this.exec("doc.rename", { id, title: titleOf(name) });
    if (created && isDatabase) {
      await mkdir(this.abs(entry.key), { recursive: true });
      entry.dir = true;
      if (!this.baseDirty.has(id)) this.baseDirty.set(id, undefined);
    }
    return { entry, created, isDatabase };
  }

  // Writes the content of placed documents: their rows read in one go after every move (moving
  // rewrites links in other documents), without bodies where only properties changed (the file
  // keeps its body), the files a few at a time, then what the database must learn from them.
  private async writeContents(placed: Placed[], propertiesOnly: ReadonlySet<string>) {
    if (!placed.length) return;
    const withBody = new Set(
      placed.filter((p) => !p.entry.file || !propertiesOnly.has(p.entry.id)).map((p) => p.entry.id),
    );
    const rows = await this.readRows(
      placed.map((p) => p.entry.id),
      withBody,
    );
    const written = await mapLimit(placed, WRITE_CONCURRENCY, async (p) => {
      const row = rows.get(p.entry.id);
      if (!row) return null;
      try {
        return await this.writeContent(p, row);
      } catch (error) {
        this.fail(error);
        return null;
      }
    });
    for (const w of written) {
      if (!w) continue;
      try {
        if (w.conflicts) await this.saveConflict(w.entry, w.source, w.conflicts);
        // Nothing but what the database holds went into the file: it needs no second look.
        await this.landed(w.entry, w.final, w.final === w.source && !w.external ? w.from : null);
        // A document with a file has a body, if only an empty one (as a rebuild would read it).
        if (w.emptyBody) await this.exec("doc.updateBody", { id: w.entry.id, markdown: "" });
        this.noteId(w.entry);
        this.persistLater(w.entry);
      } catch (error) {
        this.fail(error);
      }
    }
  }

  // The file of one placed document from its row. A folder without a note gets one only when it
  // has a body or properties.
  private async writeContent(
    { entry, created, isDatabase }: Placed,
    row: Row,
  ): Promise<Written | null> {
    let body = row.body === undefined ? undefined : (row.body?.markdown ?? null);
    const properties = this.fileProperties(row.document.parentId, row.document.properties);
    const needsFile =
      (created && !isDatabase) ||
      entry.file ||
      (body !== undefined && body !== null && body !== "") ||
      Object.keys(properties).length > 0;
    if (!needsFile) {
      this.noteId(entry);
      this.persistLater(entry);
      return null;
    }
    const current = entry.file ? await readFileState(this.absFile(entry.key)) : null;
    if (current && current.text === null) return null; // not UTF-8: never written
    if (body === undefined && current?.text == null) {
      // The file is gone after all: the new one gets the database's body.
      body = (await this.store.getDoc(entry.id, { includeBody: true }))?.body?.markdown ?? null;
    }
    let source: string;
    if (current?.text != null) {
      const text = current.text;
      const content = readContent(text);
      const eol = dominantEol(text);
      const nextBody = body == null ? content.body : fitBody(content.body, body, eol);
      let prefix = content.prefix;
      const frontmatter = mergeFrontmatter(content.frontmatter, properties);
      if (JSON.stringify(frontmatter) !== JSON.stringify(content.frontmatter ?? {})) {
        try {
          prefix = headFor(content.prefix, frontmatter, eol);
        } catch (error) {
          // Invalid YAML in the file: its frontmatter is left alone.
          this.onError(error);
        }
      }
      source = prefix + nextBody;
    } else {
      // A new file. Documents Lydie creates carry their id (plan §3).
      const writeId = created && !Object.hasOwn(properties, "id");
      const frontmatter: Record<string, unknown> = writeId
        ? { id: entry.id, ...properties }
        : { ...properties };
      if (writeId) entry.fmId = true;
      // The folder format's writer (@lydie/contract), shared with workspace exports.
      const head = Object.keys(frontmatter).length ? frontmatterBlock(frontmatter) : "";
      source = head + (body ?? "");
    }
    const { final, conflicts, external } = await this.writeFile(entry, source, current);
    const from = { body, parentId: row.document.parentId, properties: row.document.properties };
    return { entry, source, final, conflicts, external, from, emptyBody: body === null && created };
  }

  private async present(entry: Entry): Promise<boolean> {
    if (entry.file) return exists(this.absFile(entry.key));
    return isDirectory(this.abs(entry.key));
  }

  // Writes the database's version of a document whose file another program deleted while an
  // operation changed it, and indexes it as a new document.
  private async recover(
    row: { document: Document; body: { markdown: string } | null },
    key: string,
  ) {
    if (row.document.deletedAt || row.body === null) return;
    const folder = this.entryAt(parentKey(key)) || parentKey(key) === "" ? parentKey(key) : "";
    const name = await this.freeName(folder, baseName(key), "");
    const target = joinKey(folder, name);
    const head = Object.keys(row.document.properties).length
      ? headFor("", row.document.properties, "\n")
      : "";
    await atomicWrite(this.absFile(target), head + row.body.markdown, this.options.hooks);
    await this.syncPaths([target]);
  }

  // A file name in `folder` for document `selfId`, free both in the index and on disk.
  private async freeName(folder: string, wanted: string, selfId: string): Promise<string> {
    const self = this.entries.get(selfId);
    const taken = this.childrenOf(folder)
      .filter((e) => e.id !== selfId)
      .map((e) => baseName(e.key));
    for (;;) {
      const name = uniqueName(wanted, taken);
      const key = joinKey(folder, name);
      const isSelf = self !== undefined && self.key.toLowerCase() === key.toLowerCase();
      if (isSelf || !((await exists(this.absFile(key))) || (await exists(this.abs(key))))) {
        return name;
      }
      taken.push(name);
    }
  }

  // Writes a document's file and brings the database to what landed (see writeFile).
  private async writeDocument(entry: Entry, source: string, state: FileRead | null) {
    const { final, conflicts } = await this.writeFile(entry, source, state);
    if (conflicts) await this.saveConflict(entry, source, conflicts);
    await this.landed(entry, final, null);
  }

  // Writes a document's file (`state`: what is on disk now), unless another program changed it
  // since the bridge last saw it: then the change is merged three ways (base: the last agreed
  // text). A true conflict keeps the disk version in the file; the caller saves this version next
  // to it as `<name>.conflict-<time>.md` (`conflicts`). `external`: the file had changed.
  private async writeFile(entry: Entry, source: string, state: FileRead | null) {
    const path = this.absFile(entry.key);
    let final = source;
    let conflicts: TextConflict[] | null = null;
    const current = state?.text ?? null;
    if (state && current !== null && state.hash !== entry.hash && current !== source) {
      const merged = merge3(entry.lca ?? "", source, current);
      if (merged.clean) {
        final = merged.text;
      } else {
        final = current;
        conflicts = merged.conflicts;
      }
    }
    const external = state !== null && state.hash !== entry.hash;
    if (current !== final) {
      // The bytes written are the text's UTF-8, so its hash is theirs: no reading back.
      const { mtime, size } = await atomicWrite(path, final, this.options.hooks);
      entry.hash = sha256(final);
      entry.mtime = mtime;
      entry.size = size;
    } else if (state) {
      entry.hash = state.hash;
      entry.mtime = state.mtime;
      entry.size = state.size;
    }
    entry.file = true;
    entry.lca = final;
    entry.seen = undefined;
    return { final, conflicts, external };
  }

  // The database follows what landed on disk (a merge, or line endings fitted to the file).
  // `from`: the database state the file was written from, when nothing else went into it; then
  // the database is read only if the file holds something else.
  private async landed(entry: Entry, final: string, from: Written["from"] | null) {
    const landed = readContent(final);
    const same =
      from !== null &&
      (from.body === undefined || from.body === landed.body) &&
      JSON.stringify(from.properties) === JSON.stringify(this.dbProperties(from.parentId, landed));
    if (!same) {
      const row = await this.store.getDoc(entry.id, { includeBody: true });
      if (
        row &&
        (row.body?.markdown !== landed.body ||
          JSON.stringify(row.document.properties) !==
            JSON.stringify(this.dbProperties(row.document.parentId, landed)))
      ) {
        await this.applyContent(entry.id, row.document, row.body?.markdown ?? null, landed);
      }
    }
    await this.notifySession(entry.id, final);
  }

  // Entries whose file_index rows are written at the end of the batch, in one transaction.
  private persistLater(entry: Entry): void {
    this.unpersisted.add(entry);
  }

  private async persistDeferred(): Promise<void> {
    const entries = [...this.unpersisted].filter((e) => this.entries.get(e.id) === e);
    this.unpersisted.clear();
    if (entries.length) await this.persist(entries);
  }

  private async saveConflict(
    entry: Entry,
    ours: string,
    conflicts: TextConflict[],
  ): Promise<string> {
    const at = new Date().toISOString();
    const stamp = at.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const folder = parentKey(entry.key);
    const name = uniqueName(
      `${baseName(entry.key)}.conflict-${stamp}`,
      this.childrenOf(folder).map((e) => baseName(e.key)),
    );
    const key = joinKey(folder, name);
    await atomicWrite(this.absFile(key), ours, this.options.hooks);
    // Index the copy now (the watcher would see it as a new file anyway).
    const state = await readFileState(this.absFile(key));
    let conflictId: string | null = null;
    if (state?.text != null) {
      const content = readContent(state.text);
      conflictId = assignId(this.workspaceId, key, content.id, this.meta.files.ids, (x) =>
        this.entries.has(x),
      );
      const copy: Entry = {
        id: conflictId,
        key,
        file: true,
        dir: false,
        hash: state.hash,
        fmId: content.id === conflictId,
        mtime: state.mtime,
        size: state.size,
        lca: state.text,
        trashed: false,
      };
      this.setEntry(copy);
      const parentId = this.entryAt(folder)?.id ?? null;
      await this.exec("doc.create", {
        workspaceId: this.workspaceId,
        id: conflictId,
        parentId,
        title: titleOf(name),
        properties: this.dbProperties(parentId, content),
        markdown: content.body,
        afterId: entry.id,
      });
      this.noteId(copy);
      await this.persist([copy]);
    }
    const conflict: FileConflict = {
      id: entry.id,
      path: filePath(entry.key),
      conflictPath: filePath(key),
      conflictId,
      conflicts,
      at,
    };
    await this.store.conflicts.set({
      id: entry.id,
      workspaceId: this.workspaceId,
      kind: "file",
      details: conflict,
      detectedAt: at,
    });
    this.sessions.get(entry.id)?.handle.onConflict?.(conflict);
    for (const listener of this.conflictListeners) listener(conflict);
    return key;
  }

  // Moves a document's file and folder to `target` and rewrites links that pointed at the old paths.
  private async relocate(entry: Entry, target: string, folders: Set<string>): Promise<void> {
    const from = entry.key;
    const oldFolder = parentKey(from);
    if (entry.file) await move(this.absFile(from), this.absFile(target));
    if (entry.dir) await move(this.abs(from), this.abs(target));
    const moved = this.rekey(from, target);
    const oldKeys = new Map(moved.map((e) => [e.id, rebase(e.key, target, from)]));
    for (const e of moved) this.noteId(e, oldKeys.get(e.id));
    await this.persist(moved);
    folders.add(oldFolder);
    await this.cleanupFolder(oldFolder);
    await this.rewriteLinksTo(
      moved.map((e) => e.id),
      oldKeys,
    );
    // Moved databases: their .base file takes the folder's new name and membership filter.
    for (const e of moved) {
      if (this.schemas.has(e.id)) this.baseDirty.set(e.id, baseFileFor(oldKeys.get(e.id)!));
    }
    // Relation and file values in rows are paths in the files: rewrite the rows that point here.
    for (const rowId of await this.rowsReferencing(new Set(moved.map((e) => e.id)))) {
      if (!moved.some((e) => e.id === rowId)) await this.syncDocToDisk(rowId, folders, new Set());
    }
  }

  // A note's folder that lost its last child goes away (a folder without a note is a document and
  // stays).
  private async cleanupFolder(folder: string): Promise<void> {
    const owner = this.entryAt(folder);
    if (!owner || !owner.dir || !owner.file) return;
    if (this.childrenOf(folder).length > 0) return;
    if (await removeIfEmpty(this.abs(folder))) {
      owner.dir = false;
      await this.persist([owner]);
    }
  }

  private async moveToTrash(entry: Entry, doc: Document, folders: Set<string>): Promise<void> {
    const from = entry.key;
    const trashFolder = parentKey(from) === "" ? TRASH_DIR : joinKey(TRASH_DIR, parentKey(from));
    let name = baseName(from);
    for (let i = 1; ; i++) {
      const key = joinKey(trashFolder, name);
      if (!(await exists(this.absFile(key))) && !(await exists(this.abs(key)))) break;
      name = `${baseName(from)} ${i}`;
    }
    const target = joinKey(trashFolder, name);
    if (entry.file) await move(this.absFile(from), this.absFile(target));
    if (entry.dir) await move(this.abs(from), this.abs(target));
    const moved = this.rekey(from, target);
    const deletedAt = doc.deletedAt!;
    for (const e of moved) {
      const oldKey = rebase(e.key, target, from);
      if (this.meta.files.ids[oldKey] === e.id) delete this.meta.files.ids[oldKey];
      const record = this.meta.files.trash[e.id];
      const d =
        e.id === doc.id ? doc : (await this.store.getDoc(e.id, { includeBody: false }))?.document;
      this.meta.files.trash[e.id] = {
        ...record,
        key: e.key,
        title: d?.title ?? titleOf(baseName(oldKey)),
        deletedAt: d?.deletedAt ?? deletedAt,
        ...(e.id === doc.id ? { parentId: doc.parentId, sortKey: doc.sortKey } : {}),
      };
      this.sessions.get(e.id)?.handle.onClosed?.("deleted");
      this.sessions.delete(e.id);
    }
    await this.persist(moved);
    folders.add(parentKey(from));
    await this.cleanupFolder(parentKey(from));
  }

  private async restoreFromTrash(
    entry: Entry,
    doc: Document,
    folder: string,
    folders: Set<string>,
  ): Promise<Entry> {
    const from = entry.key;
    const siblings = this.childrenOf(folder).map((e) => baseName(e.key));
    const name = uniqueName(fileNameFor(doc.title), siblings);
    const target = joinKey(folder, name);
    if (entry.file) await move(this.absFile(from), this.absFile(target));
    if (entry.dir) await move(this.abs(from), this.abs(target));
    const moved = this.rekey(from, target);
    for (const e of moved) {
      delete this.meta.files.trash[e.id];
      this.noteId(e);
    }
    // Restored together: the subtree's other documents are live again too (and stay in it).
    await this.persist(moved);
    folders.add(folder);
    await this.removeEmptyTrashFolders(parentKey(from));
    return entry;
  }

  private async removeEmptyTrashFolders(key: string): Promise<void> {
    for (let k = key; isTrashKey(k) && k !== TRASH_DIR; k = parentKey(k)) {
      if (!(await removeIfEmpty(this.abs(k)))) break;
    }
  }

  private async purgeEntry(entry: Entry): Promise<void> {
    const affected = this.subtree(entry.key);
    if (entry.trashed) {
      await rm(this.absFile(entry.key), { force: true });
      if (entry.dir) await rm(this.abs(entry.key), { recursive: true, force: true });
      await this.removeEmptyTrashFolders(parentKey(entry.key));
    }
    for (const e of affected) {
      delete this.meta.files.trash[e.id];
      this.dropEntry(e.id);
      this.sessions.get(e.id)?.handle.onClosed?.("deleted");
      this.sessions.delete(e.id);
    }
    await this.forget(affected.map((e) => e.id));
  }

  // Records manual order for a folder when the database's sibling order is not the default one.
  private async syncOrder(folder: string): Promise<void> {
    const owner = folder === "" ? null : this.entryAt(folder);
    if (folder !== "" && (!owner || owner.trashed)) {
      delete this.meta.files.order[folder];
      return;
    }
    const children = await this.store.ports.db.read((tx) =>
      tx.docs.children(this.workspaceId, owner?.id ?? null),
    );
    const names = children
      .map((d) => this.entries.get(d.id))
      .filter((e): e is Entry => !!e && !e.trashed)
      .map((e) => baseName(e.key));
    const sorted = [...names].sort(compareNames);
    if (names.every((n, i) => n === sorted[i])) delete this.meta.files.order[folder];
    else this.meta.files.order[folder] = names;
  }

  // Rewrites links in other files (and relative links inside moved files) after documents moved,
  // touching only the link bytes (@lydie/markdown's rewriteLinks), as Obsidian does on rename.
  private async rewriteLinksTo(movedIds: string[], oldKeys: Map<string, string>): Promise<void> {
    const moved = new Set(movedIds);
    const sources = new Set<string>(movedIds);
    for (const id of movedIds) {
      for (const b of await this.store.backlinks(id)) sources.add(b.source.id);
    }
    for (const sourceId of sources) {
      const entry = this.entries.get(sourceId);
      if (!entry || entry.trashed || !entry.file) continue;
      const links = await this.store.ports.db.read(
        async (tx) => (await tx.links.from?.(sourceId)) ?? [],
      );
      const targets = new Map<string, string>();
      for (const l of links)
        if (l.targetId) targets.set(`${l.syntax ?? ""}\u0000${l.targetRef}`, l.targetId);
      const state = await readFileState(this.absFile(entry.key));
      if (!state?.text) continue;
      const sourceMoved = moved.has(sourceId);
      // Rewritten links (syntax and new text) and the documents they point at.
      const rewritten = new Map<string, string>();
      const next = rewriteLinks(state.text, (link) => {
        const syntax = link.kind === "wikilink" || link.kind === "embed" ? "wikilink" : "markdown";
        const targetId = targets.get(`${syntax}\u0000${link.target.trim()}`);
        if (!targetId) return undefined;
        const targetEntry = this.entries.get(targetId);
        if (!targetEntry || targetEntry.trashed) return undefined;
        const relative = syntax === "markdown" && /^\.\.?\//.test(link.target);
        if (!moved.has(targetId) && !(sourceMoved && relative)) return undefined;
        const ref = newLinkTarget(
          link.target,
          syntax,
          entry.key,
          targetEntry.key,
          oldKeys.get(targetId),
        );
        if (ref !== undefined) rewritten.set(`${syntax}\u0000${ref.trim()}`, targetId);
        return ref;
      });
      if (next === state.text) continue;
      // Also brings the database to the rewritten text.
      await this.writeDocument(entry, next, state);
      await this.keepTargets(sourceId, rewritten);
      this.persistLater(entry);
    }
  }

  // Rewritten links name where their targets' files are now. While a later rename of a target is
  // still to be written (a burst of renames: typing a title), its title already says otherwise and
  // they resolved to nothing; then the next move would not find them. They keep pointing at what
  // they pointed at before, as links whose text did not change do (the runtime keeps those).
  private async keepTargets(sourceId: string, rewritten: ReadonlyMap<string, string>) {
    if (!rewritten.size) return;
    const target = (l: LinkRow) =>
      l.targetId === null && !l.sourceProperty
        ? rewritten.get(`${l.syntax ?? ""}\u0000${l.targetRef}`)
        : undefined;
    const links = await this.store.ports.db.read(
      async (tx) => (await tx.links.from?.(sourceId)) ?? [],
    );
    if (!links.some(target)) return;
    await this.store.ports.db.write(async (tx) => {
      const rows = (await tx.links.from?.(sourceId)) ?? [];
      await tx.links.replaceFrom(
        sourceId,
        rows.map((l) => ({ ...l, targetId: target(l) ?? l.targetId })),
      );
    });
  }

  // ---- Attachments

  private async syncAttachments(events: readonly LydieEvent[]): Promise<void> {
    const records = this.meta.files.attachments;
    for (const e of events) {
      if (!e.type.startsWith("attachment.")) continue;
      const id =
        e.type === "attachment.created"
          ? (e.data as { attachment: Attachment }).attachment.id
          : (e.data as { id: string }).id;
      const row = await this.store.ports.db.read(
        async (tx) => (await tx.attachments?.get(id)) ?? null,
      );
      if (!row) {
        const gone = records[id];
        delete records[id];
        // Blob.delete runs after this (after commit) and needs to know where the bytes were.
        if (gone && !Object.values(records).some((r) => r.sha256 === gone.sha256)) {
          this.purgedBytes.set(gone.sha256, gone.path);
        }
        continue;
      }
      const existing = records[id];
      let path = existing?.path;
      if (!path) path = await this.placeAttachment(row);
      records[id] = recordOf(row, path);
    }
  }

  // Bytes of a new attachment go from the staging area to the attachments folder under its file
  // name; bytes already in the vault (same SHA-256) are reused, not copied.
  private async placeAttachment(row: Attachment): Promise<string> {
    const known = this.attachmentPath(row.sha256);
    if (known && (await exists(join(this.root, known)))) return known;
    const folder = this.attachmentsFolder || "attachments";
    const dot = row.filename.lastIndexOf(".");
    const stem = fileNameFor(dot > 0 ? row.filename.slice(0, dot) : row.filename);
    const ext = dot > 0 ? row.filename.slice(dot).replace(/[^.\w-]/g, "") : "";
    let name = `${stem}${ext}`;
    for (let i = 1; await exists(join(this.root, folder, name)); i++) name = `${stem} ${i}${ext}`;
    const path = `${folder}/${name}`;
    const staged = this.stagingPath(row.sha256);
    if (await exists(staged)) await move(staged, join(this.root, path));
    return path;
  }

  private stagingPath(sha256: string): string {
    return join(this.root, META_DIR, "staging", sha256);
  }

  private attachmentPath(sha256: string): string | null {
    for (const r of Object.values(this.meta.files.attachments))
      if (r.sha256 === sha256) return r.path;
    return null;
  }

  // The runtime's Blob port on the vault: bytes are files in the attachments folder (or staged
  // under `.lydie/staging/` until `attachment.create` names them).
  readonly blob = {
    put: async (key: string, data: Uint8Array): Promise<void> => {
      await this.queue.run(async () => {
        if (await this.blob.has(key)) return;
        await atomicWrite(this.stagingPath(key), data, this.options.hooks);
      });
    },
    get: async (key: string): Promise<Uint8Array | null> => {
      const path = this.attachmentPath(key);
      for (const candidate of [path ? join(this.root, path) : null, this.stagingPath(key)]) {
        if (!candidate) continue;
        const state = await readFileState(candidate);
        if (state) return state.bytes;
      }
      return null;
    },
    delete: async (key: string): Promise<void> => {
      await this.queue.run(async () => {
        const used = Object.values(this.meta.files.attachments).some((r) => r.sha256 === key);
        const path = this.purgedBytes.get(key);
        this.purgedBytes.delete(key);
        if (path && !used) await rm(join(this.root, path), { force: true });
        await rm(this.stagingPath(key), { force: true });
      });
    },
    has: async (key: string): Promise<boolean> => {
      const path = this.attachmentPath(key);
      return (
        (path !== null && (await exists(join(this.root, path)))) || exists(this.stagingPath(key))
      );
    },
  };

  // ---- Open documents (S2)

  // Registers the holder of an open document. External changes to its file are merged with the
  // holder's state and delivered as steps; conflicts keep both versions (see writeDocument).
  async openDocument(id: string, handle: DocumentHandle): Promise<OpenDocument> {
    return this.queue.run(async () => {
      const entry = this.entries.get(id);
      if (!entry || entry.trashed) throw new Error(`Document ${id} has no file in this vault`);
      let source = "";
      if (entry.file) {
        const state = await readFileState(this.absFile(entry.key));
        source = state?.text ?? entry.lca ?? "";
      }
      const session: Session = { id, handle, base: source, parsed: null };
      this.sessions.set(id, session);
      const open: OpenDocument = {
        get source() {
          return session.base;
        },
        save: (doc) => this.saveDocument(session, doc),
        close: () => {
          if (this.sessions.get(id) === session) this.sessions.delete(id);
        },
      };
      return open;
    });
  }

  private async saveDocument(
    session: Session,
    doc: DocInput,
  ): Promise<{ changed: boolean; verified: boolean }> {
    const result = save({ original: session.parsed ?? session.base, doc });
    // The verification's parse of what was saved: the next save starts from it.
    session.parsed = result.parse;
    if (result.source === session.base) return { changed: false, verified: result.verified };
    session.base = result.source;
    const body = readContent(result.source).body;
    await this.runtime.execute(
      "doc.updateBody",
      { id: session.id, markdown: body },
      { actor: this.options.actor, history: false },
    );
    return { changed: true, verified: result.verified };
  }

  // The file of an open document now holds `final`: bring the editor there, keeping its unsaved
  // edits when they merge, or saving them next to the file when they conflict.
  private async notifySession(id: string, final: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session || session.base === final) return;
    let doc: DocInput;
    try {
      doc = await session.handle.getDoc();
    } catch (error) {
      this.onError(error);
      return;
    }
    const result = reconcile({ base: session.parsed ?? session.base, disk: final, doc });
    if (result.status === "clean") {
      // The editor now holds the merge: the disk text plus its own unsaved edits, which its next
      // save writes. The base stays what is on disk.
      session.base = final;
      session.parsed = result.source === final ? result.parse : null;
      await session.handle.applySteps(result.steps, { source: result.source });
      return;
    }
    const entry = this.entries.get(id);
    if (entry) await this.saveConflict(entry, result.ours, result.conflicts);
    const reload = reconcile({ base: result.ours, disk: final, doc });
    session.base = final;
    session.parsed = null;
    if (reload.status === "clean") {
      await session.handle.applySteps(reload.steps, { source: final });
    }
  }
}

// ---- Helpers

function exclusions(attachmentsFolder: string, exclude: readonly string[]) {
  const attachments = attachmentsFolder.replace(/^\/+|\/+$/g, "");
  const patterns = globMatcher(exclude);
  return (key: string) => patterns(key) || (attachments !== "" && isUnder(key, attachments));
}

// Documents an operation's events touched, in order.
function idsOf(events: readonly LydieEvent[]): string[] {
  const ids: string[] = [];
  for (const e of events) {
    switch (e.type) {
      case "doc.created":
        ids.push(e.data.document.id);
        break;
      case "doc.deleted":
        ids.push(...e.data.deletedIds);
        break;
      case "doc.restored":
        ids.push(...e.data.restoredIds);
        break;
      case "doc.purged":
        ids.push(...e.data.purgedIds);
        break;
      case "doc.renamed":
      case "doc.moved":
      case "doc.propertiesChanged":
      case "doc.bodyUpdated":
        ids.push(e.data.id);
        break;
      default:
        break;
    }
  }
  return [...new Set(ids)];
}

// Documents whose only change is to their properties: their files keep the body they have.
function propertiesOnly(events: readonly LydieEvent[]): Set<string> {
  const only = new Set<string>();
  const other = new Set<string>();
  for (const e of events) {
    if (e.type === "doc.propertiesChanged") only.add(e.data.id);
    else for (const id of idsOf([e])) other.add(id);
  }
  for (const id of other) only.delete(id);
  return only;
}

// The frontmatter block (with BOM) that makes `prefix` hold `frontmatter`. @lydie/markdown's save
// rewrites only the keys that changed, keeping comments, quoting and order; the body is not part of
// the source it edits, so it is never re-serialised.
function headFor(prefix: string, frontmatter: Record<string, unknown>, eol: string): string {
  const head = save({ original: prefix, doc: parse(prefix).doc, properties: frontmatter }).source;
  const hadFrontmatter = prefix.replace(/^\uFEFF/, "") !== "";
  return !hadFrontmatter && eol === "\r\n" ? head.replace(/\r?\n/g, "\r\n") : head;
}

function newLinkTarget(
  oldRef: string,
  syntax: "wikilink" | "markdown",
  sourceKey: string,
  targetKey: string,
  oldTargetKey: string | undefined,
): string | undefined {
  const ref = oldRef.trim();
  // `![[Tasks.base]]` embeds a database: its file is `<Folder>/<Folder>.base`, named after it.
  if (/\.base$/i.test(ref)) {
    if (oldTargetKey !== undefined && baseName(oldTargetKey) === baseName(targetKey))
      return undefined;
    const file = `${baseName(targetKey)}${BASE_EXT}`;
    return ref.includes("/") ? `${targetKey}/${file}` : file;
  }
  const md = /\.md$/i.test(oldRef) ? MD : "";
  if (syntax === "markdown" && /^\.\.?\//.test(ref)) {
    let rel = posix.relative(parentKey(sourceKey), targetKey);
    if (!rel.startsWith(".") && ref.startsWith("./")) rel = `./${rel}`;
    return rel + md;
  }
  if (!ref.replace(/\.md$/i, "").includes("/")) {
    if (oldTargetKey !== undefined && baseName(oldTargetKey) === baseName(targetKey))
      return undefined;
    return baseName(targetKey) + md;
  }
  return targetKey + md;
}

function memoryDocs(docs: Map<string, Document>): DbRead {
  const byKey = new Map<string, Document[]>();
  for (const d of docs.values()) {
    if (d.deletedAt) continue;
    const key = linkKey(d.title);
    const list = byKey.get(key) ?? [];
    list.push(d);
    byKey.set(key, list);
  }
  for (const list of byKey.values()) {
    list.sort((a, b) =>
      a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : a.id < b.id ? -1 : 1,
    );
  }
  const unsupported = () => {
    throw new Error("not available during indexing");
  };
  return {
    docs: {
      get: async (id) => docs.get(id) ?? null,
      children: unsupported,
      descendants: unsupported,
      tree: unsupported,
      ancestors: async (id) => {
        const out: Document[] = [];
        for (let p = docs.get(id)?.parentId; p; p = docs.get(p)?.parentId) {
          const parent = docs.get(p);
          if (!parent) break;
          out.push(parent);
        }
        return out;
      },
      findByLinkKey: async (_ws, key) => byKey.get(key)?.[0] ?? null,
      findAllByLinkKey: async (_ws, key) => byKey.get(key) ?? [],
    },
    bodies: { get: unsupported },
    links: { backlinks: unsupported },
  };
}

function attachmentOf(id: string, r: AttachmentRecord): Attachment {
  return {
    id,
    workspaceId: r.workspaceId,
    documentId: r.documentId,
    filename: r.filename,
    contentType: r.contentType,
    size: r.size,
    sha256: r.sha256,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
    createdBy: r.createdBy,
    updatedBy: r.updatedBy,
  };
}

function recordOf(a: Attachment, path: string): AttachmentRecord {
  return {
    path,
    workspaceId: a.workspaceId,
    documentId: a.documentId,
    filename: a.filename,
    contentType: a.contentType,
    size: a.size,
    sha256: a.sha256,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    deletedAt: a.deletedAt,
    createdBy: a.createdBy ?? null,
    updatedBy: a.updatedBy ?? null,
  };
}
