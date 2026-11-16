import type {
  Activity,
  ActivityType,
  ActorRef,
  AppliedOperation,
  Attachment,
  Backlink,
  Block,
  ChildEntry,
  Database,
  DatabaseProperty,
  DatabaseView,
  Document,
  DocumentBody,
  DocumentVersion,
  HistoryEntry,
  HistorySession,
  Link,
  LydieEvent,
  OutgoingLink,
  SchemaRewrite,
  SearchHit,
  ThreadRow,
  TreeEntry,
  UnlinkedMention,
  UnresolvedLink,
  ViewConfig,
  ViewResult,
  ViewWindow,
} from "@lydie/contract";

// Ports are domain-level on purpose: the runtime never sees SQL. `@lydie/store` implements them over
// SQLite, `./memory` over plain objects, and the core implements them over Postgres.
//
// Members marked optional are capabilities added after the first version. A backend that lacks one
// keeps compiling; the runtime falls back to slower generic code where it can, and otherwise the
// operation that needs it fails with `internal` ("not supported by this backend").

export type DocPatch = Partial<
  Pick<
    Document,
    "parentId" | "title" | "sortKey" | "properties" | "updatedAt" | "deletedAt" | "updatedBy"
  >
>;

// A link row plus its normalised target key (see `linkKey`), used to resolve dangling links later.
// The block/heading fields are optional for backends written before they existed.
export type LinkRow = Omit<Link, "sourceBlockId" | "targetHeading" | "targetBlockId" | "syntax"> &
  Partial<Pick<Link, "sourceBlockId" | "targetHeading" | "targetBlockId" | "syntax">> & {
    targetKey: string;
  };

// Where to insert among siblings: the neighbouring keys of the slot.
export type SlotAnchor = { afterId: string } | { beforeId: string } | { end: true };
export type SlotKeys = { lower: string | null; upper: string | null };

export type DocsRead = {
  get(id: string): Promise<Document | null>;
  // Children of `parentId` (null = top level) ordered by (sortKey, id).
  children(
    workspaceId: string,
    parentId: string | null,
    options?: { includeDeleted?: boolean },
  ): Promise<Document[]>;
  // Like `children`, with each child's number of live children.
  childEntries?(
    workspaceId: string,
    parentId: string | null,
    options?: { includeDeleted?: boolean },
  ): Promise<ChildEntry[]>;
  // Every descendant at any depth, deleted ones included. Order is unspecified.
  descendants(id: string): Promise<Document[]>;
  // Parent first, then its parent, up to the top level. Deleted ones included.
  ancestors?(id: string): Promise<Document[]>;
  // Depth-first tree order. With `rootId`, only that document's descendants (depth 0 = its children).
  tree(
    workspaceId: string,
    options: { rootId?: string; includeDeleted: boolean },
  ): Promise<TreeEntry[]>;
  // A live document whose title matches a link key case-insensitively.
  findByLinkKey(workspaceId: string, key: string): Promise<Document | null>;
  // Every live document whose title matches a link key, ordered by (sortKey, id).
  findAllByLinkKey?(workspaceId: string, key: string): Promise<Document[]>;
  // findAllByLinkKey for several keys in one round trip: each key's matches (keys with none may be
  // left out), each list ordered by (sortKey, id).
  findAllByLinkKeys?(
    workspaceId: string,
    keys: readonly string[],
  ): Promise<Map<string, Document[]>>;
  // The keys around a slot among the live children of `parentId`, ignoring `excludeId`.
  // null when the anchor is not such a sibling.
  slotKeys?(
    workspaceId: string,
    parentId: string | null,
    anchor: SlotAnchor,
    excludeId?: string,
  ): Promise<SlotKeys | null>;
  // Deleted documents whose parent was not deleted together with them (the trash's top level),
  // newest deletion first. `limit`: only the first that many are needed (a backend may return all).
  trashed?(
    workspaceId: string,
    options?: { limit?: number },
  ): Promise<(Document & { descendantCount: number })[]>;
  // Several documents by id (missing ones left out). Order is unspecified.
  getMany?(ids: readonly string[]): Promise<Document[]>;
};

export type DocsWrite = {
  insert(doc: Document): Promise<void>;
  update(id: string, patch: DocPatch): Promise<void>;
  // Hard delete of documents with their bodies, blocks and outgoing links. Links pointing at them
  // become unresolved.
  purge?(ids: readonly string[]): Promise<void>;
  // Several updates in one round trip (bulk property changes).
  updateMany?(updates: readonly { id: string; patch: DocPatch }[]): Promise<void>;
  // Several new documents in one round trip (indexing a folder).
  insertMany?(docs: readonly Document[]): Promise<void>;
};

