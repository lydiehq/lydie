import { backoffDelay, sleep } from "./backoff.ts";
import type { BackoffOptions } from "./backoff.ts";
import { ApiError, isApiError } from "./http.ts";
import type { ApiClient } from "./http.ts";
import type { AppliedOperation, ErrorBody } from "./types.ts";

// The server's limit per request.
export const MAX_BATCH = 500;

// One entry of `POST /v1/sync/upload`'s response, in request order.
export type UploadResult = {
  id: string | null;
  operation: string | null;
  status: "applied" | "rejected";
  duplicate?: true;
  warnings?: string[];
  error?: ErrorBody;
};

// An operation the server refused. It is gone from the upload queue; the optimistic rows it wrote
// are replaced by the server's state on the next sync. The UI shows these to the user.
export type RejectedChange = {
  operationId: string;
  operation: string;
  input: unknown;
  workspaceId: string | null;
  createdAt: string;
  reason: ErrorBody;
  rejectedAt: string;
};

export type UploadWarning = {
  operationId: string;
  operation: string;
  warnings: string[];
  at: string;
};

// The part of the store's operation log the uploader needs (`store.oplog` satisfies it).
export type OplogPort = {
  list(options?: { limit?: number }): Promise<AppliedOperation[]>;
  remove(ids: readonly string[]): Promise<void>;
};

export type UploaderOptions = {
  api: ApiClient;
  oplog: OplogPort;
  // ≤ 500.
  batchSize?: number;
  onRejected?: (changes: readonly RejectedChange[]) => void;
  onWarnings?: (warnings: readonly UploadWarning[]) => void;
  // Called with how many entries left the queue after each batch.
  onProgress?: (progress: { uploaded: number; rejected: number }) => void;
  // Every batch's raw results (duplicates included).
  onResults?: (results: readonly UploadResult[]) => void;
  // Retries of one batch within one drain on network errors and 5xx. Default 4 (5 tries).
  retries?: number;
  backoff?: BackoffOptions;
};

export type DrainResult = { uploaded: number; rejected: number; batches: number };

export type Uploader = {
  // Sends one batch as is and returns the server's results. Throws ApiError.
  send(entries: readonly AppliedOperation[], signal?: AbortSignal): Promise<UploadResult[]>;
  // Uploads the operation log until it is empty, oldest first. Throws ApiError when the server
  // stays unreachable (after retries) or the session expired (401, no retry).
  drain(signal?: AbortSignal): Promise<DrainResult>;
};

export function createUploader(options: UploaderOptions): Uploader {
  const batchSize = Math.min(options.batchSize ?? MAX_BATCH, MAX_BATCH);
  const retries = options.retries ?? 4;

  async function send(entries: readonly AppliedOperation[], signal?: AbortSignal) {
    const { results } = await options.api.post<{ results: UploadResult[] }>(
      "/v1/sync/upload",
      { operations: entries },
      signal ? { signal } : {},
    );
    if (!Array.isArray(results)) {
      throw new ApiError("server", "Upload response has no results");
    }
    return results;
  }

  async function sendWithRetry(entries: readonly AppliedOperation[], signal?: AbortSignal) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await send(entries, signal);
      } catch (error) {
        if (!isApiError(error) || !error.retryable || attempt >= retries) throw error;
        await sleep(backoffDelay(attempt, options.backoff), signal);
      }
    }
  }

  return {
    send,
    async drain(signal) {
      const total: DrainResult = { uploaded: 0, rejected: 0, batches: 0 };
      for (;;) {
        signal?.throwIfAborted();
        const batch = await options.oplog.list({ limit: batchSize });
        if (batch.length === 0) return total;
        const results = await sendWithRetry(batch, signal);
        options.onResults?.(results);
        const outcome = settle(batch, results);
        // Only now do entries leave the queue. A crash before this line re-sends them, and the
        // server answers `duplicate` with the first outcome (dedupe by operation id).
        await options.oplog.remove(outcome.done);
        total.batches++;
        total.uploaded += outcome.done.length - outcome.rejected.length;
        total.rejected += outcome.rejected.length;
        if (outcome.rejected.length > 0) options.onRejected?.(outcome.rejected);
        if (outcome.warnings.length > 0) options.onWarnings?.(outcome.warnings);
        options.onProgress?.({
          uploaded: outcome.done.length - outcome.rejected.length,
          rejected: outcome.rejected.length,
        });
        if (outcome.done.length < batch.length) {
          // The server answered for fewer entries than sent. Never spin on the remainder.
          throw new ApiError(
            "server",
            `Upload answered ${outcome.done.length} of ${batch.length} operations`,
          );
        }
      }
    },
  };
}

// Pairs results with entries (by position, checked against the id) and sorts them into done,
// rejected and warnings.
export function settle(entries: readonly AppliedOperation[], results: readonly UploadResult[]) {
  const byId = new Map<string, UploadResult>();
  for (const result of results) if (result.id) byId.set(result.id, result);
  const now = new Date().toISOString();
  const done: string[] = [];
  const rejected: RejectedChange[] = [];
  const warnings: UploadWarning[] = [];
  entries.forEach((entry, index) => {
    const positional = results[index];
    const result =
      byId.get(entry.id) ?? (positional && positional.id === null ? positional : undefined);
    if (!result) return;
    done.push(entry.id);
    if (result.status === "rejected") {
      rejected.push({
        operationId: entry.id,
        operation: entry.operation,
        input: entry.input,
        workspaceId: entry.workspaceId,
        createdAt: entry.createdAt,
        reason: result.error ?? { code: "rejected", message: "The server rejected this change" },
        rejectedAt: now,
      });
    } else if (result.warnings && result.warnings.length > 0) {
      warnings.push({
        operationId: entry.id,
        operation: entry.operation,
        warnings: result.warnings,
        at: now,
      });
    }
  });
  return { done, rejected, warnings };
}
