import { afterEach, describe, expect, it } from "bun:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { uuidFromUlid } from "@lydie/contract";
import { createRuntime } from "@lydie/runtime";
import { PowerSyncDatabase } from "@powersync/node";
import Database from "better-sqlite3";

import { migrate, MIGRATIONS, SCHEMA_VERSION, StoreVersionError } from "./migrations.ts";
import type { Migration } from "./migrations.ts";
import { openNodeStore, readSchemaVersion } from "./node.ts";
import { createSchema } from "./schema.ts";
import type { Store } from "./store.ts";
import { rejection } from "./test-utils.ts";

const FIXTURE_V1 = join(import.meta.dir, "migrations", "fixtures", "v1.sqlite");
const dirs: string[] = [];
const stores: Store[] = [];

afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "lydie-migrate-"));
  dirs.push(dir);
  return join(dir, "workspace.sqlite");
}

async function open(path: string): Promise<Store> {
  const store = await openNodeStore({ path });
  stores.push(store);
  return store;
}

describe("migrations", () => {
  it("are numbered 1..n", () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual(
      Array.from({ length: SCHEMA_VERSION }, (_, i) => i + 1),
    );
  });

  it("upgrade a database written by the first schema", async () => {
    const path = tempPath();
    copyFileSync(FIXTURE_V1, path);
    expect(readSchemaVersion(path)).toBe(0);
    const store = await open(path);
    expect(readSchemaVersion(path)).toBe(SCHEMA_VERSION);

    // Existing rows survive, including bodies, properties and the soft-deleted document.
    const tree = await store.listTree("ws1", { includeDeleted: true });
    expect(tree.map((e) => [e.title, e.depth, e.deletedAt !== null])).toEqual([
      ["Alpha", 0, false],
      ["Beta", 1, false],
      ["Deleted", 0, true],
    ]);
    expect(tree[1]?.properties).toEqual({ status: "done" });
    // Ids written as ULIDs are UUIDs now, the same bits: the tree and the links still hold.
    expect(tree.map((e) => e.id)).toEqual(
      [
        "01JCZ6Y8M4Q1W2E3R4T5Y6V7A1",
        "01JCZ6Y8M4Q1W2E3R4T5Y6V7B1",
        "01JCZ6Y8M4Q1W2E3R4T5Y6V7C1",
      ].map(uuidFromUlid),
    );
    expect(tree[1]?.parentId).toBe(tree[0]!.id);
    expect(tree[0]?.createdBy).toBeNull();
    expect((await store.getDoc(tree[0]!.id))?.body?.markdown).toContain("[[Beta]]");

    // Old link kinds were split into kind + syntax.
    const backlinks = await store.backlinks(tree[1]!.id);
    expect(backlinks.map((b) => [b.kind, b.syntax, b.targetRef])).toEqual([
      ["link", "wikilink", "Beta"],
      ["link", "markdown", "Beta.md"],
    ]);
    const raw = await store.db.getAll<{ kind: string; syntax: string }>(
      "SELECT kind, syntax FROM links ORDER BY target_ref",
    );
    expect(raw).toEqual([
      { kind: "link", syntax: "wikilink" },
      { kind: "link", syntax: "markdown" },
      { kind: "embed", syntax: "wikilink" },
    ]);

    // Derived tables were rebuilt and the new device tables exist and work.
    expect((await store.search("ws1", "beta")).length).toBeGreaterThan(0);
    const runtime = createRuntime({ ...store.ports, actor: { type: "user", id: "u1" } });
    await runtime.ops.doc.rename({ id: tree[1]!.id, title: "Gamma" });
    expect((await store.backlinks(tree[0]!.id)).length).toBe(0);
    const { sessions } = await runtime.ops.history.listSessions({});
    expect(sessions).toEqual([]);
    expect(await store.db.getAll("SELECT id FROM op_history")).toHaveLength(1);
    expect(await store.db.getAll("SELECT type FROM activity")).toEqual([{ type: "doc.renamed" }]);
    // The dangling ![[Gamma]] embed resolves to the renamed document.
    expect((await store.backlinks(tree[1]!.id)).map((b) => b.kind)).toContain("embed");
  });

  it("are a no-op on an up-to-date database", async () => {
    const path = tempPath();
    const store = await open(path);
    expect(await migrate(store.db)).toEqual({ from: SCHEMA_VERSION, to: SCHEMA_VERSION });
  });

  it("drop the removed notifications inbox's marks (version 7)", async () => {
    const path = tempPath();
    const store = await open(path);
    await store.db.writeTransaction(async (tx) => {
      await MIGRATIONS.find((m) => m.version === 5)!.up(tx, {
        mode: "local",
        internal: () => "",
      });
      await tx.execute("UPDATE lydie_meta SET value = '6' WHERE key = 'schema_version'");
    });
    expect(await migrate(store.db)).toEqual({ from: 6, to: SCHEMA_VERSION });
    expect(
      await store.db.getAll("SELECT name FROM sqlite_master WHERE name = 'notification_marks'"),
    ).toEqual([]);
  });

  it("let an up-to-date database open without writing to it (a full disk still opens)", async () => {
    const path = tempPath();
    await open(path);
    await stores.pop()!.close();
    // data_version changes for this connection whenever another one commits a change.
    const observer = new Database(path);
    const version = () => observer.prepare("PRAGMA data_version").get();
    const before = version();
    await open(path);
    expect(version()).toEqual(before);
    observer.close();
  });

  it("are idempotent: running each one twice is harmless", async () => {
    const path = tempPath();
    copyFileSync(FIXTURE_V1, path);
    const store = await open(path);
    const ctx = {
      mode: "local" as const,
      internal: (t: string) => store.db.schema.tables.find((x) => x.name === t)!.internalName,
    };
    await store.db.writeTransaction(async (tx) => {
      for (const m of MIGRATIONS) await m.up(tx, ctx);
    });
    expect((await store.backlinks((await store.listTree("ws1"))[1]!.id)).length).toBe(2);
  });

  it("roll back completely when one fails", async () => {
    const path = tempPath();
    const store = await open(path);
    const next = SCHEMA_VERSION + 1;
    const failing: Migration[] = [
      ...MIGRATIONS,
      {
        version: next,
        name: "creates a table, then fails",
        async up(tx) {
          await tx.execute("CREATE TABLE half_done (x)");
          throw new Error("boom");
        },
      },
    ];
    expect(String(await rejection(migrate(store.db, failing)))).toContain("boom");
    expect(
      await store.db.getOptional("SELECT 1 FROM sqlite_master WHERE name = 'half_done'"),
    ).toBeNull();
    expect(readSchemaVersion(path)).toBe(SCHEMA_VERSION);
  });

  it("refuse a database written by a newer version, before PowerSync touches it", async () => {
    const path = tempPath();
    const store = await open(path);
    await store.db.execute("CREATE TABLE future_device_table (x)");
    await store.db.execute("UPDATE lydie_meta SET value = '999' WHERE key = 'schema_version'");
    await stores.pop()!.close();

    const error = await rejection(openNodeStore({ path }));
    expect(error).toBeInstanceOf(StoreVersionError);
    expect(error).toMatchObject({ code: "newer_database", found: 999, supported: SCHEMA_VERSION });
    const raw = new Database(path, { readonly: true });
    expect(
      raw
        .prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'future_device_table'")
        .get(),
    ).toEqual({ n: 1 });
    raw.close();

    // The in-transaction check catches it too (e.g. on the web, if the version marker was lost).
    const db = new PowerSyncDatabase({
      schema: createSchema("local"),
      database: { dbFilename: "workspace.sqlite", dbLocation: join(path, "..") },
    });
    try {
      await db.init();
      expect(await rejection(migrate(db))).toBeInstanceOf(StoreVersionError);
    } finally {
      await db.close();
    }
  });
});
