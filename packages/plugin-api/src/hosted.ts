// What the composition root can offer plugins beyond the `Backend`: the account and hosted API
// (sign in, workspaces, the local → hosted hand-off, team and sharing operations), collaborative
// document bodies, the plugin list, the local folder's settings and build information. Every part is
// optional: a plugin checks for it and degrades (local mode, Electron, tests).
import type { InputOf, OperationId, Operations, OutputOf } from "@lydie/contract";

import type { RejectedChange, SyncState } from "./backend.ts";
import type {
  HostedInput,
  HostedOperationId,
  HostedOutput,
  WorkspaceRole,
} from "./hosted-operations.ts";

// `get` returns the same object until it changes (fits useSyncExternalStore).
export type Observable<T> = {
  get: () => T;
  subscribe: (listener: () => void) => () => void;
};

// ---- Account

export type AccountUser = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  // Two-step verification is on: a password sign-in also asks for a code.
  twoFactorEnabled?: boolean;
};

// "expired": the server refused the stored session; edits keep queueing until the user signs in.
export type AccountState =
  | { status: "signed-out" }
  | { status: "signed-in"; user: AccountUser }
  | { status: "expired"; user: AccountUser };

// Which database a window shows. Chosen once at startup and never swapped while the window is open:
// changing it reopens the window.
export type WorkspaceScope =
  | { readonly kind: "local"; readonly workspaceId: string | null }
  | { readonly kind: "hosted"; readonly workspaceId: string };

export type HostedWorkspaceSummary = {
  id: string;
  name: string;
  // Its picture (a URL or an SVG data: URL); null or absent: the generated one.
  image?: string | null;
  role: WorkspaceRole;
  createdAt: string;
  updatedAt: string;
};

export type LocalWorkspaceSummary = {
  id: string;
  name: string;
  // "browser": the database in this browser; "folder": a folder of Markdown files (desktop).
  kind: "browser" | "folder";
  path?: string;
  // This window shows it.
  current: boolean;
};

// The dry run of a hand-off (`@lydie/sync`'s HandoffSummary).
export type HandoffSummary = {
  documents: number;
  trashed: number;
  bodies: number;
  attachments: number;
  attachmentBytes: number;
  operations: number;
  existingInTarget: readonly string[];
  conflicts: readonly { id: string; title: string; workspaceId: string }[];
  missingBytes: readonly string[];
  warnings: readonly string[];
};

export type HandoffPlanHandle = {
  readonly summary: HandoffSummary;
  readonly target: { workspaceId: string; workspaceName: string };
};

export type HandoffProgress = {
  phase: "documents" | "bodies" | "attachments" | "trash" | "done";
  done: number;
  total: number;
};

export type HandoffOutcome = {
  ok: boolean;
  applied: number;
  duplicates: number;
  rejected: readonly RejectedChange[];
  bodies: { pushed: number; skipped: number; failed: readonly string[] };
  attachments: { uploaded: number; missing: readonly string[]; failed: readonly string[] };
  // Documents that took another id in the hosted workspace (the Getting started page): local id
  // → hosted id. The host moves this device's per-workspace settings with them.
  renamed: Readonly<Record<string, string>>;
};

export type HandoffApi = {
  // The dry run: what would be copied into the hosted workspace.
  plan(target: { workspaceId: string; workspaceName: string }): Promise<HandoffPlanHandle>;
  // Copies everything; safe to run again after a failure. The local data stays where it is.
  run(
    plan: HandoffPlanHandle,
    options?: { onProgress?: (progress: HandoffProgress) => void; signal?: AbortSignal },
  ): Promise<HandoffOutcome>;
  // How many pages of the local workspace a cloud workspace may lack: those changed after `since`
  // (ISO time), or with null since the workspace was made. Absent where it is not known (a folder).
  changedSince?(since: string | null): Promise<number>;
  // Present where a copy is a move (this browser's workspace; never a folder): forgets the local
  // workspace, for after `run` copied all of it. The window must reopen elsewhere right after;
  // the next local window starts a new, empty workspace.
  discard?(): Promise<void>;
};

// The sync engine's own view, with more than `BackendStatus` (hosted windows only).
export type SyncDetails = {
  state: Exclude<SyncState, "local-only">;
  pendingOperations: number;
  pendingUploads: number;
  // Bytes still to upload per attachment id.
  uploading: Readonly<Record<string, number>>;
  rejected: readonly RejectedChange[];
  lastSyncedAt: string | null;
  error: string | null;
  // When the next attempt is due after a failure.
  retryAt: string | null;
};