export type BodiesRead = {
  get(id: string): Promise<DocumentBody | null>;
};

// `fresh`: the document was created in this transaction, so it has no rows of this kind yet and
// there is nothing to replace. A backend may ignore it.
export type FreshOptions = { fresh?: boolean };

export type BodiesWrite = {
  put(
    id: string,
    workspaceId: string,
    body: DocumentBody,
    updatedAt: string,
    options?: FreshOptions,
  ): Promise<void>;
  // Several bodies in a constant number of round trips (indexing a folder).
  putMany?(
    bodies: readonly { id: string; workspaceId: string; body: DocumentBody; updatedAt: string }[],
  ): Promise<void>;
};

export type LinksRead = {
  // Links from live documents to `targetId`.
  backlinks(targetId: string): Promise<Backlink[]>;
  // Links from live documents to one block of `targetId`.
  blockBacklinks?(targetId: string, blockId: string): Promise<Backlink[]>;
  // Outgoing links of a document.
  from?(sourceId: string): Promise<LinkRow[]>;
  // The same with each target resolved to a live document, in one read (doc.outgoingLinks).
  outgoing?(sourceId: string): Promise<OutgoingLink[]>;
  // Links from live documents that resolve to nothing or to a trashed document.
  unresolved?(workspaceId: string): Promise<UnresolvedLink[]>;
};

export type LinksWrite = {
  replaceFrom(sourceId: string, links: readonly LinkRow[], options?: FreshOptions): Promise<void>;
  // replaceFrom for several sources at once (indexing a folder).
  replaceFromMany?(
    entries: readonly { sourceId: string; links: readonly LinkRow[] }[],
  ): Promise<void>;
  // Points unresolved links whose key matches at `targetId` (after a create or rename).
  resolveDangling(workspaceId: string, key: string, targetId: string): Promise<void>;
  // resolveDangling for several targets in one statement; with the same key, the first wins (as
  // calling resolveDangling in order would).
  resolveDanglingMany?(
    workspaceId: string,
    targets: readonly { key: string; targetId: string }[],
  ): Promise<void>;
};

export type BlockRow = Block & { workspaceId: string };

export type BlocksRead = {
  list(docId: string): Promise<Block[]>;
};

export type BlocksWrite = {
  replaceFor(
    docId: string,
    workspaceId: string,
    blocks: readonly Block[],
    options?: FreshOptions,
  ): Promise<void>;
  // replaceFor for several documents at once (indexing a folder).
  replaceForMany?(
    entries: readonly { docId: string; workspaceId: string; blocks: readonly Block[] }[],
  ): Promise<void>;
};

export type AttachmentPatch = Partial<Pick<Attachment, "deletedAt" | "updatedAt" | "updatedBy">>;

export type AttachmentsRead = {
  get(id: string): Promise<Attachment | null>;
  // Newest first.
  list(
    workspaceId: string,
    options?: { documentId?: string; includeDeleted?: boolean },
  ): Promise<Attachment[]>;
  // Rows (trashed ones included) that use these bytes.
  countBySha256(sha256: string): Promise<number>;
};

export type AttachmentsWrite = {
  insert(attachment: Attachment): Promise<void>;
  update(id: string, patch: AttachmentPatch): Promise<void>;
  purge(id: string): Promise<void>;
};

export type { ThreadRow };

export type ThreadPatch = Partial<
  Pick<
    ThreadRow,
    "body" | "anchor" | "resolvedAt" | "resolvedBy" | "updatedAt" | "updatedBy" | "deletedAt"
  >
>;

export type ThreadsRead = {
  get(id: string): Promise<ThreadRow | null>;
  // A document's threads and replies, oldest first. Deleted rows only when asked for.
  list(documentId: string, options?: { includeDeleted?: boolean }): Promise<ThreadRow[]>;
};

export type ThreadsWrite = {
  insert(row: ThreadRow): Promise<void>;
  update(id: string, patch: ThreadPatch): Promise<void>;
  // Hard delete of every thread of these documents (they are being purged).
  purgeFor(documentIds: readonly string[]): Promise<void>;
};

// What one history entry changed: `<entity id>|<aspect>`, e.g. `01J…|title`, `01J…|*`.
export type HistoryRow = HistoryEntry & { touches: string[]; scope: string | null };

export type HistoryRead = {
  // Oldest first.
  list(options: {
    sessionId?: string;
    afterId?: string;
    includeUndone?: boolean;
    limit?: number;
  }): Promise<HistoryRow[]>;
  // Most recent first.
  sessions(options: { workspaceId?: string; limit: number }): Promise<HistorySession[]>;
};

