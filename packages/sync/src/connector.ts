import type {
  CommonPowerSyncDatabase,
  PowerSyncBackendConnector,
  PowerSyncCredentials,
} from "@powersync/common";

import { createMutex } from "./backoff.ts";
import type { ApiClient } from "./http.ts";
import type { OplogPort, Uploader } from "./upload.ts";

// What `/v1/sync/token` returns.
export type SyncToken = { endpoint: string; token: string; expiresAt: string };

export type ConnectorOptions = {
  api: ApiClient;
  uploader: Uploader;
  oplog: OplogPort;
  // Shared with every other drain so uploads never run twice at once.
  mutex?: ReturnType<typeof createMutex>;
  // PowerSync CRUD entries completed per round. Default 1000.
  crudBatch?: number;
  // Rewrites the PowerSync endpoint (e.g. a reverse proxy path); default: as the server says.
  endpoint?: (endpoint: string) => string;
  onUploadError?: (error: unknown) => void;
  onUploaded?: () => void;
};

export type LydieConnector = PowerSyncBackendConnector & {
  // Drains the operation log without touching PowerSync's queue (ops that wrote no synced rows
  // never wake `uploadData`).
  drain(signal?: AbortSignal): Promise<void>;
};

// The PowerSync connector for synced mode. Downloads use PowerSync's own stream. Uploads ignore
// PowerSync's row-level CRUD queue as a source: the truth is the runtime's operation log, which
// the core re-executes with real permission checks. The CRUD queue is only *completed*, and only
// up to entries whose operations are already uploaded, so PowerSync never replaces an optimistic
// row with server state before the operation that wrote it has reached the server.
export function createConnector(options: ConnectorOptions): LydieConnector {
  const mutex = options.mutex ?? createMutex();
  const crudBatch = options.crudBatch ?? 1000;

  const drain = (signal?: AbortSignal) =>
    mutex.run(async () => {
      await options.uploader.drain(signal);
    });

  return {
    async fetchCredentials(): Promise<PowerSyncCredentials | null> {
      // Credentials are short-lived (15 min); PowerSync calls this again when they expire or the
      // service rejects them, so nothing is cached here.
      const token = await options.api.get<SyncToken>("/v1/sync/token");
      return {
        endpoint: options.endpoint ? options.endpoint(token.endpoint) : token.endpoint,
        token: token.token,
        expiresAt: new Date(token.expiresAt),
      };
    },

    async uploadData(database: CommonPowerSyncDatabase) {
      try {
        await mutex.run(async () => {
          await options.uploader.drain();
          for (;;) {
            // Read the CRUD entries first, then check the log is still empty. An operation and its
            // rows commit in one transaction, so every entry read before an empty check belongs to
            // an operation that already left the log (uploaded or rejected).
            const batch = await database.getCrudBatch(crudBatch);
            if (!batch) break;
            if ((await options.oplog.list({ limit: 1 })).length > 0) {
              await options.uploader.drain();
              continue;
            }
            await batch.complete();
            if (!batch.haveMore) break;
          }
        });
        options.onUploaded?.();
      } catch (error) {
        options.onUploadError?.(error);
        // PowerSync retries uploadData after its retry delay. A 401 will keep failing until the
        // user signs in again; the engine disconnects in that case.
        throw error;
      }
    },

    drain: async (signal) => {
      try {
        await drain(signal);
        options.onUploaded?.();
      } catch (error) {
        if (!signal?.aborted) options.onUploadError?.(error);
        throw error;
      }
    },
  };
}
