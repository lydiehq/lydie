import { useSyncExternalStore } from "react";

// What a plugin knows about a document that the rest of the UI should show: today, that it is a
// connected folder (its pages are kept in step with a destination, plan §7), or one of that
// folder's pages. The plugin that knows sets its own marks; `DocIcon` reads the folders' marks, so
// the tree, pickers and favourites all show the same thing, and the properties panel reads the
// pages' marks (a page's frontmatter there belongs to the destination's files).

export type DocumentMark = {
  // What the document is connected to: a connector id ("github"). Unknown ones get a generic icon.
  connector: string;
  // For a tooltip or a test: "Connected to GitHub".
  label: string;
};

const EMPTY: ReadonlyMap<string, DocumentMark> = new Map();

function markStore() {
  const byOwner = new Map<string, ReadonlyMap<string, DocumentMark>>();
  let merged: ReadonlyMap<string, DocumentMark> = EMPTY;
  const listeners = new Set<() => void>();

  // Replaces the marks `owner` (a plugin id) has set. An empty map clears them.
  const set = (owner: string, marks: ReadonlyMap<string, DocumentMark>): void => {
    if (marks.size === 0) byOwner.delete(owner);
    else byOwner.set(owner, marks);
    const next = new Map<string, DocumentMark>();
    for (const map of byOwner.values()) for (const [id, mark] of map) next.set(id, mark);
    // The same marks again (a periodic refresh): no re-render of every icon.
    const unchanged =
      next.size === merged.size &&
      [...next].every(([id, mark]) => {
        const before = merged.get(id);
        return before?.connector === mark.connector && before.label === mark.label;
      });
    if (unchanged) return;
    merged = next.size === 0 ? EMPTY : next;
    for (const listener of [...listeners]) listener();
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const snapshot = () => merged;

  const use = (id: string | null | undefined): DocumentMark | null => {
    const marks = useSyncExternalStore(subscribe, snapshot, snapshot);
    return id ? (marks.get(id) ?? null) : null;
  };

  return { set, use };
}

const folders = markStore();
const pages = markStore();

// Connected folders: the documents that stand for the place itself.
export const setDocumentMarks = folders.set;
export const useDocumentMark = folders.use;

// The pages inside a connected folder, marked with their folder's connection.
export const setConnectedPages = pages.set;
export const useConnectedPage = pages.use;