export type HistoryWrite = {
  append(entry: HistoryRow): Promise<void>;
  markUndone(ids: readonly string[], at: string): Promise<void>;
};

// The activity log (`activity.ts`): coalesced, user-facing rows written from the events of each
// operation, in its transaction. The runtime decides what to insert or update; ports only store.
export type ActivityKey = {
  workspaceId: string;
  actor: ActorRef;
  sessionId: string | null;
  type: ActivityType;
  // Null for a change to the workspace itself (a hosted workspace's members, tokens…).
  targetId: string | null;
};

export type ActivityPatch = Pick<Activity, "count" | "lastAt" | "targetTitle" | "data">;

export type ActivityQuery = {
  workspaceId: string;
  limit: number;
  // Rows strictly before this one in (lastAt, id) descending order: the previous page's last row.
  after?: { lastAt: string; id: string };
  actors?: readonly ActorRef[];
  types?: readonly ActivityType[];
  targetId?: string;
  sessionId?: string;
  // Case-insensitive (ASCII) substring of targetTitle.
  search?: string;
};

export type ActivityRead = {
  // Newest first by (lastAt, id).
  list(query: ActivityQuery): Promise<Activity[]>;
};

export type ActivityWrite = {
  // The newest row (by lastAt, then id) with exactly this key, or null.
  latest(key: ActivityKey): Promise<Activity | null>;
  insert(row: Activity): Promise<void>;
  update(id: string, patch: ActivityPatch): Promise<void>;
  // The same for several keys or rows in one round trip (an operation's events are written
  // together when its transaction ends). `latestMany` returns the newest row of each key that has
  // one, in any order.
  latestMany?(keys: readonly ActivityKey[]): Promise<Activity[]>;
  insertMany?(rows: readonly Activity[]): Promise<void>;
  updateMany?(updates: readonly { id: string; patch: ActivityPatch }[]): Promise<void>;
};

// The upload queue: applied operations waiting for the sync peer.
export type OperationLog = {
  append(entry: AppliedOperation): Promise<void>;
};

export type DatabasePatch = Partial<
  Pick<Database, "config" | "updatedAt" | "updatedBy" | "deletedAt">
>;
export type PropertyPatch = Partial<
  Pick<
    DatabaseProperty,
    "name" | "type" | "key" | "config" | "sortKey" | "updatedAt" | "updatedBy" | "deletedAt"
  >
>;
export type ViewPatch = Partial<
  Pick<
    DatabaseView,
    "name" | "type" | "config" | "sortKey" | "updatedAt" | "updatedBy" | "deletedAt"
  >
>;

// What `database.query` asks a backend that can run views natively (SQL). Everything the query
// needs is resolved up front: the live schema, rollup targets, the user and the clock.
export type ViewQuery = {
  workspaceId: string;
  databaseId: string;
  properties: readonly DatabaseProperty[];
  // Rollup target properties of other databases, by id.
  targets: readonly DatabaseProperty[];
  databaseFilter: Database["config"]["filter"];
  // Row templates (the database's `templateIds`): never part of a view. Absent: none.
  templateIds?: readonly string[];
  config: ViewConfig;
  window: ViewWindow;
  me: string | null;
  now: string;
  today: string;
};

