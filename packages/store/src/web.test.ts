// openWebStore's failure path and readWebDatabaseFiles, outside a browser: @powersync/web is
// replaced by PowerSync's Node driver on a temp file, OPFS by an in-memory directory tree.
import { afterEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PowerSyncDatabase as NodePowerSyncDatabase } from "@powersync/node";

import type { Store } from "./store.ts";
import { rejection } from "./test-utils.ts";

type Plan = "fail" | "open" | "newer";
let plans: Plan[] = [];
const opened: { closed: boolean }[] = [];
const dirs: string[] = [];
const stores: Store[] = [];

// Each `new PowerSyncDatabase()` takes the next plan: a database whose init fails like the
// browser's "disk I/O error", or a real (Node) database.
class FakePowerSyncDatabase {
  constructor(options: { schema: unknown; database: { dbFilename: string } }) {
    const plan = plans.shift() ?? "open";
    if (plan === "open" || plan === "newer") {
      const dir = mkdtempSync(join(tmpdir(), "lydie-web-"));
      dirs.push(dir);
      const db = new NodePowerSyncDatabase({
        schema: options.schema as never,
        database: { dbFilename: options.database.dbFilename, dbLocation: dir },
      });
      if (plan === "newer") {
        const init = db.init.bind(db);
        db.init = async () => {
          await init();
          await db.execute("CREATE TABLE lydie_meta (key TEXT PRIMARY KEY, value TEXT)");
          await db.execute("INSERT INTO lydie_meta VALUES ('schema_version', '999')");
        };
      }
      return db as never;
    }
    const state = { closed: false };
    opened.push(state);
    return {
      schema: options.schema,
      init: async () => {
        throw new Error("disk I/O error");
      },
      close: async () => {
        state.closed = true;
      },
    } as never;
  }
}

mock.module("@powersync/web", () => ({
  PowerSyncDatabase: FakePowerSyncDatabase,
  WASQLiteVFS: { InMemoryVfs: "InMemoryVFS", SimpleOpfsVFS: "SimpleOpfsVFS" },
}));

const { deleteWebDatabaseFiles, openWebStore, readWebDatabaseFiles, WebStoreOpenError } =
  await import("./web.ts");
const { StoreVersionError } = await import("./migrations.ts");

afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  plans = [];
  opened.length = 0;
  localStorage.clear();
});

describe("openWebStore", () => {
  it("retries a failed open", async () => {
    plans = ["fail", "open"];
    const store = await openWebStore({ dbFilename: "a.db", retryDelayMs: 0 });
    stores.push(store);
    expect(opened).toEqual([{ closed: true }]);
    expect(await store.query({ ...noop })).toEqual([{ one: 1 }]);
  });

  it("gives up with a WebStoreOpenError naming the database, after closing every attempt", async () => {
    plans = ["fail", "fail", "fail"];
    const error = await rejection(
      openWebStore({ dbFilename: "b.db", attempts: 3, retryDelayMs: 0 }),
    );
    expect(error).toBeInstanceOf(WebStoreOpenError);
    expect(error).toMatchObject({
      dbFilename: "b.db",
      code: "open_failed",
      message: "disk I/O error",
    });
    expect(opened).toEqual([{ closed: true }, { closed: true }, { closed: true }]);
    // The version marker is only written after a successful open.
    expect(localStorage.getItem("lydie:schema-version:b.db")).toBeNull();
  });

  it("does not retry a database from a newer version", async () => {
    plans = ["newer", "open"];
    const error = await rejection(openWebStore({ dbFilename: "c.db", retryDelayMs: 0 }));
    expect(error).toBeInstanceOf(StoreVersionError);
    expect(plans).toEqual(["open"]);
  });
});

const noop = {
  name: "one",
  sql: "SELECT 1 AS one",
  parameters: [],
  map: (row: Record<string, unknown>) => row,
  key: () => "1",
};

// A minimal OPFS: directories and files by name; NotFoundError like the browser's.
type Tree = { [name: string]: Tree | Uint8Array };
function fakeOpfs(tree: Tree) {
  const created: string[] = [];
  const notFound = () => new DOMException("not found", "NotFoundError");
  const dir = (node: Tree, path: string): unknown => ({
    async getDirectoryHandle(name: string, options?: { create?: boolean }) {
      if (options?.create) created.push(`${path}/${name}`);
      const child = node[name];
      if (!child || child instanceof Uint8Array) throw notFound();
      return dir(child, `${path}/${name}`);
    },
    async getFileHandle(name: string, options?: { create?: boolean }) {
      if (options?.create) created.push(`${path}/${name}`);
      const child = node[name];
      if (!(child instanceof Uint8Array)) throw notFound();
      return { getFile: async () => new File([child as BlobPart], name) };
    },
    async removeEntry(name: string) {
      if (!(name in node)) throw notFound();
      delete node[name];
    },
  });
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: { getDirectory: async () => dir(tree, "") },
  });
  return created;
}

describe("deleteWebDatabaseFiles", () => {
  it("removes that database's files and no other's", async () => {
    const tree: Tree = {
      powersync: {
        "old.db": { database: new Uint8Array([1]), journal: new Uint8Array() },
        "kept.db": { database: new Uint8Array([2]) },
      },
    };
    fakeOpfs(tree);
    await deleteWebDatabaseFiles("old.db");
    expect(Object.keys(tree.powersync as Tree)).toEqual(["kept.db"]);
  });

  it("is fine when there is nothing to remove", async () => {
    fakeOpfs({});
    await deleteWebDatabaseFiles("missing.db");
  });
});

describe("readWebDatabaseFiles", () => {
  it("reads the database and a journal holding an unfinished write, creating nothing", async () => {
    const created = fakeOpfs({
      powersync: {
        "lydie-local.db": { database: new Uint8Array([1, 2, 3]), journal: new Uint8Array([9]) },
      },
    });
    const files = await readWebDatabaseFiles("lydie-local.db");
    expect(new Uint8Array(await files.database!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(files.journal?.size).toBe(1);
    expect(created).toEqual([]);
  });

  it("leaves out an empty journal", async () => {
    fakeOpfs({
      powersync: { "x.db": { database: new Uint8Array([1]), journal: new Uint8Array() } },
    });
    expect((await readWebDatabaseFiles("x.db")).journal).toBeNull();
  });

  it("finds nothing when there is no database", async () => {
    const created = fakeOpfs({});
    expect(await readWebDatabaseFiles("missing.db")).toEqual({ database: null, journal: null });
    expect(created).toEqual([]);
  });
});
