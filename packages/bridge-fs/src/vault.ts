// One call that opens a folder as a Lydie workspace: the database (outside the folder), the runtime
// with @lydie/markdown's extractor and the vault as its Blob port, and the file bridge as the
// runtime's events port. Used by the desktop main process, the CLI and the local MCP server.
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { actorRef, operations } from "@lydie/contract";
import type { Actor, LydieEvent, Operations } from "@lydie/contract";
import {
  coreHandlers,
  createGettingStarted,
  createRuntime,
  createSnapshotVersions,
  uuid,
} from "@lydie/runtime";
import type { Blob, Exports, Runtime, Versions } from "@lydie/runtime";
import type { Store } from "@lydie/store";
import { openNodeStore } from "@lydie/store/node";
import type { NodeStoreOptions } from "@lydie/store/node";

import { Bridge } from "./bridge.ts";
import type { IndexReport, VaultStatus } from "./bridge.ts";
import { extractBody } from "./content.ts";
import type { WriteHooks } from "./fs.ts";
import {
  gitAvailable,
  initGitRepository,
  isGitRepository,
  openGitVersions,
} from "./git-versions.ts";
import type { GitVersions } from "./git-versions.ts";
import { loadWorkspaceConfig, saveWorkspaceConfig } from "./meta.ts";
import {
  applyPatch,
  checkPatch,
  effectiveSettings,
  obsidianDefaults,
  SettingsError,
} from "./settings.ts";
import type { FolderSettings, FolderSettingsPatch, VersionHistory } from "./settings.ts";
import { createFileVersionStore } from "./version-store.ts";
import type { WatchOptions } from "./watch.ts";

export type OpenVaultOptions = {
  folder: string;
  // The database file. Default: `<dataDir>/workspaces/<hash of the folder path>.sqlite`.
  databasePath?: string;
  // Where databases live when `databasePath` is omitted. Default: `defaultDataDir()`.
  dataDir?: string;
  // Who operations run as by default. Default: the local user `{ type: "user", id: "local" }`.
  actor?: Actor;
  // Watch the folder for changes by other programs. Default true. Off for one-shot CLI commands.
  watch?: boolean | WatchOptions;
  // Test hooks for atomic writes.
  hooks?: WriteHooks;
  onError?: (error: unknown) => void;
  // Passed to `openNodeStore` (e.g. `workerUrl: unpackedAsar` in a packaged Electron app).
  store?: Pick<NodeStoreOptions, "workerUrl">;
  // Write a Getting started page when this open makes an empty folder a workspace (the desktop
  // app). Never in a folder that already has anything in it, such as an Obsidian vault.
  gettingStarted?: boolean;
  // Where workspace.export saves the zip (the desktop app: a save dialog).
  exports?: Exports;
  // Resolve once the database is open and `.lydie/` read, and index the folder after that
  // (`vault.indexed`); the desktop app serves windows from the database meanwhile. Operations'
  // file writes, open documents and rescans wait for the index (the bridge's queue). A folder
  // opened for the first time while empty is indexed before resolving either way.
  indexInBackground?: boolean;
};

const NOT_INDEXED: IndexReport = {
  ms: 0,
  documents: 0,
  read: 0,
  created: 0,
  updated: 0,
  moved: 0,
  removed: 0,
};

export type Vault = {
  readonly folder: string;
  readonly workspaceId: string;
  readonly databasePath: string;
  readonly store: Store;
  readonly runtime: Runtime;
  readonly bridge: Bridge;
  readonly blob: Blob;
  // What opening indexed (all zero until `indexed` resolves).
  readonly index: IndexReport;
  // Resolves when the folder is indexed (at once unless `indexInBackground`), version history is
  // set up and the Getting started page written; rejects when indexing failed.
  readonly indexed: Promise<IndexReport>;
  // The Getting started page this open created (`gettingStarted`), else null.
  readonly gettingStartedId: string | null;
  status(): VaultStatus;
  // The folder's settings (`.lydie/workspace.json`, then Obsidian's, then defaults).
  settings(): FolderSettings;
  // Validates (SettingsError), stores and applies a change; resolves the new settings. A new
  // attachment folder or exclude list rescans the folder first.
  setSettings(patch: FolderSettingsPatch): Promise<FolderSettings>;
  onSettings(listener: (settings: FolderSettings) => void): () => void;
  // What keeps version history right now. It differs from `settings().versionHistory` when git is
  // asked for but this device has no git or the folder is not a repository: snapshots then.
  versionHistory(): VersionHistory;
  // Every operation's events, after its files landed.
  subscribe(listener: (events: readonly LydieEvent[]) => void): () => void;
  close(): Promise<void>;
};

export const LOCAL_USER: Actor = { type: "user", id: "local" };

