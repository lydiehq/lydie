// Web driver: SQLite (wa-sqlite WASM) in a worker, stored in OPFS.
//
// With the default `vfs: "auto"`, PowerSync uses its SimpleOpfsVFS: the database is two OPFS files,
// `powersync/<dbFilename>/database` and `.../journal` (rollback journal, `journal_mode = TRUNCATE`),
// held open with sync access handles by one worker (nested in a shared worker where the browser
// allows it). Apps that bundle this must add `powersyncOpfsFix()` from `@lydie/store/vite`: without
// it a write that was interrupted (tab killed, disk full) makes every later open fail (LYD-279).
import { PowerSyncDatabase, WASQLiteVFS } from "@powersync/web";

import { assertOpenable, SCHEMA_VERSION, StoreVersionError } from "./migrations.ts";
import { createSchema } from "./schema.ts";
import type { StoreMode } from "./schema.ts";
import { createStore } from "./store.ts";
import type { CreateStoreOptions, Store } from "./store.ts";

export type WebStoreOptions = CreateStoreOptions & {
  // Name of the database in OPFS; use one per workspace.
  dbFilename: string;
  mode?: StoreMode;
  // Defaults to "auto": OPFS when available, otherwise an in-memory database.
  // Safari-first deployments may want WASQLiteVFS.OPFSCoopSyncVFS (plan §1).
  vfs?: WASQLiteVFS | "auto";
  // Opens tried before giving up (default 2), `retryDelayMs` apart (default 1000). PowerSync's
  // worker also retries its own open three times.
  attempts?: number;
  retryDelayMs?: number;
};

export type WebStore = Store & {
  // false when OPFS is unavailable (e.g. some private browsing modes) and the database lives in
  // memory only. The app must tell the user instead of silently losing notes.
  readonly persistent: boolean;
};

export { WASQLiteVFS };

// The database exists (or may exist) but could not be opened. Nothing was deleted or reset: the
// app should offer `readWebDatabaseFiles(dbFilename)` before anything else.
export class WebStoreOpenError extends Error {
  readonly code = "open_failed";
  constructor(
    readonly dbFilename: string,
    override readonly cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "WebStoreOpenError";
  }
}

// The schema version of each OPFS database, kept outside it so it can be checked before PowerSync
// opens the file (applying an older schema would drop local-only tables it does not know).
const versionKey = (dbFilename: string) => `lydie:schema-version:${dbFilename}`;

export async function openWebStore(options: WebStoreOptions): Promise<WebStore> {
  const memory = options.vfs === WASQLiteVFS.InMemoryVfs;
  // An in-memory database starts empty every time: there is no older or newer file to check.
  const storage = memory || typeof localStorage === "undefined" ? null : localStorage;
  assertOpenable(Number(storage?.getItem(versionKey(options.dbFilename)) ?? 0));
  const persistent = memory ? false : await hasOpfs();
  const attempts = Math.max(1, options.attempts ?? 2);
  let failure: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const db = new PowerSyncDatabase({
      schema: createSchema(options.mode ?? "local"),
      database: { dbFilename: options.dbFilename, vfs: options.vfs ?? "auto" },
    });
    try {
      const store = await createStore(db, options);
      storage?.setItem(versionKey(options.dbFilename), String(SCHEMA_VERSION));
      return Object.assign(store, { persistent });
    } catch (error) {
      // Closing releases the worker's file handles; it never deletes or rewrites the files.
      await db.close().catch(() => {});
      if (error instanceof StoreVersionError) throw error;
      failure = error;
      if (attempt < attempts) await sleep(options.retryDelayMs ?? 1000);
    }
  }
  throw new WebStoreOpenError(options.dbFilename, failure);
}

export type WebDatabaseFiles = {
  // The SQLite database file, or null when there is none.
  database: File | null;
  // The rollback journal when it holds an unfinished write (non-empty), else null. Keep it next to
  // the database as `<name>-journal`: SQLite then rolls the unfinished write back when it opens it.
  journal: File | null;
};

// Reads the raw files of a database opened with the default VFS ("auto", SimpleOpfsVFS), to save
// a copy when it cannot be opened. Read-only. Fails while another tab holds the database open.
export async function readWebDatabaseFiles(dbFilename: string): Promise<WebDatabaseFiles> {
  let dir = await navigator.storage.getDirectory();
  // PowerSync's layout (SimpleOpfsFileSystem.directoryResolver), without creating anything.
  for (const segment of ["powersync", ...new URL(dbFilename, "file://").pathname.split("/")]) {
    if (!segment) continue;
    try {
      dir = await dir.getDirectoryHandle(segment);
    } catch (error) {
      if (isNotFound(error)) return { database: null, journal: null };
      throw error;
    }
  }
  const read = async (name: string): Promise<File | null> => {
    try {
      return await (await dir.getFileHandle(name)).getFile();
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  };
  const [database, journal] = await Promise.all([read("database"), read("journal")]);
  return { database, journal: journal && journal.size > 0 ? journal : null };
}

// Removes a database's files (the default VFS) and its recorded schema version. For a database
// nothing has open: it fails while this tab or another one holds it. Nothing to remove is fine.
export async function deleteWebDatabaseFiles(dbFilename: string): Promise<void> {
  let dir = await navigator.storage.getDirectory();
  const segments = ["powersync", ...new URL(dbFilename, "file://").pathname.split("/")].filter(
    Boolean,
  );
  const name = segments.pop()!;
  try {
    for (const segment of segments) dir = await dir.getDirectoryHandle(segment);
    await dir.removeEntry(name, { recursive: true });
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  if (typeof localStorage !== "undefined") localStorage.removeItem(versionKey(dbFilename));
}

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function hasOpfs(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) return false;
    await navigator.storage.getDirectory();
    return true;
  } catch {
    return false;
  }
}
