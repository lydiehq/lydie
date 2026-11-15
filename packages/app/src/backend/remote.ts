import { LydieError } from "@lydie/contract";
import type { DatabaseDefinition, ErrorCode } from "@lydie/contract";
import { serviceClient } from "@lydie/platform";
import type { ServiceChannel } from "@lydie/platform";
import type {
  Backend,
  BackendDocuments,
  BackendStatus,
  HistoryState,
  LiveParams,
  LiveQueryName,
  LiveRow,
  LiveState,
  OperationOptions,
} from "@lydie/plugin-api";
import { uuid } from "@lydie/runtime";

import { createLiveRegistry, frameScheduler, liveKey } from "./live-registry.ts";
import type { LiveSource } from "./live-registry.ts";
import { lingerFor, opsProxy } from "./local.ts";
import {
  createOverlays,
  OPTIMISTIC_OPS,
  overlaySource,
  patcherFor,
  pendingHistory,
  recordedLabel,
} from "./optimistic.ts";
import type { PatchContext } from "./optimistic.ts";
import { backendService } from "./service.ts";
import type { LiveEvent, Result, WireError } from "./service.ts";

const EMPTY_HISTORY: HistoryState = Object.freeze({
  canUndo: false,
  canRedo: false,
  undoLabel: null,
  redoLabel: null,
});

export function fromWireError(error: WireError): LydieError {
  return new LydieError(error.code as ErrorCode, error.message, {
    ...(error.hint ? { hint: error.hint } : {}),
    ...(error.details !== undefined ? { details: error.details } : {}),
  });
}

function unwrap<T>(result: Result<T>): T {
  if (result.ok) return result.value;
  throw fromWireError(result.error);
}

// Rebuilds a live query's rows from the wire, keeping the previous objects for reused runs.
export function applyLiveEvent<T>(previous: LiveState<T>, event: LiveEvent): LiveState<T> {
  let data = previous.data;
  if (event.rows) {
    const out: T[] = [];
    for (const segment of event.rows) {
      if (Array.isArray(segment)) {
        for (let i = 0; i < segment[1]; i++) out.push(previous.data[segment[0] + i]!);
      } else out.push(segment.v as T);
    }
    const same = out.length === data.length && out.every((row, i) => row === data[i]);
    if (!same) data = out;
  }
  const error = event.error ? fromWireError(event.error) : undefined;
  if (
    data === previous.data &&
    event.isLoading === previous.isLoading &&
    !error &&
    !previous.error
  ) {
    return previous;
  }
  return { data, isLoading: event.isLoading, error };
}

