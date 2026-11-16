// Snapshot version history on disk: the `VersionStore` behind @lydie/runtime's
// `createSnapshotVersions` for a folder. It lives beside the folder's database, outside the
// folder, so snapshots never show up as notes, are not synced by iCloud or Dropbox, and survive a
// rebuild of the database:
//
//   <dir>/<document id>.json              { version: 1, records: VersionRecord[] } oldest first
//   <dir>/<document id>/<version id>.md   the body of one version
//
// Every body save records a version (the newest one follows the body while one author keeps
// editing), so a document's files would be rewritten on every typing pause. A save is written at
// once when the document's files were not written in the last `delayMs`; later ones are kept in
// memory and written together every `delayMs` (and on `flush`, which closing the vault calls). A
// crash loses at most those: the note itself is in the folder, and its next save records it as
// `before_write`.
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

export type FileVersionStore = VersionStore & {
  // Writes what is waiting.
  flush(): Promise<void>;
};

export type FileVersionStoreOptions = {
  // How long saves of one document after a write are collected before the next. Default 30 s.
  delayMs?: number;
  onError?: (error: unknown) => void;
};

// What a document's files are to become: its list, and texts not written yet (by version id).
type Unwritten = { records: readonly VersionRecord[]; contents: Map<string, string> };

export function createFileVersionStore(
  dir: string,
  options: FileVersionStoreOptions = {},
): FileVersionStore {
  const delayMs = options.delayMs ?? 30_000;
  const onError = options.onError ?? ((error: unknown) => console.error("[versions]", error));
  // The lists of documents read or written this session; the files are only ours.
  const cache = new Map<string, VersionRecord[]>();
  // Ids of each document's version texts on disk, as its last written list names them.
  const onDisk = new Map<string, Set<string>>();
  const unwritten = new Map<string, Unwritten>();
  // Documents written in the last `delayMs`: their next write waits for the timer.
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  // One write at a time per document.
  const writes = new Map<string, Promise<void>>();

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
    if (!onDisk.has(documentId)) onDisk.set(documentId, new Set(records.map((r) => r.id)));
    return records;
  }

  function serial(documentId: string, fn: () => Promise<void>): Promise<void> {
    const run = (writes.get(documentId) ?? Promise.resolve()).then(fn);
    const tail = run.catch(() => {});
    writes.set(documentId, tail);
    void tail.then(() => {
      if (writes.get(documentId) === tail) writes.delete(documentId);
    });
    return run;
  }

  // Texts first, then the list that names them: a crash in between leaves a text nobody lists,
  // never a listed version without its text. Then texts no longer listed go.
  function write(documentId: string): Promise<void> {
    return serial(documentId, async () => {
      const next = unwritten.get(documentId);
      if (!next) return;
      unwritten.delete(documentId);
      const folder = join(dir, safe(documentId));
      const kept = new Set(next.records.map((r) => r.id));
      for (const [id, text] of next.contents) {
        if (kept.has(id)) await atomicWrite(join(folder, `${safe(id)}.md`), text);
      }
      await atomicWrite(
        join(dir, `${safe(documentId)}.json`),
        `${JSON.stringify({ version: 1, records: next.records })}\n`,
      );
      const before = onDisk.get(documentId) ?? new Set<string>();
      onDisk.set(documentId, kept);
      for (const id of before) {
        if (!kept.has(id)) await rm(join(folder, `${safe(id)}.md`), { force: true });
      }
    });
  }

  function schedule(documentId: string): void {
    const timer = setTimeout(() => {
      timers.delete(documentId);
      if (!unwritten.has(documentId)) return;
      // Still being edited: the saves to come wait for the next round too.
      schedule(documentId);
      write(documentId).catch(onError);
    }, delayMs);
    (timer as { unref?: () => void }).unref?.();
    timers.set(documentId, timer);
  }

  return {
    async list(documentId) {
      return [...(await load(documentId))];
    },

    async read(documentId, versionId) {
      const waiting = unwritten.get(documentId)?.contents.get(versionId);
      if (waiting !== undefined) return waiting;
      const text = await readText(join(dir, safe(documentId), `${safe(versionId)}.md`));
      const was = [older(documentId), older(versionId)];
      if (text !== null || !was[0] || !was[1]) return text;
      return readText(join(dir, was[0], `${was[1]}.md`));
    },

    async save(documentId, records, contents) {
      await load(documentId);
      const folder = join(dir, safe(documentId));
      if (records.length === 0) {
        clearTimeout(timers.get(documentId));
        timers.delete(documentId);
        unwritten.delete(documentId);
        await serial(documentId, async () => {
          await rm(join(dir, `${safe(documentId)}.json`), { force: true });
          await rm(folder, { recursive: true, force: true });
          const was = older(documentId);
          if (was) {
            await rm(join(dir, `${was}.json`), { force: true });
            await rm(join(dir, was), { recursive: true, force: true });
          }
        });
        cache.delete(documentId);
        onDisk.delete(documentId);
        return;
      }
      const kept = new Set(records.map((r) => r.id));
      const texts = unwritten.get(documentId)?.contents ?? new Map<string, string>();
      for (const id of texts.keys()) if (!kept.has(id)) texts.delete(id);
      for (const [id, text] of Object.entries(contents)) if (kept.has(id)) texts.set(id, text);
      unwritten.set(documentId, { records: [...records], contents: texts });
      cache.set(documentId, [...records]);
      if (timers.has(documentId)) return;
      schedule(documentId);
      await write(documentId);
    },

    async flush() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      await Promise.all([...unwritten.keys()].map((id) => write(id)));
      await Promise.all([...writes.values()]);
    },
  };
}