export type HostedApiError = Error & {
  // "network" (offline, server unreachable), "auth" (sign in again), "client" (4xx), "server".
  kind?: "network" | "server" | "auth" | "client";
  status?: number;
  code?: string;
};

// Identity providers the hosted service can sign in with.
export type AuthProvider = "google";

// What to do once a sign-in completes: carry this window's notes over, or nothing.
export type SignInFollowUp = "handoff" | null;

// Two-step verification of the signed-in account (an authenticator app plus backup codes). It
// applies to password sign-ins; Google sign-in relies on the Google account.
export type TwoFactorApi = {
  // Whether the account has a password (one that only signs in with Google has none).
  hasPassword(): Promise<boolean>;
  // Starts the setup: the otpauth:// link for the app and new backup codes. Two-step verification
  // is on once `confirm` gets a code from the app. Rejects with code INVALID_PASSWORD.
  enable(password: string): Promise<{ uri: string; backupCodes: string[] }>;
  // Rejects with code INVALID_CODE.
  confirm(code: string): Promise<void>;
  disable(password: string): Promise<void>;
  // New backup codes; the old ones stop working.
  backupCodes(password: string): Promise<string[]>;
};

export type AccountApi = {
  // The hosted API's origin.
  readonly apiUrl: string;
  // This window's scope (fixed for its lifetime).
  readonly scope: WorkspaceScope;
  // The scope this window was meant to open but could not without a sign-in (it opened `scope`).
  readonly wanted: WorkspaceScope | null;
  readonly state: Observable<AccountState>;
  // Rejects with code "two_factor_required" when the account has two-step verification:
  // `verifySignIn` finishes it.
  signIn(input: { email: string; password: string }): Promise<AccountUser>;
  // Finishes a sign-in with a code from the authenticator app or a backup code. Rejects with code
  // INVALID_CODE or INVALID_BACKUP_CODE (try again), or two_factor_expired (sign in again).
  verifySignIn(input: { code: string; method: "app" | "backup" }): Promise<AccountUser>;
  // Null where this window cannot change it.
  readonly twoFactor: TwoFactorApi | null;
  // Sets the signed-in person's picture: an image URL, or a drawn avatar as an SVG `data:` URL
  // (`scribbleImage` in the UI kit). Null goes back to the generated one. Members see it too.
  setImage(image: string | null): Promise<AccountUser>;
  signUp(input: { email: string; password: string; name?: string }): Promise<AccountUser>;
  // Signs in with an identity provider in the browser. The web app leaves the page and comes back
  // signed in (see `takeProviderReturn`); the desktop app opens the system browser and resolves
  // once signed in. Signs in existing accounts only while sign-up is closed.
  signInWith(provider: AuthProvider, options?: { then?: SignInFollowUp }): Promise<AccountUser>;
  // Stops waiting for a provider sign-in started from this window (desktop; a no-op elsewhere).
  cancelSignInWith(): void;
  // After coming back from a provider sign-in: its follow-up and error (a code, e.g.
  // "signup_disabled"), once. Null otherwise.
  takeProviderReturn(): { then: SignInFollowUp; error: string | null } | null;
  // In a hosted window this reopens the window in local scope.
  signOut(): Promise<void>;
  workspaces(): Promise<HostedWorkspaceSummary[]>;
  // gettingStarted: a new workspace for someone to start in (not a hand-off target) gets the
  // Getting started page, which the window opens once it has synced.
  createWorkspace(input: {
    name: string;
    gettingStarted?: boolean;
  }): Promise<HostedWorkspaceSummary>;
  // Workspaces on this device that need no account: this browser's, or the recently opened folders
  // (desktop), newest first.
  localWorkspaces(): readonly LocalWorkspaceSummary[];
  // Shows one of `localWorkspaces()` in place of this window. Rejects when it cannot be opened (a
  // folder that was moved or deleted).
  openLocalWorkspace(id: string): Promise<void>;
  // Picks a folder of Markdown files and shows it in place of this window; null where folders cannot
  // be opened (the browser).
  readonly openFolder: (() => Promise<void>) | null;
  // Reopens the window in `scope` (remembers it as the startup choice, then reloads).
  openScope(scope: WorkspaceScope): Promise<void>;
  // Hosted operations (team, sharing, publishing). Rejects with a `HostedApiError`.
  call<K extends HostedOperationId>(id: K, input: HostedInput<K>): Promise<HostedOutput<K>>;
  // A contract operation run on the hosted API rather than this window's replica, for what only
  // the server holds (workspace.export: bodies and files live there).
  callContract?<K extends OperationId>(
    id: K,
    input: InputOf<Operations[K]>,
  ): Promise<OutputOf<Operations[K]>>;
  // Local → hosted hand-off of this window's workspace; null where it is not available.
  readonly handoff: HandoffApi | null;
  // Hosted windows only.
  readonly sync: {
    readonly details: Observable<SyncDetails>;
    // Try again now instead of waiting for the back-off.
    retry(): void;
  } | null;
  // Builds a link into the web app (invitations, public pages), e.g. `/s/<token>`.
  webUrl(path: string): string;
};

