// The ambient types for better-sqlite3 must also reach programs that import this file from outside the
// package (client/scripts), and a .d.ts cannot be imported.
// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="./better-sqlite3.d.ts" />
// Node driver: Electron main, CLI, local MCP server and tests. Uses better-sqlite3 in a worker thread.
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { Worker } from "node:worker_threads";

import type { Blob } from "@lydie/runtime";
import { PowerSyncDatabase } from "@powersync/node";
import Database from "better-sqlite3";

import { assertOpenable } from "./migrations.ts";
import { createSchema } from "./schema.ts";
import type { StoreMode } from "./schema.ts";
import { createStore } from "./store.ts";
import type { CreateStoreOptions, Store } from "./store.ts";

export type NodeStoreOptions = CreateStoreOptions & {
  // Database file, e.g. `<app data>/workspaces/<vault-id>.sqlite`. Keep it outside the vault.
  path: string;
  mode?: StoreMode;
  // Where PowerSync's worker script is loaded from. The worker resolves PowerSync's SQLite extension
  // next to itself and dlopens it, which cannot read inside an Electron asar archive: packaged apps
  // pass `unpackedAsar` so the worker (and with it the extension) runs from `app.asar.unpacked`.
  workerUrl?: (url: URL) => URL;
  // Read connections (PowerSync workers). Tests use 1 to behave like the browser, where every
  // read shares one connection: a read started inside another read's transaction never runs.
  readWorkers?: number;
};

// Maps a file inside `app.asar` to its copy in `app.asar.unpacked` (electron-builder `asarUnpack`).
// Other URLs are returned unchanged.
export function unpackedAsar(url: URL): URL {
  return new URL(url.href.replace(/\/app\.asar\//, "/app.asar.unpacked/"));
}

// The schema version a database file records, read without PowerSync: opening a newer database
// with PowerSync would first apply this version's schema, which drops local-only tables it does
// not know. 0 for a new or pre-versioning file.
export function readSchemaVersion(path: string): number {
  if (!existsSync(path)) return 0;
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const row = db.prepare("SELECT value FROM lydie_meta WHERE key = 'schema_version'").get() as
      | { value: string }
      | undefined;
    return row ? Number(row.value) : 0;
  } catch {
    return 0;
  } finally {
    db.close();
  }
}

export async function openNodeStore(options: NodeStoreOptions): Promise<Store> {
  const path = resolve(options.path);
  assertOpenable(readSchemaVersion(path));
  const db = new PowerSyncDatabase({
    schema: createSchema(options.mode ?? "local"),
    database: {
      dbFilename: basename(path),
      dbLocation: dirname(path),
      ...(options.readWorkers !== undefined ? { readWorkerCount: options.readWorkers } : {}),
      ...(options.workerUrl
        ? {
            openWorker: (
              url: string | URL,
              workerOptions?: ConstructorParameters<typeof Worker>[1],
            ) => new Worker(options.workerUrl!(new URL(url)), workerOptions),
          }
        : {}),
    },
  });
  try {
    return await createStore(db, options);
  } catch (error) {
    await db.close();
    throw error;
  }
}

// Content-addressed bytes in a directory (`<dir>/<ab>/<sha256>`), written atomically. For the
// desktop app's attachment cache and for tests; the file bridge stores vault attachments itself.
export function createDirectoryBlob(dir: string): Blob {
  const pathOf = (key: string) => {
    if (!/^[0-9a-zA-Z_-]{8,128}$/.test(key)) throw new Error(`Invalid blob key "${key}"`);
    return join(dir, key.slice(0, 2), key);
  };
  return {
    async put(key, data) {
      const target = pathOf(key);
      await mkdir(dirname(target), { recursive: true });
      const temp = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
      await writeFile(temp, data);
      await rename(temp, target);
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(pathOf(key)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async delete(key) {
      await rm(pathOf(key), { force: true });
    },
    async has(key) {
      try {
        return (await stat(pathOf(key))).isFile();
      } catch {
        return false;
      }
    },
  };
}
