import type { Store, StoreStatus } from "@lydie/store";

import { createAttachmentSync } from "./attachments.ts";
import type { AttachmentProgress, AttachmentSync, PutTransport } from "./attachments.ts";
import { AbortedError, backoffDelay, createMutex } from "./backoff.ts";
import type { BackoffOptions } from "./backoff.ts";
import { createConnector } from "./connector.ts";
import type { LydieConnector } from "./connector.ts";
import { isApiError, messageOf } from "./http.ts";
import type { ApiClient } from "./http.ts";
import type { SessionState } from "./session.ts";
import { createObservable, jsonEqual } from "./types.ts";
import type { BlobPort, Observable } from "./types.ts";
import { createUploader } from "./upload.ts";
import type { RejectedChange, UploadWarning } from "./upload.ts";

// ---- Status

export type SyncPhase =
  | "signed-out"
  // The session's token was refused. Local edits keep queueing; sign in again to send them.
  | "auth-expired"
  | "offline"
  | "connecting"
  | "syncing"
  | "synced"
  | "error";

export type SyncStatus = {
  state: SyncPhase;
  // Operations applied on this device and not yet confirmed by the server.
  pendingOperations: number;
  // Attachments whose bytes have not reached the server.
  pendingUploads: number;
  // Bytes being sent right now.
  uploading: AttachmentProgress;
  // Documents flagged with a conflict (store `doc_conflicts`).
  conflicts: number;
  // Changes the server refused (see `rejected`).
  rejected: number;
  lastSyncedAt: string | null;
  error: string | null;
  // When the next upload attempt runs after a failure.
  retryAt: string | null;
  // Signed in, and this engine's first full download has not finished yet: a workspace with no
  // rows on this device may just not have arrived (a new workspace, a new device).
  awaitingFirstSync: boolean;
};

// `BackendStatus` from @lydie/plugin-api, which has no "signed-out"/"auth-expired" states yet:
// both map to "error" with `error` set to that phase.
export type BackendStatusShape = {
  sync: "local-only" | "offline" | "connecting" | "syncing" | "synced" | "error";
  pendingOperations: number;
  pendingUploads: number;
  conflicts: number;
  lastSyncedAt: string | null;
  error: string | null;
  awaitingFirstSync: boolean;
};

export function toBackendStatus(status: SyncStatus): BackendStatusShape {
  const sync =
    status.state === "signed-out" || status.state === "auth-expired" ? "error" : status.state;
  return {
    sync,
    pendingOperations: status.pendingOperations,
    pendingUploads: status.pendingUploads,
    conflicts: status.conflicts,
    lastSyncedAt: status.lastSyncedAt,
    error: sync === "error" && status.state !== "error" ? status.state : status.error,
    awaitingFirstSync: status.awaitingFirstSync,
  };
}

type EngineFacts = {
  session: SessionState["status"];
  store: StoreStatus;
  uploadError: { message: string; offline: boolean } | null;
  retryAt: string | null;
  uploading: AttachmentProgress;
  rejected: number;
  started: boolean;
  // When the engine was created (ms). A `lastSyncedAt` from before it is an earlier session's.
  openedAt: number;
};

export function deriveStatus(facts: EngineFacts): SyncStatus {
  const { store } = facts;
  let state: SyncPhase;
  let error: string | null = null;
  if (facts.session === "signed-out") state = "signed-out";
  else if (facts.session === "expired") state = "auth-expired";
  else if (!facts.started) state = "offline";
  else if (facts.uploadError) {
    state = facts.uploadError.offline ? "offline" : "error";
    error = facts.uploadError.message;
  } else if (store.sync === "error") {
    state = "error";
    error = store.error;
  } else if (store.sync === "local-only") {
    state = "offline";
  } else {
    state = store.sync;
    if (state === "synced" && (store.pendingOperations > 0 || store.pendingUploads > 0)) {
      state = "syncing";
    }
  }
  return {
    state,
    pendingOperations: store.pendingOperations,
    pendingUploads: store.pendingUploads,
    uploading: facts.uploading,
    conflicts: store.conflicts,
    rejected: facts.rejected,
    lastSyncedAt: store.lastSyncedAt,
    error,
    retryAt: facts.retryAt,
    // Not the phase alone: "offline" is also the moment before connecting, and "synced" comes
    // from an earlier session's sync until the first checkpoint. Failing to reach the server is
    // "error" (PowerSync keeps its download error until a sync succeeds), and then it is not
    // coming soon.
    awaitingFirstSync:
      facts.session === "signed-in" &&
      state !== "error" &&
      !syncedSince(store.lastSyncedAt, facts.openedAt),
  };
}