// ---- Collaboration (hosted document bodies)

export type CollabDocState = {
  status:
    | "loading"
    | "offline"
    | "connecting"
    | "syncing"
    | "synced"
    | "unavailable"
    | "auth-expired";
  // view/comment access: the editor must not change the document.
  readOnly: boolean;
  level: string | null;
  // Local changes the server has not acknowledged.
  unsyncedChanges: number;
  // Why the document is unavailable (e.g. "forbidden" after access was removed, "not_found").
  reason: string | null;
  lastSyncedAt: string | null;
};

export type CollabSession = {
  readonly id: string;
  // A Y.Doc and a y-protocols Awareness (typed loosely: the plugin API does not depend on Yjs).
  readonly ydoc: unknown;
  readonly awareness: unknown;
  readonly user: { name: string; color: string };
  readonly state: Observable<CollabDocState>;
  // Resolves once the locally stored state is loaded (the editor can mount then).
  readonly loaded: Promise<void>;
  release(): void;
};

export type CollabApi = {
  // One session per document; call `release` when done (the pool shares sessions).
  open(documentId: string): CollabSession;
};

// ---- Host facts

export type PluginInfo = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  // Cannot be turned off (the settings themselves).
  essential: boolean;
};

export type PluginsApi = {
  list(): readonly PluginInfo[];
  // Takes effect when the window reopens.
  setEnabled(id: string, enabled: boolean): void;
};

export type AboutInfo = {
  version: string;
  licence: string;
  sourceUrl: string;
  // "web", "desktop".
  shell: string;
};

// The local MCP server of a folder workspace (desktop).
export type McpServerStatus = {
  running: boolean;
  url: string | null;
  tokenPath: string | null;
  error: string | null;
};

// A folder's settings, kept in its `.lydie/workspace.json`. Unset ones fall back to the folder's
// Obsidian settings, then to defaults.
export type FolderSettings = {
  // "" = the folder's top level. Its files are not indexed as notes.
  attachmentsFolder: string;
  // Ignore patterns (gitignore-like) for notes that are not indexed.
  exclude: readonly string[];
  newNoteLocation: "root" | "current" | "folder";
  newNoteFolder: string | null;
  // How new links are written ([[Note]] or [Note](Note.md)), and how they name their target.
  linkFormat: "wiki" | "markdown";
  linkPath: "shortest" | "relative" | "absolute";
  // What keeps version history of note bodies: snapshots beside the folder's database, git
  // commits of the folder, or nothing.
  versionHistory: "snapshots" | "git" | "off";
};

// Fields to change; null resets one to its default. Invalid input rejects with "<field>: <reason>".
export type FolderSettingsPatch = {
  [K in keyof FolderSettings]?: (K extends "exclude" ? string[] : FolderSettings[K]) | null;
};

// Local-folder workspaces (desktop).
export type VaultApi = {
  readonly folder: string;
  mcp: {
    status: Observable<McpServerStatus>;
    setEnabled(enabled: boolean): Promise<McpServerStatus>;
  } | null;
  // Folder settings kept in the folder's `.lydie/`; null while the file bridge cannot change them.
  settings: {
    get(): Promise<FolderSettings>;
    // The latest value, for synchronous readers (kept current from every window's changes).
    current(): FolderSettings;
    set(patch: FolderSettingsPatch): Promise<FolderSettings>;
    // Every change, from any window; returns the unsubscribe.
    subscribe(listener: (settings: FolderSettings) => void): () => void;
  } | null;
};

// Everything the composition root offers; each part optional.
export type HostServices = {
  account?: AccountApi;
  collab?: CollabApi;
  vault?: VaultApi;
  about?: AboutInfo;
  // Renames this workspace (local browser workspaces keep the name on this device).
  renameWorkspace?: (name: string) => Promise<void>;
};