// A Backend in the renderer whose database runs elsewhere (the Electron main process), reached
// through the shell's ServiceChannel. Mutations are one IPC round trip; live queries stream
// diffs and are delivered to React once per frame.
export async function createRemoteBackend(
  channel: ServiceChannel,
  // A folder window's file-bridge editing sessions (`createVaultDocuments`).
  options: { lingerMs?: number; documents?: BackendDocuments } = {},
): Promise<Backend> {
  const client = serviceClient(channel, backendService);
  const [info, initialStatus] = await Promise.all([
    client.request("info", null),
    client.request("status", null),
  ]);
  const schedule = frameScheduler();
  const registry = createLiveRegistry({
    schedule,
    ...(options.lingerMs !== undefined ? { lingerMs: options.lingerMs } : {}),
  });

  // History: mirrored per scope so `state()` stays synchronous.
  const histories = new Map<string, HistoryState>();
  const historyListeners = new Set<(scope: string) => void>();
  const setHistory = (scope: string, state: HistoryState) => {
    const previous = histories.get(scope);
    if (
      previous &&
      previous.canUndo === state.canUndo &&
      previous.canRedo === state.canRedo &&
      previous.undoLabel === state.undoLabel &&
      previous.redoLabel === state.redoLabel
    ) {
      return;
    }
    histories.set(scope, state);
    for (const listener of [...historyListeners]) listener(scope);
  };
  const offHistory = client.subscribe("history", null, ({ scope, state }) =>
    setHistory(scope, state),
  );
  const historyState = (scope = "default") => {
    const known = histories.get(scope);
    if (known) return known;
    histories.set(scope, EMPTY_HISTORY);
    void client.request("historyState", { scope }).then((state) => setHistory(scope, state));
    return EMPTY_HISTORY;
  };

  const pending = pendingHistory({
    state: historyState,
    subscribe(listener) {
      historyListeners.add(listener);
      return () => historyListeners.delete(listener);
    },
  });

  let status: BackendStatus = initialStatus;
  const statusListeners = new Set<() => void>();
  const offStatus = client.subscribe("status", null, (next) => {
    if (JSON.stringify(next) === JSON.stringify(status)) return;
    status = next;
    for (const listener of [...statusListeners]) listener();
  });

  // Optimistic paint (see optimistic.ts): the hot paths patch the live queries here, in the
  // renderer, so they paint in the input's frame instead of after the IPC round trip and the write.
  const overlays = createOverlays();
  const patchContext: PatchContext = {
    properties: (databaseId) =>
      (
        registry.peek(liveKey("database.get", { id: databaseId }))?.getSnapshot().data[0] as
          | DatabaseDefinition
          | undefined
      )?.properties ?? null,
  };

  const execute = async (id: string, raw: unknown, opOptions?: object) => {
    let input = raw;
    // A new document gets its id here, so its optimistic row is the row that arrives.
    if (id === "doc.create" && input && typeof input === "object" && !("id" in input)) {
      input = { ...input, id: uuid() };
    }
    const settle = OPTIMISTIC_OPS.has(id) ? overlays.begin(id, input) : null;
    const scope = (opOptions as { scope?: string } | undefined)?.scope ?? "default";
    const recorded = recordedLabel(id, opOptions);
    const pendingStep = recorded ? pending.begin(scope, recorded) : null;
    // The step is mirrored once main reports it; until then the pending label stands.
    const endPending = () =>
      void client
        .request("historyState", { scope })
        .then((state) => setHistory(scope, state))
        .finally(() => pendingStep?.());
    const { onProgress, ...wire } = (opOptions ?? {}) as OperationOptions;
    const token = onProgress ? crypto.randomUUID() : null;
    const offProgress = token ? client.subscribe("progress", { token }, onProgress!) : null;
    try {
      const value = unwrap(
        await client.request("execute", {
          id,
          input,
          ...(opOptions ? { options: token ? { ...wire, progress: token } : wire } : {}),
        }),
      );
      settle?.(true);
      if (pendingStep) endPending();
      return value;
    } catch (error) {
      settle?.(false);
      pendingStep?.();
      throw error;
    } finally {
      offProgress?.();
    }
  };

  const liveSource =
    <T>(name: LiveQueryName, params: unknown): LiveSource<T> =>
    (emit) => {
      let state: LiveState<T> = { data: [], isLoading: true, error: undefined };
      return client.subscribe(
        "live",
        { name, params },
        (event) => {
          const next = applyLiveEvent(state, event);
          if (next === state) return;
          // The first result is what a page waits for: not a frame later.
          const first = state.isLoading && !next.isLoading;
          state = next;
          emit(state, first ? { now: true } : undefined);
        },
        (error) => {
          state = { ...state, isLoading: false, error };
          emit(state);
        },
      );
    };

  return {
    info,
    ops: opsProxy(execute),
    execute: execute as Backend["execute"],
    async transaction(label, fn, opOptions) {
      const tx = unwrap(
        await client.request("txBegin", { label, ...(opOptions ? { options: opOptions } : {}) }),
      );
      const ops = opsProxy(async (id, input) =>
        unwrap(await client.request("txExec", { tx, id, input })),
      );
      let value;
      try {
        value = await fn(ops);
      } catch (error) {
        await client.request("txEnd", { tx, ok: false });
        throw error;
      }
      unwrap(await client.request("txEnd", { tx, ok: true }));
      return value;
    },
    live<N extends LiveQueryName>(name: N, params: LiveParams<N>) {
      return registry.get<LiveRow<N>>(
        liveKey(name, params),
        () => {
          const source = liveSource<LiveRow<N>>(name, params);
          const patcher = patcherFor(name, params, patchContext);
          return patcher ? overlaySource(source, patcher as never, overlays) : source;
        },
        lingerFor(name, options.lingerMs),
      );
    },
    async query<N extends LiveQueryName>(name: N, params: LiveParams<N>) {
      return unwrap(await client.request("query", { name, params })) as readonly LiveRow<N>[];
    },
    history: {
      undo: async (scope) => unwrap(await client.request("undo", scope ? { scope } : {})),
      redo: async (scope) => unwrap(await client.request("redo", scope ? { scope } : {})),
      canUndo: (scope) => pending.state(scope).canUndo,
      canRedo: (scope) => pending.state(scope).canRedo,
      state: (scope) => pending.state(scope),
      subscribe: (listener) => pending.subscribe(listener),
    },
    status: {
      get: () => status,
      subscribe(listener) {
        statusListeners.add(listener);
        return () => statusListeners.delete(listener);
      },
      dismissRejected: (operationIds) =>
        void client.request("dismissRejected", operationIds ? { operationIds } : {}),
    },
    attachments: {
      add: async (input, opOptions) =>
        unwrap(
          await client.request("attachmentAdd", {
            input,
            ...(opOptions ? { options: opOptions } : {}),
          }),
        ) as never,
      async url(id) {
        const found = unwrap(await client.request("attachmentRead", { id }));
        if (!found) return unwrap(await client.request("attachmentRemoteUrl", { id }));
        return URL.createObjectURL(new Blob([found.data as BlobPart], { type: found.contentType }));
      },
    },
    layouts: {
      load: async (id) => unwrap(await client.request("layoutLoad", { id })),
      save: async (id, layout) => {
        unwrap(await client.request("layoutSave", { id, layout }));
      },
    },
    ...(options.documents ? { documents: options.documents } : {}),
    async close() {
      offHistory();
      offStatus();
      registry.close();
    },
  };
}
