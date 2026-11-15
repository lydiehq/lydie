import type { SyncStatus as PowerSyncStatus } from "@powersync/common";

import type { StoreMode } from "./schema.ts";

export type SyncState = "local-only" | "offline" | "connecting" | "syncing" | "synced" | "error";

export type StoreStatus = {
  sync: SyncState;
  // Operations applied locally and not yet confirmed by the server. 0 when sync is off.
  pendingOperations: number;
  // Attachments whose bytes are not uploaded yet. 0 when sync is off.
  pendingUploads: number;
  // Documents flagged with a conflict (sync or file reconciliation).
  conflicts: number;
  lastSyncedAt: string | null;
  error: string | null;
};

export type StatusSource = {
  mode: StoreMode;
  counts(): Promise<{ ops: number; files: number; conflicts: number }>;
  onTables(tables: readonly string[], listener: () => void): () => void;
  current(): PowerSyncStatus;
  onSyncStatus(listener: (status: PowerSyncStatus) => void): () => void;
};

const TABLES = ["operation_log", "attachment_uploads", "doc_conflicts"] as const;

export function syncStateOf(mode: StoreMode, status: PowerSyncStatus): SyncState {
  if (mode === "local") return "local-only";
  const flow = status.dataFlowStatus;
  if (flow.downloadError || flow.uploadError) return "error";
  if (status.connecting) return "connecting";
  if (!status.connected) return "offline";
  if (flow.downloading || flow.uploading) return "syncing";
  return status.hasSynced ? "synced" : "connecting";
}

function errorOf(status: PowerSyncStatus): string | null {
  const error = status.dataFlowStatus.downloadError ?? status.dataFlowStatus.uploadError;
  return error ? error.message : null;
}

// Status is computed lazily: the first subscriber starts the listeners, the last one stops them.
export function createStatus(source: StatusSource) {
  const listeners = new Set<(status: StoreStatus) => void>();
  let counts = { ops: 0, files: 0, conflicts: 0 };
  let stop: (() => void) | null = null;
  let current = compute();

  function compute(): StoreStatus {
    const sync = source.current();
    const local = source.mode === "local";
    return {
      sync: syncStateOf(source.mode, sync),
      pendingOperations: local ? 0 : counts.ops,
      pendingUploads: local ? 0 : counts.files,
      conflicts: counts.conflicts,
      lastSyncedAt: local ? null : (sync.lastSyncedAt?.toISOString() ?? null),
      error: local ? null : errorOf(sync),
    };
  }

  function publish() {
    const next = compute();
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    current = next;
    for (const listener of listeners) listener(current);
  }

  async function refreshCounts() {
    try {
      counts = await source.counts();
    } catch {
      // The database is closing; keep the last known counts.
      return;
    }
    publish();
  }

  function start() {
    const offTables = source.onTables(TABLES, () => void refreshCounts());
    const offSync = source.onSyncStatus(() => publish());
    stop = () => {
      offTables();
      offSync();
    };
    void refreshCounts();
  }

  return {
    get: () => current,
    subscribe(listener: (status: StoreStatus) => void) {
      listeners.add(listener);
      if (!stop) start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && stop) {
          stop();
          stop = null;
        }
      };
    },
    // Fetches the counts once (for callers that do not subscribe).
    refresh: refreshCounts,
    close() {
      stop?.();
      stop = null;
      listeners.clear();
    },
  };
}
