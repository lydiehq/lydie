// Snapshot version history on disk: the `VersionStore` behind @lydie/runtime's
// `createSnapshotVersions` for a folder. It lives beside the folder's database, outside the
// folder, so snapshots never show up as notes, are not synced by iCloud or Dropbox, and survive a
// rebuild of the database:
//
//   <dir>/<document id>.json              { version: 1, records: VersionRecord[] } oldest first
//   <dir>/<document id>/<version id>.md   the body of one version
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { isUuid, ulidFromUuid, uuidsForUlids } from "@lydie/contract";
import type { VersionRecord, VersionStore } from "@lydie/runtime";

import { atomicWrite, isMissing } from "./fs.ts";

const SAFE_ID = /^[0-9A-Za-z_-]{1,64}$/;

function safe(id: string): string {
  if (!SAFE_ID.test(id)) throw new Error(`Not a valid id: ${id}`);
  return id;
}

// Snapshots taken before ids were UUIDs are filed under the ULID spelling of the same id. They
// are read from there; whatever is written goes under the UUID.
function older(id: string): string | null {
  return isUuid(id) ? ulidFromUuid(id) : null;
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

export function createFileVersionStore(dir: string): VersionStore {
  // The lists of documents read or written this session; the files are only ours.
  const cache = new Map<string, VersionRecord[]>();

  async function load(documentId: string): Promise<VersionRecord[]> {
    const cached = cache.get(documentId);
    if (cached) return cached;
    let records: VersionRecord[] = [];
    try {
      const was = older(documentId);
      const text =
        (await readText(join(dir, `${safe(documentId)}.json`))) ??
        (was ? await readText(join(dir, `${was}.json`)) : null);
      const parsed: unknown = text === null ? null : JSON.parse(uuidsForUlids(text));
      const list = (parsed as { records?: unknown } | null)?.records;
      if (Array.isArray(list)) records = list as VersionRecord[];
    } catch (error) {
      // No file: no versions yet. A damaged file: start over rather than fail every save.
      if (!isMissing(error) && !(error instanceof SyntaxError)) throw error;
    }
    cache.set(documentId, records);
    return records;
  }

  return {
    async list(documentId) {
      return [...(await load(documentId))];
    },

    async read(documentId, versionId) {
      const text = await readText(join(dir, safe(documentId), `${safe(versionId)}.md`));
      const was = [older(documentId), older(versionId)];
      if (text !== null || !was[0] || !was[1]) return text;
      return readText(join(dir, was[0], `${was[1]}.md`));
    },

    async save(documentId, records, contents) {
      const before = await load(documentId);
      const kept = new Set(records.map((r) => r.id));
      const folder = join(dir, safe(documentId));
      // Texts first, then the list that names them: a crash in between leaves a text nobody
      // lists, never a listed version without its text.
      for (const [id, text] of Object.entries(contents)) {
        if (kept.has(id)) await atomicWrite(join(folder, `${safe(id)}.md`), text);
      }
      const index = join(dir, `${safe(documentId)}.json`);
      if (records.length === 0) {
        await rm(index, { force: true });
        await rm(folder, { recursive: true, force: true });
        const was = older(documentId);
        if (was) {
          await rm(join(dir, `${was}.json`), { force: true });
          await rm(join(dir, was), { recursive: true, force: true });
        }
        cache.delete(documentId);
        return;
      }
      await atomicWrite(index, `${JSON.stringify({ version: 1, records })}\n`);
      cache.set(documentId, [...records]);
      for (const old of before) {
        if (!kept.has(old.id)) await rm(join(folder, `${safe(old.id)}.md`), { force: true });
      }
    },
  };
}