export type DatabasesRead = {
  get(id: string): Promise<Database | null>;
  // Database rows of a workspace (deleted ones only with includeDeleted).
  list(workspaceId: string, options?: { includeDeleted?: boolean }): Promise<Database[]>;
  // Ordered by (sortKey, id).
  properties(
    databaseId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<DatabaseProperty[]>;
  property(id: string): Promise<DatabaseProperty | null>;
  views(databaseId: string, options?: { includeDeleted?: boolean }): Promise<DatabaseView[]>;
  view(id: string): Promise<DatabaseView | null>;
  // Runs a view natively. Without it, the runtime evaluates views in JavaScript over the rows.
  query?(query: ViewQuery): Promise<ViewResult>;
};

export type DatabasesWrite = {
  // Runs `fn`, a schema rewrite of one database's rows (`SchemaRewrite`), so that its reads and
  // writes cover every row of that database, including rows hidden from the caller: the change
  // follows the schema, not the caller's edit. Its undo runs through here too. Backends where the
  // caller sees every row leave it out (the runtime then just runs `fn`).
  rewrite?<T>(rewrite: SchemaRewrite, fn: () => Promise<T>): Promise<T>;
  insert(database: Database): Promise<void>;
  update(id: string, patch: DatabasePatch): Promise<void>;
  insertProperty(property: DatabaseProperty): Promise<void>;
  updateProperty(id: string, patch: PropertyPatch): Promise<void>;
  insertView(view: DatabaseView): Promise<void>;
  updateView(id: string, patch: ViewPatch): Promise<void>;
  // The next number of a uniqueId property: 1 + the largest whole number under `key` in any row
  // of the database, trashed rows and rows hidden from the caller included. Backends with
  // concurrent writers serialise callers per database until the transaction ends. Without it, the
  // runtime scans the rows it can read.
  nextUniqueId?(databaseId: string, key: string): Promise<number>;
};

export type DbRead = {
  docs: DocsRead;
  bodies: BodiesRead;
  links: LinksRead;
  blocks?: BlocksRead;
  attachments?: AttachmentsRead;
  threads?: ThreadsRead;
  history?: HistoryRead;
  activity?: ActivityRead;
  databases?: DatabasesRead;
  // Search bound to this transaction. Queries use it when present: a read outside the transaction
  // can wait for it forever where all reads share one connection (the browser).
  search?: Search;
};

export type DbTx = {
  docs: DocsRead & DocsWrite;
  bodies: BodiesRead & BodiesWrite;
  links: LinksRead & LinksWrite;
  blocks?: BlocksRead & BlocksWrite;
  attachments?: AttachmentsRead & AttachmentsWrite;
  threads?: ThreadsRead & ThreadsWrite;
  history?: HistoryRead & HistoryWrite;
  activity?: ActivityRead & ActivityWrite;
  databases?: DatabasesRead & DatabasesWrite;
  search?: Search;
  oplog: OperationLog;
  // Runs `fn` so that its writes roll back on its own if it throws, without failing the whole
  // transaction (SQL SAVEPOINT). Used to skip one step of a session undo.
  savepoint?<T>(fn: () => Promise<T>): Promise<T>;
};

export type Db = {
  read<T>(fn: (tx: DbRead) => Promise<T>): Promise<T>;
  // One transaction: everything inside commits together or not at all.
  write<T>(fn: (tx: DbTx) => Promise<T>): Promise<T>;
};

export type SearchQuery = { workspaceId: string; query: string; limit: number };

export type MentionsQuery = {
  workspaceId: string;
  // The document mentioned; it and documents already linking to it are excluded.
  targetId: string;
  // Phrases to look for (the title, aliases).
  phrases: readonly string[];
  limit: number;
};

export type Search = {
  query(input: SearchQuery): Promise<SearchHit[]>;
  mentions?(input: MentionsQuery): Promise<UnlinkedMention[]>;
};

// Content-addressed bytes: the key of attachment bytes is their lowercase hex SHA-256.
export type Blob = {
  put(key: string, data: Uint8Array, contentType?: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  has?(key: string): Promise<boolean>;
};

// A change to a document's body, reported to the `Versions` port after its transaction commits.
export type BodyChange = {
  documentId: string;
  workspaceId: string;
  // The body before the change; null when the document had none (it was just created).
  before: string | null;
  after: string;
  // ActorRef of who made it.
  actor: string;
  at: string;
  // The version this change restored (doc.restoreVersion).
  restoredFrom?: string;
};

// Version history of document bodies: what doc.listVersions, doc.getVersion and
// doc.restoreVersion run on. A backend picks one provider (snapshots: `createSnapshotVersions`
// over a `VersionStore`; a folder may use git instead; the hosted core has its own handlers).
// Without the port those operations fail with `internal` ("not supported by this backend").
export type Versions = {
  // Newest first.
  list(documentId: string, limit: number): Promise<DocumentVersion[]>;
  get(
    documentId: string,
    versionId: string,
  ): Promise<{ version: DocumentVersion; markdown: string } | null>;
  // Called after every body change commits. Providers that find changes on their own leave it out.
  record?(change: BodyChange): void | Promise<void>;
  // Makes sure a version holds `markdown`, the document's body as it is now, and returns its id
  // (null if it could not). doc.restoreVersion calls it first, so a restore can be taken back.
  checkpoint?(documentId: string, markdown: string, at: string): Promise<string | null>;
};

export type Events = {
  // Called after the transaction commits.
  publish(events: readonly LydieEvent[]): void | Promise<void>;
};

export type Clock = { now(): Date };

export type Ids = { uuid(): string };

// Where a finished `workspace.export` goes: a download in the browser, a file the person picks on
// the desktop, a path given to the CLI. Without the port the operation fails with `internal`.
export type Exports = {
  save(file: {
    workspaceId: string;
    filename: string;
    data: ReadableStream<Uint8Array>;
  }): Promise<{ url: string | null; expiresAt: string | null }>;
  // The workspace's name, for the file name.
  workspaceName?(workspaceId: string): string | null;
};
