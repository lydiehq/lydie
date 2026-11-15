// The seam between the UI and the data layer. UI code (the host and every plugin) talks only to a
// `Backend`; whether the database runs in this thread (web: `@lydie/store/web`) or in another
// process (Electron main, over `@lydie/platform`'s ServiceChannel) is decided once, at the
// composition root. Types only: implementations live in `@lydie/app/backend`.
import type {
  Attachment,
  Backlink,
  ChildEntry,
  Database,
  DatabaseDefinition,
  DatabaseProperty,
  Document,
  DocumentAccess,
  DocumentBody,
  DocumentGrantRow,
  InputOf,
  OperationId,
  Operations,
  OutgoingLink,
  OutputOf,
  SearchHit,
  TeamspaceMemberRow,
  TeamspaceRow,
  ThreadRow,
  TrashItem,
  TreeEntry,
  UnlinkedMention,
  UnresolvedLink,
  ViewConfigInput,
  ViewGroup,
  ViewRow,
  ViewType,
  ViewWindowInput,
  WorkspaceMemberRow,
  WorkspaceRow,
} from "@lydie/contract";

// ---- Operations

export type OperationOptions = {
  // Undo stack to record on (the active tab's scope, see `historyScope`). Default "default".
  scope?: string;
  // Merge into the previous undo step with the same key if it is recent (typing in a title).
  coalesce?: string;
  // false: journaled but not put on an undo stack (editor body saves).
  history?: boolean;
  // Agent session id.
  sessionId?: string;
  // Undo step label; defaults to the operation summary.
  label?: string;
  // How far a long query has got (workspace.export: entries written of all entries).
  onProgress?: (progress: { done: number; total: number }) => void;
};

type Namespaces = OperationId extends `${infer N}.${string}` ? N : never;

export type OperationFn<K extends OperationId> = (
  input: InputOf<Operations[K]>,
  options?: OperationOptions,
) => Promise<OutputOf<Operations[K]>>;

// `ops.doc.move({ id, parentId }, { scope })`: one function per contract operation (mutations and
// one-shot queries). Mutations commit to the local database before the promise settles, and every
// live query that reads what they changed re-emits within the same frame.
export type BackendOps = {
  readonly [N in Namespaces]: {
    readonly [
      K in OperationId & `${N}.${string}` as K extends `${N}.${infer M}` ? M : never
    ]: OperationFn<K>;
  };
};

// Inside `transaction`, run operations through the `ops` it receives.
export type TransactionOps = BackendOps;

// ---- Live queries

export type DocWithBody = { document: Document; body: DocumentBody | null };

// Every live query the UI can watch, by name. Params are plain JSON so they cross processes.
export type LiveQueries = {
  // One level of the tree (with childCount). Watch one per expanded folder, never the full tree.
  // Hosted: `teamspaceId` / `privateOwnerId` keep one space's pages (`teamspaceId: null` = pages in
  // no teamspace, i.e. private sections).
  "doc.children": {
    params: {
      workspaceId: string;
      parentId: string | null;
      includeDeleted?: boolean;
      teamspaceId?: string | null;
      privateOwnerId?: string;
    };
    row: ChildEntry;
  };
  // Depth-first tree; with `expanded`, only those folders are descended into.
  "doc.tree": {
    params: {
      workspaceId: string;
      rootId?: string;
      includeDeleted?: boolean;
      expanded?: readonly string[];
      teamspaceId?: string | null;
      privateOwnerId?: string;
    };
    row: TreeEntry;
  };
  // Zero or one row.
  "doc.get": { params: { id: string; includeBody?: boolean }; row: DocWithBody };
  // Live documents, most recently changed first (default 20). Hosted: live edits by others reach
  // `updatedAt` only when the row itself changes.
  "doc.recent": { params: { workspaceId: string; limit?: number }; row: Document };
  "doc.search": { params: { workspaceId: string; text: string; limit?: number }; row: SearchHit };
  "doc.backlinks": { params: { id: string }; row: Backlink };
  // The links in one document as written, each with the live document it resolves to (or null).
  "doc.links": { params: { id: string }; row: OutgoingLink };
  "doc.blockBacklinks": { params: { id: string; blockId: string }; row: Backlink };
  "doc.unresolvedLinks": { params: { workspaceId: string }; row: UnresolvedLink };
  "doc.unlinkedMentions": {
    params: { workspaceId: string; targetId: string; phrases: readonly string[]; limit?: number };
    row: UnlinkedMention;
  };
  "trash.list": { params: { workspaceId: string; limit?: number }; row: TrashItem };
  "attachment.list": {
    params: { workspaceId: string; documentId?: string; includeDeleted?: boolean };
    row: Attachment;
  };
  // A document's threads and replies as stored (resolved ones included, deleted ones not), oldest
  // first: build `Thread`s with `assembleThreads`.
  "thread.list": { params: { documentId: string }; row: ThreadRow };
  // Zero or one row: the database's settings, live properties and views, in order (none when the
  // document is not a live database).
  "database.get": { params: { id: string }; row: DatabaseDefinition };
  "database.list": { params: { workspaceId: string }; row: DatabaseSummaryRow };
  // A database's live properties, also when the database itself is not visible (a guest who was
  // shared one row receives its property definitions only; LYD-247).
  "database.properties": { params: { databaseId: string }; row: DatabaseProperty };
  // One window of a view: its rows in order, then every group header, then one meta item.
  "database.view": { params: DatabaseViewParams; row: DatabaseViewItem };
  // Hosted workspaces only (no row in local mode): zero or one row, the workspace's name and
  // picture as they are now (`info.workspaceName` is the name the window opened with).
  "workspace.get": { params: { workspaceId: string }; row: WorkspaceRow };
  // Hosted workspaces only (empty in local mode): the people person properties can name.
  "workspace.members": { params: { workspaceId: string }; row: WorkspaceMemberRow };
  // Hosted only (empty in local mode): teamspaces the user can see, a teamspace's members, the
  // user's access to a document (zero or one row) and a document's own grants.
  "workspace.teamspaces": { params: { workspaceId: string }; row: TeamspaceRow };
  "teamspace.members": { params: { teamspaceId: string }; row: TeamspaceMemberRow };
  "doc.access": { params: { id: string }; row: DocumentAccess };
  "doc.grants": { params: { id: string }; row: DocumentGrantRow };
};

