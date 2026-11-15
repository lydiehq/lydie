// Node entry (Electron main, CLI, tests): file-backed Yjs persistence.
import { appendFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { YjsPersistence } from "./collab/persistence.ts";

// One append-only file per document (`<dir>/<docId>.yupd`: 4-byte big-endian length + update,
// repeated), compacted by rewriting atomically. A torn last record (crash mid-append) is ignored
// on load; Yjs updates are idempotent, so nothing else can go wrong.
export function createFileYjsPersistence(dir: string): YjsPersistence {
  const fileOf = (docId: string) => {
    if (!/^[0-9A-Za-z_-]{1,128}$/.test(docId)) throw new Error(`Invalid document id "${docId}"`);
    return join(dir, `${docId}.yupd`);
  };
  const dirtyFile = join(dir, "dirty.json");
  let ready: Promise<unknown> | null = null;
  const ensureDir = () => (ready ??= mkdir(dir, { recursive: true }));
  let dirtyCache: Set<string> | null = null;
  let dirtyWrite: Promise<void> = Promise.resolve();

  const frame = (update: Uint8Array) => {
    const out = new Uint8Array(4 + update.byteLength);
    new DataView(out.buffer).setUint32(0, update.byteLength);
    out.set(update, 4);
    return out;
  };

  async function readDirty(): Promise<Set<string>> {
    if (dirtyCache) return dirtyCache;
    try {
      dirtyCache = new Set(JSON.parse(await readFile(dirtyFile, "utf8")) as string[]);
    } catch {
      dirtyCache = new Set();
    }
    return dirtyCache;
  }

  async function atomicWrite(path: string, data: Uint8Array | string) {
    await ensureDir();
    const temp = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(temp, data);
    await rename(temp, path);
  }

  return {
    async load(docId) {
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await readFile(fileOf(docId)));
      } catch {
        return [];
      }
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const out: Uint8Array[] = [];
      for (let offset = 0; offset + 4 <= bytes.byteLength;) {
        const length = view.getUint32(offset);
        if (offset + 4 + length > bytes.byteLength) break;
        out.push(bytes.slice(offset + 4, offset + 4 + length));
        offset += 4 + length;
      }
      return out;
    },
    async append(docId, update) {
      await ensureDir();
      await appendFile(fileOf(docId), frame(update));
    },
    async replace(docId, state) {
      await atomicWrite(fileOf(docId), frame(state));
    },
    async clear(docId) {
      await rm(fileOf(docId), { force: true });
      await this.setDirty(docId, false);
    },
    async setDirty(docId, dirty) {
      const set = await readDirty();
      if (set.has(docId) === dirty) return;
      if (dirty) set.add(docId);
      else set.delete(docId);
      const snapshot = JSON.stringify([...set]);
      dirtyWrite = dirtyWrite.then(() => atomicWrite(dirtyFile, snapshot)).catch(() => {});
      await dirtyWrite;
    },
    async dirty() {
      return [...(await readDirty())];
    },
  };
}
