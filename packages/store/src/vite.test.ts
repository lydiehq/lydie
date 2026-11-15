import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { plugin } from "bun";

import { patchSimpleOpfs, powersyncOpfsFix, SIMPLE_OPFS_MODULE } from "./vite.ts";

// The installed module the Vite plugin rewrites.
const MODULE_PATH = join(
  dirname(fileURLToPath(import.meta.resolve("@powersync/web"))),
  "db/adapters/wa-sqlite/SimpleOpfsFileSystem.js",
);
const SOURCE = readFileSync(MODULE_PATH, "utf8");

const SQLITE_OK = 0;
const SQLITE_IOERR_DELETE = 10 | (10 << 8);

// Load the patched module the way a build would see it.
plugin({
  name: "patched SimpleOpfsFileSystem",
  setup(build) {
    build.onLoad({ filter: /SimpleOpfsFileSystem\.js$/ }, ({ path }) => ({
      contents: patchSimpleOpfs(readFileSync(path, "utf8")),
      loader: "js",
    }));
  },
});

type FakeHandle = { name: string; size: number; flushed: number; closed: boolean };

async function openPatchedVfs() {
  const { SimpleOpfsFileSystem } = (await import(MODULE_PATH)) as {
    SimpleOpfsFileSystem: new (
      name: string,
      module: object,
      openRoot: () => Promise<unknown>,
    ) => {
      open(): Promise<void>;
      close(): void;
      jDelete(name: string, syncDir: number): number;
    };
  };
  const handles: FakeHandle[] = [];
  const dir = {
    async getFileHandle(name: string) {
      return {
        async createSyncAccessHandle() {
          const state: FakeHandle = { name, size: 4096, flushed: 0, closed: false };
          handles.push(state);
          return {
            truncate: (size: number) => void (state.size = size),
            flush: () => void state.flushed++,
            close: () => void (state.closed = true),
          };
        },
      };
    },
  };
  const vfs = new SimpleOpfsFileSystem("test.db", {}, async () => ({
    dir,
    readWriteUnsafe: false,
  }));
  await vfs.open();
  return { vfs, handles };
}

describe("powersyncOpfsFix", () => {
  it("applies to the installed @powersync/web", () => {
    const patched = patchSimpleOpfs(SOURCE);
    expect(patched).toContain("Patched by @lydie/store (LYD-279)");
    // Still valid JavaScript.
    expect(() => new Bun.Transpiler({ loader: "js" }).transformSync(patched)).not.toThrow();
  });

  it("rewrites only PowerSync's SimpleOpfsFileSystem module", () => {
    const fix = powersyncOpfsFix();
    expect(fix.transform(SOURCE, `/x/node_modules/${SIMPLE_OPFS_MODULE}?worker_file`)).toContain(
      "LYD-279",
    );
    expect(fix.transform(SOURCE, "/x/node_modules/@powersync/web/lib/index.js")).toBeNull();
  });

  it("fails loudly when PowerSync's code changed", () => {
    expect(() =>
      patchSimpleOpfs(SOURCE.replace("jDelete(name, syncDir)", "jDelete(n, s)")),
    ).toThrow(/changed/);
  });

  it("deletes the journal by truncating it, and still refuses to delete the database", async () => {
    const { vfs, handles } = await openPatchedVfs();
    const [database, journal] = [
      handles.find((h) => h.name === "database")!,
      handles.find((h) => h.name === "journal")!,
    ];
    expect(vfs.jDelete("/database-journal", 0)).toBe(SQLITE_OK);
    expect(journal.size).toBe(0);
    expect(journal.flushed).toBe(1);
    expect(vfs.jDelete("/database", 0)).toBe(SQLITE_IOERR_DELETE);
    expect(database.size).toBe(4096);
    vfs.close();
    // Closed: no handles to truncate, so the original answer.
    expect(vfs.jDelete("/database-journal", 0)).toBe(SQLITE_IOERR_DELETE);
  });
});