// ---- Databases (shapes of @lydie/store's view queries)

export type DatabaseSummaryRow = Database & { title: string; parentId: string | null };

export type DatabaseViewParams = {
  databaseId: string;
  // A saved view; default the database's first view.
  viewId?: string;
  // Ad-hoc changes over the saved view (a search, an unsaved filter).
  view?: { type?: ViewType; config?: Partial<ViewConfigInput> };
  window?: ViewWindowInput;
  // The signed-in user's id, for "me" filters.
  me?: string | null;
  // The user's local date (YYYY-MM-DD) for relative date filters; default the device's.
  today?: string;
};

export type DatabaseViewItem =
  | { kind: "row"; key: string; row: ViewRow }
  | { kind: "group"; key: string; group: ViewGroup }
  | { kind: "meta"; key: "meta"; total: number; offset: number; viewType: ViewType };

export type LiveQueryName = keyof LiveQueries;
export type LiveParams<N extends LiveQueryName> = LiveQueries[N]["params"];
export type LiveRow<N extends LiveQueryName> = LiveQueries[N]["row"];

// What a live query holds. `data` keeps the same array while nothing changed, and unchanged rows
// keep their object identity across emissions (wrap row components in `memo`).
export type LiveState<T> = {
  data: readonly T[];
  isLoading: boolean;
  error: Error | undefined;
};

// Fits `useSyncExternalStore(handle.subscribe, handle.getSnapshot)`. The query runs while it has
// subscribers (and lingers briefly after the last one leaves, so remounts are instant). Calling
// `live` twice with equal params returns the same handle while it is alive.
export type LiveHandle<T> = {
  readonly key: string;
  getSnapshot: () => LiveState<T>;
  subscribe: (listener: () => void) => () => void;
};

// ---- History (the operation undo stack; editor text keeps its own)

export type HistoryState = {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
};

export type BackendHistory = {
  // Resolve false when there was nothing to undo; reject with a LydieError "conflict" when the step
  // no longer applies (it is dropped).
  undo(scope?: string): Promise<boolean>;
  redo(scope?: string): Promise<boolean>;
  canUndo(scope?: string): boolean;
  canRedo(scope?: string): boolean;
  // Stable object per state (for useSyncExternalStore). Synchronous on every backend.
  state(scope?: string): HistoryState;
  // Called with the scope whose stacks changed.
  subscribe(listener: (scope: string) => void): () => void;
};

// ---- Status

export type SyncState =
  | "local-only"
  // Hosted window whose session ended: edits keep queueing locally until the user signs in.
  | "signed-out"
  // The server refused the session's token: sign in again to send queued edits.
  | "auth-expired"
  | "offline"
  | "connecting"
  | "syncing"
  | "synced"
  | "error";

// A change the server refused; it stays applied locally until dismissed (or undone).
export type RejectedChange = {
  operationId: string;
  operation: string;
  reason: { code: string; message: string };
  rejectedAt: string;
};

export type BackendStatus = {
  sync: SyncState;
  pendingOperations: number;
  pendingUploads: number;
  conflicts: number;
  lastSyncedAt: string | null;
  error: string | null;
  // Hosted mode only.
  rejected?: readonly RejectedChange[];
  // Hosted mode only: this window's first download from the server is still on its way, so an
  // empty workspace or tree may just not have arrived yet (show a placeholder, not "empty").
  awaitingFirstSync?: boolean;
};

