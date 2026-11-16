// The vault service: what a UI in another process (the Electron renderer) can ask the file bridge,
// next to the generic backend service. Types and a name only, no Node imports, so the renderer can
// import it: `serviceClient(platform.services, vaultService)`. Served by `serveVault` (./serve.ts).
//
// The contract type is structurally a `ServiceContract` of @lydie/platform; `vaultService` is what
// `defineService<VaultServiceContract>("lydie-vault")` returns (this package may not import the
// platform package).
import type { ReplaceStepJSON, TextConflict } from "@lydie/markdown";

import type { FolderSettings, FolderSettingsPatch } from "./settings.ts";

export type VaultState = "opening" | "indexing" | "ready" | "error" | "closed";

export type IndexReport = {
  ms: number;
  // When the documents (the tree) were in the database; bodies, links and databases come after.
  treeMs?: number;
  documents: number;
  read: number;
  created: number;
  updated: number;
  moved: number;
  removed: number;
};

export type VaultStatus = {
  state: VaultState;
  folder: string;
  workspaceId: string;
  indexed: number;
  total: number;
  documents: number;
  watching: boolean;
  lastIndex: IndexReport | null;
  error: string | null;
};

export type FileConflict = {
  id: string;
  path: string;
  conflictPath: string;
  conflictId: string | null;
  conflicts: TextConflict[];
  at: string;
};

export type ExternalChange = { ids: string[] };

// Events for one open document (`openDocument` session).
export type DocumentEvent =
  // Apply in order: `tr.replace(from, to, Slice.fromJSON(schema, slice))`. They are relative to the
  // document as last sent with `updateDocument` (or as opened), with the steps of earlier events
  // applied; map them through local changes made since.
  //
  // Ordering (LYD-254): `version` numbers the steps events of the session (1, 2, …); `basedOn` is
  // the `seq` of the `updateDocument` the steps were computed against (null: the document as
  // opened, or an update sent without `seq`). A client that tags updates maps the steps through
  // its local changes since update `basedOn`, which may be older than the last one it sent.
  | {
      type: "steps";
      steps: ReplaceStepJSON[];
      source: string;
      version?: number;
      basedOn?: number | null;
    }
  // Both versions are kept: the editor's in `conflict.conflictPath`; a "steps" event that brings the
  // editor to the file's version follows.
  | { type: "conflict"; conflict: FileConflict }
  // The file was deleted or the document purged.
  | { type: "closed"; reason: "deleted" };

// What `updateDocument` and `saveDocument` may send as `doc` instead of the whole document: the
// document of the update or save with seq `base`, its top-level blocks `from` to `to` (exclusive)
// replaced by `content` (ProseMirror JSON); `count` is the patched document's number of blocks.
// Main refuses a patch unless its copy is exactly that document (no steps sent since): the update
// is dropped, the save answers `stale`. Send the whole document then.
export type DocumentPatch = {
  type: "patch";
  base: number;
  from: number;
  to: number;
  content: unknown[];
  count: number;
};

export type McpStatus = {
  running: boolean;
  // http://127.0.0.1:<port>/mcp while running.
  url: string | null;
  // Where the bearer token is stored (inside the vault's `.lydie/`).
  tokenPath: string | null;
  error: string | null;
};

export type ConflictRow = {
  id: string;
  workspaceId: string;
  kind: string;
  details: unknown;
  detectedAt: string;
};

export type VaultServiceContract = {
  requests: {
    status: { input: null; output: VaultStatus };
    // Rescan paths (vault-relative; [""] or omitted: everything).
    rescan: { input: { paths?: string[] }; output: null };
    pathOf: { input: { id: string }; output: string | null };
    // Open a document for editing: the file text to load with @lydie/markdown's `parse`.
    openDocument: { input: { id: string }; output: { session: string; source: string } };
    // The editor's current document (ProseMirror JSON, or a `DocumentPatch` of the last one sent);
    // send it (debounced) while it has unsaved edits, so external changes merge against it.
    // Optional ordering (LYD-254): `seq` increases
    // with every update; `version` is the last steps event applied to `doc`. An update with an
    // older `version` than the last steps event sent is dropped (it lacks those steps); send the
    // document again after applying them.
    updateDocument: {
      input: { session: string; doc: unknown; seq?: number; version?: number };
      output: null;
    };
    // Splice-save the editor's document (or a `DocumentPatch`) to the file (doc.updateBody, not on
    // the undo stack). With an older `version` nothing is written and `stale` is true: apply the
    // pending steps, then save. A patch main cannot apply is `stale` too.
    saveDocument: {
      input: { session: string; doc: unknown; seq?: number; version?: number };
      output: { changed: boolean; verified: boolean; stale?: boolean };
    };
    closeDocument: { input: { session: string }; output: null };
    conflicts: { input: null; output: ConflictRow[] };
    // The user dealt with a conflict (kept one version, merged by hand): clear the flag.
    resolveConflict: { input: { id: string }; output: null };
    // The folder's settings (Settings → Files & links), and changing them: each field given
    // replaces the stored one, null resets it to the default. Invalid input is rejected with
    // "<field>: <reason>"; a new attachment folder or exclude list rescans before resolving.
    settings: { input: null; output: FolderSettings };
    setSettings: { input: FolderSettingsPatch; output: FolderSettings };
    mcpStatus: { input: null; output: McpStatus };
    // Start or stop the local MCP server for this vault (off by default).
    mcpSetEnabled: { input: { enabled: boolean }; output: McpStatus };
  };
  streams: {
    status: { params: null; event: VaultStatus };
    externalChanges: { params: null; event: ExternalChange };
    conflicts: { params: null; event: FileConflict };
    document: { params: { session: string }; event: DocumentEvent };
    mcp: { params: null; event: McpStatus };
    // The current settings, then every change (from any window).
    settings: { params: null; event: FolderSettings };
  };
};

export const VAULT_SERVICE = "lydie-vault";

export const vaultService: { readonly name: string; readonly contract?: VaultServiceContract } = {
  name: VAULT_SERVICE,
};
