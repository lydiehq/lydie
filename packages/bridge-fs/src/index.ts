// @lydie/bridge-fs: a folder of Markdown files ⇄ the local database. See AGENTS.md.
export { Bridge, BRIDGE_ACTOR } from "./bridge.ts";
export type {
  BridgeOptions,
  DocumentHandle,
  ExternalChange,
  FileConflict,
  IndexReport,
  OpenDocument,
  VaultState,
  VaultStatus,
} from "./bridge.ts";
export {
  databasePathFor,
  defaultDataDir,
  LOCAL_USER,
  openVault,
  runnableOperations,
} from "./vault.ts";
export type { OpenVaultOptions, Vault } from "./vault.ts";
export { extractBody, prefixLength, readContent } from "./content.ts";
export { deriveId } from "./ids.ts";
export { exportsTo } from "./exports.ts";
export type { WriteHooks } from "./fs.ts";
export type { WatchOptions } from "./watch.ts";
export { serveVault } from "./serve.ts";
export { checkPatch, DEFAULT_SETTINGS, SETTING_KEYS, SettingsError } from "./settings.ts";
export type {
  FolderSettings,
  FolderSettingsPatch,
  LinkFormat,
  LinkPath,
  NewNoteLocation,
} from "./settings.ts";
export type { McpControl, VaultHandlers } from "./serve.ts";
export { VAULT_SERVICE, vaultService } from "./service.ts";
export type { ConflictRow, DocumentEvent, McpStatus, VaultServiceContract } from "./service.ts";
export { createFileVersionStore } from "./version-store.ts";
export {
  GitError,
  gitAvailable,
  initGitRepository,
  isGitRepository,
  openGitVersions,
} from "./git-versions.ts";
export type { GitVersions, GitVersionsOptions } from "./git-versions.ts";