// PowerSync's timestamps can be whole seconds, so the comparison is too.
function syncedSince(lastSyncedAt: string | null, since: number): boolean {
  return lastSyncedAt !== null && Date.parse(lastSyncedAt) >= Math.floor(since / 1000) * 1000;
}

// ---- Engine

export type HostedSyncOptions = {
  // A store opened in "synced" mode.
  store: Store;
  // Authenticated API client and the session state it belongs to (`createSession`).
  api: ApiClient;
  session: Observable<SessionState>;
  // Local attachment bytes (the runtime's blob port). Without it attachments are not uploaded.
  blob?: BlobPort;
  put?: PutTransport;
  backoff?: BackoffOptions;
  // Passed to PowerSync's connect; false: do not connect PowerSync (uploads only; tests, tools).
  powersync?: { retryDelayMs?: number; crudUploadThrottleMs?: number } | false;
  // Keep at most this many rejected changes for the UI. Default 200.
  rejectedLimit?: number;
};

export type HostedSync = {
  readonly connector: LydieConnector;
  readonly attachments: AttachmentSync | null;
  readonly status: Observable<SyncStatus>;
  // Changes the server refused, newest last. Dismiss them once the user has seen them.
  readonly rejected: Observable<readonly RejectedChange[]>;
  readonly warnings: Observable<readonly UploadWarning[]>;
  dismissRejected(operationIds?: readonly string[]): void;
  // Connects PowerSync and starts uploading. Idempotent.
  start(): Promise<void>;
  // Disconnects; queued operations stay in the log for the next start.
  stop(): Promise<void>;
  // Uploads now (operations, then attachment bytes). Resolves when the queue is empty, rejects
  // with the error otherwise.
  flush(): Promise<void>;
};

const REJECTED_KEY = "sync_rejected";

function parseRejected(saved: string | null): RejectedChange[] {
  if (!saved) return [];
  try {
    const list: unknown = JSON.parse(saved);
    if (!Array.isArray(list)) return [];
    return list.filter(
      (r): r is RejectedChange =>
        typeof r === "object" &&
        r !== null &&
        typeof (r as RejectedChange).operationId === "string",
    );
  } catch {
    return [];
  }
}

