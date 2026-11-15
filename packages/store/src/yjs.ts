// Device-local Yjs persistence in the database (yjs_updates, yjs_snapshots), so offline edits to
// collaborative bodies survive a restart and sync later, on every driver (Node and web). Same shape
// as @lydie/sync's YjsPersistence: every update is appended; `replace` compacts them into one
// snapshot; `dirty` lists documents with edits the server has not acknowledged.
import type { CommonPowerSyncDatabase } from "@powersync/common";

export type YjsStore = {
  // Everything stored for a document: the snapshot first, then updates (order does not matter to Yjs).
  load(docId: string): Promise<Uint8Array[]>;
  append(docId: string, update: Uint8Array): Promise<void>;
  // Replaces everything stored for the document with one merged state (keeps the dirty flag).
  replace(docId: string, state: Uint8Array): Promise<void>;
  // Forgets the document (access revoked, purged).
  clear(docId: string): Promise<void>;
  setDirty(docId: string, dirty: boolean): Promise<void>;
  dirty(): Promise<string[]>;
};

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function createYjsStore(db: CommonPowerSyncDatabase): YjsStore {
  // Insertion order for updates within one millisecond.
  let seq = 0;
  const now = () => new Date().toISOString();
  return {
    async load(docId) {
      const snapshot = await db.getOptional<{ state: string | null }>(
        "SELECT state FROM yjs_snapshots WHERE id = ?",
        [docId],
      );
      const updates = await db.getAll<{ data: string }>(
        "SELECT data FROM yjs_updates WHERE doc_id = ? ORDER BY created_at, id",
        [docId],
      );
      return [
        ...(snapshot?.state ? [fromBase64(snapshot.state)] : []),
        ...updates.map((u) => fromBase64(u.data)),
      ];
    },
    async append(docId, update) {
      const at = now();
      const id = `${at}-${String(seq++ % 1e6).padStart(6, "0")}-${Math.random().toString(36).slice(2, 8)}`;
      await db.execute(
        "INSERT INTO yjs_updates (id, doc_id, data, created_at) VALUES (?, ?, ?, ?)",
        [id, docId, toBase64(update), at],
      );
    },
    async replace(docId, state) {
      await db.writeTransaction(async (tx) => {
        await tx.execute("DELETE FROM yjs_updates WHERE doc_id = ?", [docId]);
        const existing = await tx.getOptional<{ dirty: number | null }>(
          "SELECT dirty FROM yjs_snapshots WHERE id = ?",
          [docId],
        );
        if (existing) {
          await tx.execute("UPDATE yjs_snapshots SET state = ?, updated_at = ? WHERE id = ?", [
            toBase64(state),
            now(),
            docId,
          ]);
        } else {
          await tx.execute(
            "INSERT INTO yjs_snapshots (id, state, dirty, updated_at) VALUES (?, ?, 0, ?)",
            [docId, toBase64(state), now()],
          );
        }
      });
    },
    async clear(docId) {
      await db.writeTransaction(async (tx) => {
        await tx.execute("DELETE FROM yjs_updates WHERE doc_id = ?", [docId]);
        await tx.execute("DELETE FROM yjs_snapshots WHERE id = ?", [docId]);
      });
    },
    async setDirty(docId, dirty) {
      await db.writeTransaction(async (tx) => {
        const existing = await tx.getOptional("SELECT 1 FROM yjs_snapshots WHERE id = ?", [docId]);
        if (existing) {
          await tx.execute("UPDATE yjs_snapshots SET dirty = ?, updated_at = ? WHERE id = ?", [
            dirty ? 1 : 0,
            now(),
            docId,
          ]);
        } else if (dirty) {
          await tx.execute(
            "INSERT INTO yjs_snapshots (id, state, dirty, updated_at) VALUES (?, NULL, 1, ?)",
            [docId, now()],
          );
        }
      });
    },
    async dirty() {
      const rows = await db.getAll<{ id: string }>(
        "SELECT id FROM yjs_snapshots WHERE dirty = 1 ORDER BY id",
      );
      return rows.map((r) => r.id);
    },
  };
}
