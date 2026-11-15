import { defineService } from "@lydie/platform";
import type {
  AddAttachmentInput,
  BackendInfo,
  BackendStatus,
  HistoryState,
  LiveQueryName,
  OperationOptions,
} from "@lydie/plugin-api";

// The wire format between `serveBackend` (Electron main, or any host) and `createRemoteBackend`
// (the renderer). Everything here is structured-clone safe.

export type WireError = { code: string; message: string; hint?: string; details?: unknown };
export type Result<T> = { ok: true; value: T } | { ok: false; error: WireError };

// A live query's rows as segments against the previous emission: `[start, count]` reuses that
// run of previous rows (the renderer keeps those objects), `{ v }` is a new or changed row.
export type RowSegment = [number, number] | { v: unknown };

export type LiveEvent = {
  // "snapshot": `rows` are all new; "diff": against the previous emission; "state": rows unchanged.
  t: "snapshot" | "diff" | "state";
  rows?: RowSegment[];
  isLoading: boolean;
  error?: WireError;
};

// Functions do not cross the wire: `onProgress` becomes a token for the `progress` stream.
export type WireOperationOptions = Omit<OperationOptions, "onProgress"> & { progress?: string };

export type BackendContract = {
  requests: {
    info: { input: null; output: BackendInfo };
    status: { input: null; output: BackendStatus };
    execute: {
      input: { id: string; input: unknown; options?: WireOperationOptions };
      output: Result<unknown>;
    };
    txBegin: { input: { label: string; options?: OperationOptions }; output: Result<string> };
    txExec: { input: { tx: string; id: string; input: unknown }; output: Result<unknown> };
    // ok false rolls back.
    txEnd: { input: { tx: string; ok: boolean }; output: Result<null> };
    undo: { input: { scope?: string }; output: Result<boolean> };
    redo: { input: { scope?: string }; output: Result<boolean> };
    historyState: { input: { scope: string }; output: HistoryState };
    query: { input: { name: LiveQueryName; params: unknown }; output: Result<readonly unknown[]> };
    attachmentAdd: {
      input: { input: AddAttachmentInput; options?: OperationOptions };
      output: Result<unknown>;
    };
    attachmentRead: {
      input: { id: string };
      output: Result<{ data: Uint8Array; contentType: string } | null>;
    };
    attachmentRemoteUrl: { input: { id: string }; output: Result<string | null> };
    dismissRejected: { input: { operationIds?: readonly string[] }; output: null };
    layoutLoad: { input: { id: string }; output: Result<unknown> };
    layoutSave: { input: { id: string; layout: unknown }; output: Result<null> };
  };
  streams: {
    live: { params: { name: LiveQueryName; params: unknown }; event: LiveEvent };
    history: { params: null; event: { scope: string; state: HistoryState } };
    status: { params: null; event: BackendStatus };
    // `OperationOptions.onProgress` of the execute call that sent the same `token`.
    progress: { params: { token: string }; event: { done: number; total: number } };
  };
};

export const backendService = defineService<BackendContract>("lydie-backend");