export function createHostedSync(options: HostedSyncOptions): HostedSync {
  const { store, api } = options;
  const mutex = createMutex();
  const rejectedLimit = options.rejectedLimit ?? 200;
  const rejected = createObservable<readonly RejectedChange[]>([]);
  const warnings = createObservable<readonly UploadWarning[]>([]);
  let facts: EngineFacts = {
    session: options.session.get().status,
    store: store.status.get(),
    uploadError: null,
    retryAt: null,
    uploading: {},
    rejected: 0,
    started: false,
    openedAt: Date.now(),
  };
  const status = createObservable<SyncStatus>(deriveStatus(facts), jsonEqual);
  const update = (patch: Partial<EngineFacts>) => {
    facts = { ...facts, ...patch };
    status.set(deriveStatus(facts));
  };

  // Rejected changes outlive a restart until the user has seen them (LYD-188). Writes are chained,
  // so the database always ends with the latest list.
  let saving = Promise.resolve();
  const setRejected = (next: readonly RejectedChange[]) => {
    rejected.set(next);
    update({ rejected: next.length });
    saving = saving.then(() => store.meta.set(REJECTED_KEY, JSON.stringify(next))).catch(() => {});
  };
  const dismiss = (ids: readonly string[] | undefined) =>
    setRejected(ids ? rejected.get().filter((r) => !ids.includes(r.operationId)) : []);
  // The saved list goes before anything rejected since this engine started.
  let isRestored = false;
  const restored = store.meta
    .get(REJECTED_KEY)
    .then((saved) => {
      isRestored = true;
      const current = rejected.get();
      const seen = new Set(current.map((r) => r.operationId));
      const earlier = parseRejected(saved).filter((r) => !seen.has(r.operationId));
      if (earlier.length > 0) setRejected([...earlier, ...current].slice(-rejectedLimit));
    })
    .catch(() => {});

  const uploader = createUploader({
    api,
    oplog: store.oplog,
    onRejected(changes) {
      setRejected([...rejected.get(), ...changes].slice(-rejectedLimit));
    },
    onWarnings(list) {
      warnings.set([...warnings.get(), ...list].slice(-rejectedLimit));
    },
    ...(options.backoff ? { backoff: options.backoff } : {}),
  });

  const attachments = options.blob
    ? createAttachmentSync({
        api,
        store,
        blob: options.blob,
        ...(options.put ? { put: options.put } : {}),
      })
    : null;
  // Lives as long as the engine (both are dropped together).
  attachments?.progress.subscribe((uploading) => update({ uploading }));

  function noteError(error: unknown) {
    if (error instanceof AbortedError) return;
    if (isApiError(error) && error.kind === "auth") {
      // The session observable flips to "expired" through the API client's onUnauthorized.
      update({ uploadError: null });
      return;
    }
    update({
      uploadError: {
        message: messageOf(error),
        offline: isApiError(error) && error.kind === "network",
      },
    });
  }

  const connector = createConnector({
    api,
    uploader,
    oplog: store.oplog,
    mutex,
    onUploadError: noteError,
    onUploaded: () => update({ uploadError: null, retryAt: null }),
  });

  // ---- The pump: drains whenever the log or the attachment queue has work, with backoff.

  let running = false;
  let abort = new AbortController();
  let pumping: Promise<void> | null = null;
  let again = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  async function pumpOnce() {
    await connector.drain(abort.signal);
    if (attachments) {
      const result = await mutex.run(() => attachments.run(abort.signal));
      // Bytes waiting for their document: try again after the next drain.
      if (result.waiting > 0 && store.status.get().pendingOperations === 0) {
        throw new Error(`${result.waiting} attachment(s) are waiting for the server`);
      }
    }
  }

  function pump() {
    if (!running || facts.session !== "signed-in") return;
    if (pumping) {
      again = true;
      return;
    }
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    pumping = (async () => {
      do {
        again = false;
        try {
          await pumpOnce();
          attempt = 0;
          update({ uploadError: null, retryAt: null });
        } catch (error) {
          noteError(error);
          if (!running || error instanceof AbortedError) return;
          if (isApiError(error) && error.kind === "auth") return;
          const delay = backoffDelay(attempt++, options.backoff);
          update({ retryAt: new Date(Date.now() + delay).toISOString() });
          retryTimer = setTimeout(() => {
            retryTimer = null;
            pump();
          }, delay);
          return;
        }
      } while (again && running);
    })().finally(() => {
      pumping = null;
    });
  }

  let offStore: (() => void) | null = null;
  let offSession: (() => void) | null = null;
  let lastPending = -1;

  async function connect() {
    if (options.powersync === false) return;
    await store.db.connect(connector, {
      ...(options.powersync?.retryDelayMs !== undefined
        ? { retryDelayMs: options.powersync.retryDelayMs }
        : {}),
      ...(options.powersync?.crudUploadThrottleMs !== undefined
        ? { crudUploadThrottleMs: options.powersync.crudUploadThrottleMs }
        : {}),
    });
  }

  const engine: HostedSync = {
    connector,
    attachments,
    status,
    rejected,
    warnings,
    dismissRejected(ids) {
      dismiss(ids);
      // A dismissal while the saved list loads applies to that list too.
      if (!isRestored) void restored.then(() => dismiss(ids));
    },
    async start() {
      if (running) return;
      running = true;
      abort = new AbortController();
      update({ started: true, session: options.session.get().status });
      offStore = store.status.subscribe((next) => {
        update({ store: next });
        const pending = next.pendingOperations + next.pendingUploads;
        if (pending > 0 && pending !== lastPending) pump();
        lastPending = pending;
      });
      offSession = options.session.subscribe((session) => {
        const was = facts.session;
        update({ session: session.status });
        if (session.status === "signed-in" && was !== "signed-in") {
          // Signed in again: PowerSync needs fresh credentials, and the queue can move.
          void connect().catch(noteError);
          pump();
        } else if (session.status !== "signed-in" && was === "signed-in") {
          if (options.powersync !== false) void store.db.disconnect();
        }
      });
      if (facts.session === "signed-in") {
        await connect();
        pump();
      }
    },
    async stop() {
      if (!running) return;
      running = false;
      abort.abort();
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      offStore?.();
      offSession?.();
      offStore = offSession = null;
      await pumping?.catch(() => {});
      if (options.powersync !== false) await store.db.disconnect();
      update({ started: false, retryAt: null });
    },
    async flush() {
      await connector.drain(abort.signal);
      if (attachments) await mutex.run(() => attachments.run(abort.signal));
      update({ uploadError: null, retryAt: null });
    },
  };
  return engine;
}