// Per-user data directory for databases of the CLI and MCP server (the desktop app passes its own).
export function defaultDataDir(): string {
  if (process.env.LYDIE_DATA_DIR) return resolve(process.env.LYDIE_DATA_DIR);
  if (process.platform === "win32") {
    return join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "Lydie");
  }
  if (process.platform === "darwin") return join(homedir(), "Library", "Caches", "Lydie");
  return join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "lydie");
}

// The database of a folder lives outside it (plan §1), keyed by the folder's real path.
export function databasePathFor(folder: string, dataDir: string): string {
  const hash = createHash("sha256").update(realpathSync(folder)).digest("hex").slice(0, 24);
  return join(dataDir, "workspaces", `${hash}.sqlite`);
}

// The contract's operations that the runtime has handlers for. A safety net: the contract can
// define an operation before its local handler exists, createRuntime refuses that, and a vault must
// still open. Every operation has a handler today; a skipped one is reported once.
let reported = false;
export function runnableOperations(): Operations {
  const missing = Object.keys(operations).filter((id) => !Object.hasOwn(coreHandlers, id));
  if (missing.length && !reported) {
    reported = true;
    console.warn(`[bridge-fs] no runtime handler (left out): ${missing.join(", ")}`);
  }
  return Object.fromEntries(
    Object.entries(operations).filter(([id]) => Object.hasOwn(coreHandlers, id)),
  ) as Operations;
}

// Files the system drops into folders, which do not make a folder someone's notes.
const SYSTEM_FILES = new Set([".DS_Store", ".localized", "Thumbs.db", "desktop.ini"]);

async function isEmptyFolder(folder: string): Promise<boolean> {
  return (await readdir(folder)).every((name) => SYSTEM_FILES.has(name));
}

