import type { FileChange } from "@lydie/platform";

// Folder watching with @parcel/watcher: one native recursive subscription per folder (FSEvents on
// macOS, inotify on Linux, ReadDirectoryChangesW on Windows), the same library VS Code uses. Events
// are coalesced into short batches before they cross IPC.
import { TEMP_MARKER } from "./workspace-fs.ts";
import type { WorkspaceFs } from "./workspace-fs.ts";

const IGNORE = ["**/.git", "**/node_modules", `**/*${TEMP_MARKER}*`, "**/.DS_Store"];
const BATCH_MS = 30;

export type FolderWatch = { close(): Promise<void> };

export async function watchFolder(
  fs: WorkspaceFs,
  onChanges: (changes: FileChange[]) => void,
): Promise<FolderWatch> {
  let pending: FileChange[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    const batch = pending;
    pending = [];
    if (batch.length) onChanges(batch);
  };
  const push = (change: FileChange) => {
    pending.push(change);
    timer ??= setTimeout(flush, BATCH_MS);
  };

  // The native addon loads with the first watched folder, not at launch.
  const { default: watcher } = await import("@parcel/watcher");
  const subscription = await watcher.subscribe(
    fs.root,
    (error, events) => {
      if (error) {
        push({ type: "rescan" });
        return;
      }
      for (const event of events) {
        const path = fs.relativeOf(event.path);
        if (path === null || path === "") continue;
        push({ type: event.type, path });
      }
    },
    { ignore: IGNORE },
  );

  return {
    async close() {
      if (timer) clearTimeout(timer);
      pending = [];
      await subscription.unsubscribe();
    },
  };
}
