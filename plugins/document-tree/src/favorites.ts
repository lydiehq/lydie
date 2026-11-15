import type { AppApi, Backend, Document } from "@lydie/plugin-api";

// Favorites are kept per device and workspace (like the expanded folders), in the order they
// were added.
export type Favorites = {
  ids: () => readonly string[];
  subscribe: (listener: () => void) => () => void;
  has: (id: string) => boolean;
  // Returns whether the document is a favorite afterwards.
  toggle: (id: string) => boolean;
};

const stores = new WeakMap<AppApi, Favorites>();

export function favoritesOf(app: AppApi): Favorites {
  const known = stores.get(app);
  if (known) return known;
  const key = `document-tree:favorites:${app.backend.info.workspaceId}`;
  const read = (): readonly string[] => {
    const stored = app.storage.get<unknown>(key);
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
  };
  let ids = read();
  const listeners = new Set<() => void>();
  const changed = () => {
    ids = read();
    for (const listener of [...listeners]) listener();
  };
  // For the lifetime of the app: the store is.
  const watched = app.storage.subscribe?.(key, changed) !== undefined;
  const favorites: Favorites = {
    ids: () => ids,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    has: (id) => ids.includes(id),
    toggle(id) {
      const on = !ids.includes(id);
      app.storage.set(key, on ? [...ids, id] : ids.filter((other) => other !== id));
      if (!watched) changed();
      return on;
    },
  };
  stores.set(app, favorites);
  return favorites;
}

export type FavoriteDocs = {
  docs: () => readonly Document[];
  subscribe: (listener: () => void) => () => void;
};

// The favorites that are live documents, in order: one that is in the trash (or gone) is left out
// and comes back when it is restored.
export function watchFavoriteDocs(backend: Backend, ids: readonly string[]): FavoriteDocs {
  const handles = ids.map((id) => backend.live("doc.get", { id }));
  let docs: readonly Document[] = [];
  return {
    docs() {
      const next = handles.flatMap((handle) => {
        const doc = handle.getSnapshot().data[0]?.document;
        return doc && !doc.deletedAt ? [doc] : [];
      });
      if (next.length !== docs.length || next.some((doc, i) => doc !== docs[i])) docs = next;
      return docs;
    },
    subscribe(listener) {
      const offs = handles.map((handle) => handle.subscribe(listener));
      return () => {
        for (const off of offs) off();
      };
    },
  };
}