// ---- Attachments

export type AddAttachmentInput = {
  workspaceId: string;
  documentId?: string | null;
  filename: string;
  contentType: string;
  data: Uint8Array;
};

export type BackendAttachments = {
  add(input: AddAttachmentInput, options?: OperationOptions): Promise<Attachment>;
  // A URL the renderer can put in `src` (an object URL on the web), or null when the bytes are not
  // on this device. Callers own object URLs: revoke them with `URL.revokeObjectURL` when done.
  url(attachmentId: string): Promise<string | null>;
};

// ---- Layout persistence (the reducer runs in the renderer; only load/save cross processes)

export type BackendLayouts = {
  load(id: string): Promise<unknown>;
  save(id: string, layout: unknown): Promise<void>;
};

// ---- Open documents (a folder vault: the file bridge's editing sessions)

// Both versions of a file were kept: the editor's went to `conflictPath` (document `conflictId`).
export type FileConflictInfo = {
  // The document (also the conflict flag's id).
  id: string;
  path: string;
  conflictPath: string;
  conflictId: string | null;
  at: string;
};

export type DocumentSessionEvent =
  // ProseMirror replace steps (`{ from, to, slice }`), relative to the document as last sent with
  // `update` (or as opened) with earlier steps applied: map them through local edits since.
  | {
      type: "steps";
      steps: readonly unknown[];
      source: string;
      // Numbers the session's steps events (1, 2, …); send it back with `update`/`save` once applied.
      version?: number;
      // The `seq` of the update the steps were computed against (null: the document as opened): map
      // them through local edits made since that update, which may be older than the last sent.
      basedOn?: number | null;
    }
  | { type: "conflict"; conflict: FileConflictInfo }
  | { type: "closed"; reason: "deleted" };

export type DocumentSession = {
  // The file's text (with frontmatter) to load with `app.editor.fromMarkdown`.
  readonly source: string;
  // The editor's document (ProseMirror JSON) while it has unsaved edits, so changes made on disk
  // merge with them.
  // Returns the update's `seq` (increasing per session; steps events name it in `basedOn`).
  update(doc: unknown): number;
  // Splice-saves the editor's document to the file (not on the undo stack). `stale`: steps the
  // editor has not applied yet were pending, nothing was written: apply them, then save again.
  save(doc: unknown): Promise<{ changed: boolean; stale?: boolean; seq: number }>;
  subscribe(listener: (event: DocumentSessionEvent) => void): () => void;
  close(): void;
};

export type BackendDocuments = {
  // Rejects when the document has no file (or the window has no folder): edit through
  // `doc.updateBody` then.
  open(id: string): Promise<DocumentSession>;
  conflicts(): Promise<FileConflictInfo[]>;
  // The user dealt with a conflict: clear its flag.
  resolveConflict(id: string): Promise<void>;
};

// ---- The backend

export type BackendInfo = {
  // "local": local-only database (browser-private or a folder); "synced": attached to the cloud.
  mode: "local" | "synced";
  workspaceId: string;
  workspaceName: string;
  // A hosted workspace's name in web app URLs (`/w/<slug>`), when this device knows it.
  workspaceSlug?: string | null;
  // false when the database only lives in memory (no OPFS); the UI must say so.
  persistent: boolean;
  // In memory on purpose (the marketing site's try-out), whose window says so itself.
  ephemeral?: boolean;
  // The Getting started page created when this workspace was first opened, for the window to open.
  welcomeDocId?: string | null;
};

export type Backend = {
  readonly info: BackendInfo;
  readonly ops: BackendOps;
  execute<K extends OperationId>(
    id: K,
    input: InputOf<Operations[K]>,
    options?: OperationOptions,
  ): Promise<OutputOf<Operations[K]>>;
  // Several operations as one database transaction and one undo step.
  transaction<T>(
    label: string,
    fn: (ops: TransactionOps) => Promise<T>,
    options?: OperationOptions,
  ): Promise<T>;
  live<N extends LiveQueryName>(name: N, params: LiveParams<N>): LiveHandle<LiveRow<N>>;
  // The same queries, run once (autocomplete, pickers). Prefer these over query operations from
  // the UI: they read the local database directly.
  query<N extends LiveQueryName>(name: N, params: LiveParams<N>): Promise<readonly LiveRow<N>[]>;
  readonly history: BackendHistory;
  readonly status: {
    get: () => BackendStatus;
    subscribe: (listener: () => void) => () => void;
    // Hosted mode only: forget rejected changes (all of them without ids).
    dismissRejected?: (operationIds?: readonly string[]) => void;
  };
  readonly attachments: BackendAttachments;
  readonly layouts: BackendLayouts;
  // Folder vaults in Electron only: edit through the file bridge, so changes made on disk merge
  // into an open editor live. Absent elsewhere.
  readonly documents?: BackendDocuments;
  close(): Promise<void>;
};
