// Build-time fix for @powersync/web's SimpleOpfsVFS, the OPFS file system `openWebStore` uses
// (LYD-279). Add `powersyncOpfsFix()` to a Vite config's `plugins` and `worker.plugins`.
//
// SQLite rolls back an interrupted write transaction (a hot journal: the tab or browser was killed
// mid-write, or a write failed because the disk was full) when it next opens the database. It runs
// that rollback before PowerSync switches the connection to `journal_mode = TRUNCATE`, so it ends
// by deleting the journal, and SimpleOpfsVFS answers every delete of its two files with
// SQLITE_IOERR_DELETE. Every open then fails with "disk I/O error", for good. The fix makes deleting
// the journal truncate it instead: an empty journal is what TRUNCATE mode leaves, and SQLite never
// treats an empty journal as hot.
//
// The patch matches PowerSync's source exactly and fails the build when it does not, so an upgrade
// cannot silently drop it. Remove it once PowerSync handles this itself.

// The part of Vite's Plugin type this uses (the store does not depend on Vite).
export type SourcePatchPlugin = {
  name: string;
  enforce: "pre";
  transform(code: string, id: string): string | null;
};

export const SIMPLE_OPFS_MODULE =
  "@powersync/web/lib/db/adapters/wa-sqlite/SimpleOpfsFileSystem.js";

const MARKER = "    jDelete(name, syncDir) {\n";
const FIELD = "    #files = null;\n";

const PATCH = `        // Patched by @lydie/store (LYD-279): delete the journal by truncating it.
        if (name === '/database-journal' && this.#files != null) {
            try {
                const journal = this.#files.files[1];
                journal.truncate(0);
                journal.flush();
                return VFS.SQLITE_OK;
            }
            catch (e) {
                console.error('OPFS VFS error', e);
                return VFS.SQLITE_IOERR_DELETE;
            }
        }
`;

// Returns the patched module source. Throws when PowerSync's code no longer has the shape the
// patch was written for.
export function patchSimpleOpfs(code: string): string {
  if (
    !code.includes(MARKER) ||
    !code.includes(FIELD) ||
    !code.includes("VFS.SQLITE_IOERR_DELETE")
  ) {
    throw new Error(
      `@lydie/store: ${SIMPLE_OPFS_MODULE} changed; check whether PowerSync now deletes the journal ` +
        "itself (LYD-279) and update or remove the patch in packages/store/src/vite.ts",
    );
  }
  return code.replace(MARKER, MARKER + PATCH);
}

export function powersyncOpfsFix(): SourcePatchPlugin {
  return {
    name: "lydie-powersync-opfs-fix",
    enforce: "pre",
    transform(code, id) {
      if (!id.split("?")[0]!.replaceAll("\\", "/").endsWith(SIMPLE_OPFS_MODULE)) return null;
      return patchSimpleOpfs(code);
    },
  };
}
