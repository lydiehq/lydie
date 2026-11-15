import { uuidsForUlids } from "@lydie/contract";

const DONE = "lydie:ids";

// What this browser (or Electron window) keeps in localStorage names workspaces and pages by id:
// which workspace opens, recent pages, favourites, expanded folders. Ids were ULIDs before they
// were UUIDs; the databases are rewritten when they open (`@lydie/store`, migration 8), and this
// does the same for the keys and values here, once.
export function rewriteStoredIds(storage: Storage = localStorage): void {
  if (storage.getItem(DONE) === "uuid") return;
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter(
    (key): key is string => key !== null && key.startsWith("lydie"),
  );
  for (const key of keys) {
    const value = storage.getItem(key);
    if (value === null) continue;
    const next = [uuidsForUlids(key), uuidsForUlids(value)] as const;
    if (next[0] === key && next[1] === value) continue;
    if (next[0] !== key) storage.removeItem(key);
    storage.setItem(next[0], next[1]);
  }
  storage.setItem(DONE, "uuid");
}
