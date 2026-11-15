// Device-local storage of document bodies as Yjs updates, so an opened document works offline and
// an edit made offline survives a restart and syncs later. Every update (local and remote) is
// appended; `replace` compacts them into one. `dirty` marks documents with local edits the server
// has not acknowledged yet, so they can be pushed without being opened again.
export type YjsPersistence = {
  // Everything stored for a document, oldest first (apply in order; order does not matter to Yjs).
  load(docId: string): Promise<Uint8Array[]>;
  append(docId: string, update: Uint8Array): Promise<void>;
  // Replaces everything stored for the document with one merged state.
  replace(docId: string, state: Uint8Array): Promise<void>;
  // Forgets the document (access revoked, purged).
  clear(docId: string): Promise<void>;
  setDirty(docId: string, dirty: boolean): Promise<void>;
  // Documents with unacknowledged local edits.
  dirty(): Promise<string[]>;
};

export function createMemoryYjsPersistence(): YjsPersistence & {
  readonly docs: Map<string, Uint8Array[]>;
} {
  const docs = new Map<string, Uint8Array[]>();
  const dirtySet = new Set<string>();
  return {
    docs,
    async load(docId) {
      return [...(docs.get(docId) ?? [])];
    },
    async append(docId, update) {
      const list = docs.get(docId) ?? [];
      list.push(update);
      docs.set(docId, list);
    },
    async replace(docId, state) {
      docs.set(docId, [state]);
    },
    async clear(docId) {
      docs.delete(docId);
      dirtySet.delete(docId);
    },
    async setDirty(docId, dirty) {
      if (dirty) dirtySet.add(docId);
      else dirtySet.delete(docId);
    },
    async dirty() {
      return [...dirtySet];
    },
  };
}

// IndexedDB, for the web app (any browser; OPFS is taken by the SQLite database). One database per
// hosted user: `name` should come from `hostedDatabaseName`.
export function createIndexedDbYjsPersistence(name: string): YjsPersistence {
  let opened: Promise<IDBDatabase> | null = null;
  const open = () =>
    (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`${name}-yjs`, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        const updates = db.createObjectStore("updates", { autoIncrement: true });
        updates.createIndex("doc", "doc");
        db.createObjectStore("dirty");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));

  const done = (tx: IDBTransaction) =>
    new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

  // Deletes the document's rows that exist now, then runs `then` in the same transaction.
  const deleteDoc = (store: IDBObjectStore, docId: string, then?: () => void) => {
    const keys = store.index("doc").getAllKeys(IDBKeyRange.only(docId));
    keys.onsuccess = () => {
      for (const key of keys.result) store.delete(key);
      then?.();
    };
  };

  return {
    async load(docId) {
      const db = await open();
      const tx = db.transaction("updates", "readonly");
      const request = tx.objectStore("updates").index("doc").getAll(IDBKeyRange.only(docId));
      await done(tx);
      return (request.result as Array<{ data: Uint8Array }>).map((row) => row.data);
    },
    async append(docId, update) {
      const db = await open();
      const tx = db.transaction("updates", "readwrite");
      tx.objectStore("updates").add({ doc: docId, data: update });
      await done(tx);
    },
    async replace(docId, state) {
      const db = await open();
      const tx = db.transaction("updates", "readwrite");
      const store = tx.objectStore("updates");
      deleteDoc(store, docId, () => store.add({ doc: docId, data: state }));
      await done(tx);
    },
    async clear(docId) {
      const db = await open();
      const tx = db.transaction(["updates", "dirty"], "readwrite");
      deleteDoc(tx.objectStore("updates"), docId);
      tx.objectStore("dirty").delete(docId);
      await done(tx);
    },
    async setDirty(docId, dirty) {
      const db = await open();
      const tx = db.transaction("dirty", "readwrite");
      if (dirty) tx.objectStore("dirty").put(true, docId);
      else tx.objectStore("dirty").delete(docId);
      await done(tx);
    },
    async dirty() {
      const db = await open();
      const tx = db.transaction("dirty", "readonly");
      const request = tx.objectStore("dirty").getAllKeys();
      await done(tx);
      return (request.result as IDBValidKey[]).map(String);
    },
  };
}