export async function openVault(options: OpenVaultOptions): Promise<Vault> {
  const folder = realpathSync(resolve(options.folder));
  if (!(await stat(folder)).isDirectory()) throw new Error(`Not a folder: ${folder}`);

  // `.lydie/workspace.json` is the only file Lydie writes on first open: it fixes the workspace id
  // so a rebuilt database gets the same ids.
  let config = await loadWorkspaceConfig(folder);
  // Decided before workspace.json exists, so only the very first open of an empty folder counts.
  let fresh = false;
  if (!config) {
    fresh = await isEmptyFolder(folder);
    config = { version: 1, workspaceId: uuid() };
    await saveWorkspaceConfig(folder, config);
  }
  const obsidian = await obsidianDefaults(folder);
  let settings = effectiveSettings(config, obsidian);
  const attachmentsFolder = settings.attachmentsFolder;

  const databasePath =
    options.databasePath ?? databasePathFor(folder, options.dataDir ?? defaultDataDir());
  await mkdir(dirname(databasePath), { recursive: true });
  const store = await openNodeStore({ path: databasePath, ...options.store });

  // Version history (the `versionHistory` setting). The runtime gets one port for its lifetime;
  // which provider answers follows the setting. Snapshots live beside the database.
  const report = options.onError ?? ((error: unknown) => console.error(error));
  const versionStore = createFileVersionStore(`${databasePath.replace(/\.sqlite$/, "")}.versions`, {
    onError: report,
  });
  const snapshots = createSnapshotVersions(versionStore);
  let git: GitVersions | null = null;
  let versionHistory: VersionHistory = "off";
  const provider = (): Versions | null =>
    versionHistory === "git" ? git : versionHistory === "snapshots" ? snapshots : null;
  const versions: Required<Versions> = {
    list: async (id, limit) => (await provider()?.list(id, limit)) ?? [],
    get: async (id, versionId) => (await provider()?.get(id, versionId)) ?? null,
    record: (change) => provider()?.record?.(change),
    checkpoint: async (id, markdown, at) =>
      (await provider()?.checkpoint?.(id, markdown, at)) ?? null,
  };

  const actor = options.actor ?? LOCAL_USER;
  const bridge = new Bridge({
    root: folder,
    workspaceId: config.workspaceId,
    store,
    attachmentsFolder,
    exclude: settings.exclude,
    linkFormat: settings.linkFormat,
    actor,
    ...(options.hooks ? { hooks: options.hooks } : {}),
    ...(typeof options.watch === "object" ? { watch: options.watch } : {}),
    ...(options.onError ? { onError: options.onError } : {}),
  });
  const listeners = new Set<(events: readonly LydieEvent[]) => void>();
  const runtime = createRuntime({
    registry: runnableOperations(),
    ...store.ports,
    actor,
    blob: bridge.blob,
    ...(options.exports ? { exports: options.exports } : {}),
    versions,
    extract: extractBody,
    events: {
      async publish(events) {
        await bridge.handleEvents(events);
        // Git versions the whole folder: renames, moves and properties count as changes too.
        git?.touch([...new Set(events.map((e) => actorRef(e.actor)))]);
        for (const event of events) {
          if (event.type !== "doc.purged") continue;
          for (const id of event.data.purgedIds) await versionStore.save(id, [], {});
        }
        for (const listener of listeners) listener(events);
      },
    },
    ...(options.onError ? { onEventError: options.onError } : {}),
  });
  bridge.attach(runtime);

  // `init`: make the folder a repository if it is not one. Only when someone turns git on, never
  // on open (a folder copied to a device without its `.git`).
  async function useVersionHistory(wanted: VersionHistory, init: boolean): Promise<void> {
    if (wanted === "git" && !git) {
      if (!(await gitAvailable())) {
        throw new SettingsError("versionHistory", "git is not installed on this device");
      }
      if (!(await isGitRepository(folder))) {
        if (!init) throw new SettingsError("versionHistory", "the folder is not a git repository");
        await initGitRepository(folder);
      }
      git = await openGitVersions({
        folder,
        pathOf: (id) => bridge.pathOf(id),
        settled: () => bridge.idle(),
        onError: report,
      });
      // Turned on just now: the folder as it is becomes the first checkpoint.
      if (init) git.touch();
    }
    versionHistory = wanted;
    if (wanted !== "git" && git) {
      const previous = git;
      git = null;
      await previous.close();
    }
  }

  let index: IndexReport | null = null;
  let gettingStartedId: string | null = null;
  let closing = false;
  // The index, then version history and the Getting started page, which need it.
  async function finishOpening(): Promise<IndexReport> {
    const done = await bridge.open({ watch: options.watch !== false });
    index = done;
    if (closing) return done;
    try {
      await useVersionHistory(settings.versionHistory, false);
    } catch (error) {
      report(error);
      versionHistory = "snapshots";
    }
    if (fresh && options.gettingStarted) {
      const workspaceId = config!.workspaceId;
      try {
        // One transaction, off the undo stack and out of the activity log: the page is there from
        // the start, not an action.
        const created = await runtime.transaction(
          "Getting started",
          (ops) => createGettingStarted(ops, { workspaceId, mode: "folder" }),
          { history: false, activity: false },
        );
        gettingStartedId = created?.id ?? null;
      } catch (error) {
        (options.onError ?? console.error)(error);
      }
    }
    return done;
  }

  let indexed: Promise<IndexReport>;
  // A fresh folder is indexed at once, and its Getting started page must be known.
  if (options.indexInBackground && !fresh) {
    await bridge.load();
    indexed = finishOpening();
    // Seen by whoever waits for it; not an unhandled rejection meanwhile.
    indexed.catch(() => {});
  } else {
    try {
      indexed = Promise.resolve(await finishOpening());
    } catch (error) {
      await bridge.close();
      await store.close();
      throw error;
    }
  }

  const settingsListeners = new Set<(settings: FolderSettings) => void>();
  // Settings wait for the index (a rescan, version history).
  let settingsQueue: Promise<unknown> = indexed.catch(() => {});
  const setSettings = (raw: FolderSettingsPatch) => {
    const run = settingsQueue.then(async () => {
      const patch = checkPatch(raw);
      const stored = applyPatch(config!, patch);
      const next = effectiveSettings(stored, obsidian);
      if (stored.newNoteLocation === "folder" && !next.newNoteFolder) {
        throw new SettingsError("newNoteFolder", "required when new notes go to a folder");
      }
      // Before the setting is stored: turning git on fails when it cannot work here.
      if (next.versionHistory !== settings.versionHistory) {
        await useVersionHistory(next.versionHistory, true);
      }
      await saveWorkspaceConfig(folder, stored);
      config = stored;
      const before = settings;
      settings = next;
      if (
        before.attachmentsFolder !== next.attachmentsFolder ||
        JSON.stringify(before.exclude) !== JSON.stringify(next.exclude)
      ) {
        await bridge.setExclusions(next.attachmentsFolder, next.exclude);
      }
      bridge.setLinkFormat(next.linkFormat);
      for (const listener of settingsListeners) listener(next);
      return next;
    });
    settingsQueue = run.catch(() => {});
    return run;
  };

  let closed: Promise<void> | null = null;
  return {
    folder,
    workspaceId: config.workspaceId,
    databasePath,
    store,
    runtime,
    bridge,
    blob: bridge.blob,
    get index() {
      return index ?? NOT_INDEXED;
    },
    indexed,
    gettingStartedId,
    status: () => bridge.status,
    settings: () => settings,
    setSettings,
    onSettings(listener) {
      settingsListeners.add(listener);
      return () => settingsListeners.delete(listener);
    },
    versionHistory: () => versionHistory,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      closed ??= (async () => {
        closing = true;
        await indexed.catch(() => {});
        await bridge.close();
        await versionStore.flush();
        // A last checkpoint of what this session changed.
        await git?.close();
        await store.close();
      })();
      return closed;
    },
  };
}
