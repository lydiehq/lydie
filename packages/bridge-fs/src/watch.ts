// Folder watching with @parcel/watcher (FSEvents, inotify, ReadDirectoryChangesW), as the desktop
// shell does. Events are coalesced into batches of vault-relative paths. A batch that only removes
// things is held a little longer, so the other half of a rename (another program's move, a git
// checkout) lands in the same batch and the bridge can pair them.
import { relative, sep } from "node:path";

import watcher from "@parcel/watcher";

import { TEMP_MARKER } from "./paths.ts";

export type WatchBatch = { paths: Set<string>; rescan: boolean };

export type FolderWatcher = { close(): Promise<void>; pending(): boolean };

export type WatchOptions = {
  // Quiet time before a batch is delivered.
  debounceMs?: number;
  // Extra wait for batches that contain deletions only.
  renameWindowMs?: number;
};

const IGNORE = [
  "**/.git",
  "**/node_modules",
  "**/.obsidian",
  `**/*${TEMP_MARKER}*`,
  "**/.DS_Store",
];

export async function watchFolder(
  root: string,
  onBatch: (batch: WatchBatch) => void,
  options: WatchOptions = {},
): Promise<FolderWatcher> {
  const debounceMs = options.debounceMs ?? 75;
  const renameWindowMs = options.renameWindowMs ?? 300;
  let paths = new Set<string>();
  let rescan = false;
  let onlyDeletes = true;
  let firstAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    const waited = Date.now() - firstAt;
    if (onlyDeletes && !rescan && waited < renameWindowMs) {
      timer = setTimeout(flush, renameWindowMs - waited);
      return;
    }
    const batch = { paths, rescan };
    paths = new Set();
    rescan = false;
    onlyDeletes = true;
    if (batch.paths.size > 0 || batch.rescan) onBatch(batch);
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  };

  const subscription = await watcher.subscribe(
    root,
    (error, events) => {
      if (error) {
        if (paths.size === 0 && !rescan) firstAt = Date.now();
        rescan = true;
        schedule();
        return;
      }
      for (const event of events) {
        const rel = relative(root, event.path);
        if (rel === "" || rel.startsWith("..")) continue;
        if (paths.size === 0 && !rescan) firstAt = Date.now();
        paths.add(sep === "/" ? rel : rel.split(sep).join("/"));
        if (event.type !== "delete") onlyDeletes = false;
      }
      schedule();
    },
    { ignore: IGNORE },
  );

  return {
    pending: () => timer !== null,
    async close() {
      if (timer) clearTimeout(timer);
      timer = null;
      await subscription.unsubscribe();
    },
  };
}
