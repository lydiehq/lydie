import { isLydieError } from "@lydie/contract";
import type { ServiceHandlers } from "@lydie/platform";
import type { LiveQueryName, TransactionOps } from "@lydie/plugin-api";

import type { LocalBackend } from "./local.ts";
import type { BackendContract, LiveEvent, Result, RowSegment, WireError } from "./service.ts";

export function toWireError(error: unknown): WireError {
  if (isLydieError(error)) {
    return {
      code: error.code,
      message: error.message,
      ...(error.hint ? { hint: error.hint } : {}),
      ...(error.details !== undefined ? { details: error.details } : {}),
    };
  }
  return { code: "internal", message: error instanceof Error ? error.message : String(error) };
}

async function result<T>(fn: () => Promise<T> | T): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, error: toWireError(error) };
  }
}

// Encodes `next` against `previous`: runs of rows that are the same objects become `[start, n]`.
export function encodeRows(previous: readonly unknown[], next: readonly unknown[]): RowSegment[] {
  const index = new Map<unknown, number>();
  previous.forEach((row, i) => index.set(row, i));
  const out: RowSegment[] = [];
  let run: [number, number] | null = null;
  for (const row of next) {
    const at = index.get(row);
    if (at === undefined) {
      run = null;
      out.push({ v: row });
    } else if (run && run[0] + run[1] === at) {
      run[1]++;
    } else {
      run = [at, 1];
      out.push(run);
    }
  }
  return out;
}

type OpenTransaction = {
  ops: TransactionOps;
  finish(ok: boolean): Promise<void>;
  timer: ReturnType<typeof setTimeout>;
};

// Request and stream handlers serving `backend` to `createRemoteBackend` over a ServiceChannel.
// Register them with the host: `channel.register(backendService, serveBackend(backend))`.
export function serveBackend(
  backend: LocalBackend,
  options: { transactionTimeoutMs?: number } = {},
): ServiceHandlers<BackendContract> {
  const transactions = new Map<string, OpenTransaction>();
  const timeoutMs = options.transactionTimeoutMs ?? 30_000;
  const progress = new Map<string, (event: { done: number; total: number }) => void>();

  return {
    requests: {
      info: () => backend.info,
      status: () => backend.status.get(),
      execute: ({ id, input, options: opOptions }) => {
        const { progress: token, ...rest } = opOptions ?? {};
        // Looked up per event: the subscription may arrive after the request.
        const withProgress = token
          ? {
              ...rest,
              onProgress: (event: { done: number; total: number }) => progress.get(token)?.(event),
            }
          : opOptions;
        return result(() => backend.execute(id as never, input as never, withProgress));
      },
      txBegin: ({ label, options: opOptions }) =>
        result(
          () =>
            new Promise<string>((resolveBegin, rejectBegin) => {
              const id = crypto.randomUUID();
              let release!: (ok: boolean) => void;
              const done = backend.transaction(
                label,
                (ops) =>
                  new Promise<null>((resolve, reject) => {
                    release = (ok) => (ok ? resolve(null) : reject(new Error("Rolled back")));
                    const timer = setTimeout(() => {
                      transactions.delete(id);
                      release(false);
                    }, timeoutMs);
                    transactions.set(id, {
                      ops,
                      timer,
                      async finish(ok) {
                        clearTimeout(timer);
                        transactions.delete(id);
                        release(ok);
                        try {
                          await done;
                        } catch (error) {
                          if (ok) throw error;
                        }
                      },
                    });
                    resolveBegin(id);
                  }),
                opOptions,
              );
              done.catch((error: unknown) => {
                if (!transactions.has(id)) return;
                rejectBegin(error);
              });
            }),
        ),
      txExec: ({ tx, id, input }) =>
        result(() => {
          const open = transactions.get(tx);
          if (!open) throw new Error("Transaction is not open");
          const [ns, method] = id.split(".") as [string, string];
          const fn = (open.ops as unknown as Record<string, Record<string, unknown>>)[ns]?.[
            method
          ] as ((input: unknown) => Promise<unknown>) | undefined;
          if (!fn) throw new Error(`Unknown operation: ${id}`);
          return fn(input);
        }),
      txEnd: ({ tx, ok }) =>
        result(async () => {
          const open = transactions.get(tx);
          if (!open) throw new Error("Transaction is not open");
          await open.finish(ok);
          return null;
        }),
      undo: ({ scope }) => result(() => backend.history.undo(scope)),
      redo: ({ scope }) => result(() => backend.history.redo(scope)),
      historyState: ({ scope }) => backend.history.state(scope),
      query: ({ name, params }) => result(() => backend.query(name, params as never)),
      attachmentAdd: ({ input, options: opOptions }) =>
        result(() => backend.attachments.add(input, opOptions)),
      attachmentRead: ({ id }) => result(() => backend.readAttachment(id)),
      attachmentRemoteUrl: ({ id }) => result(() => backend.remoteAttachmentUrl(id)),
      dismissRejected: ({ operationIds }) => {
        backend.status.dismissRejected?.(operationIds);
        return null;
      },
      layoutLoad: ({ id }) => result(() => backend.layouts.load(id)),
      layoutSave: ({ id, layout }) =>
        result(async () => {
          await backend.layouts.save(id, layout);
          return null;
        }),
    },
    streams: {
      live({ name, params }, emit) {
        let handle;
        try {
          handle = backend.live(name as LiveQueryName, params as never);
        } catch (error) {
          emit({ t: "state", isLoading: false, error: toWireError(error) });
          return () => {};
        }
        let previous: readonly unknown[] | null = null;
        let scheduled = false;
        const send = () => {
          scheduled = false;
          const state = handle.getSnapshot();
          const event: LiveEvent = {
            t: previous === null ? "snapshot" : state.data === previous ? "state" : "diff",
            isLoading: state.isLoading,
            ...(state.error ? { error: toWireError(state.error) } : {}),
          };
          if (event.t === "snapshot") event.rows = state.data.map((v) => ({ v }));
          else if (event.t === "diff") event.rows = encodeRows(previous!, state.data);
          previous = state.data;
          emit(event);
        };
        const off = handle.subscribe(() => {
          if (scheduled) return;
          scheduled = true;
          queueMicrotask(send);
        });
        send();
        return off;
      },
      history(_params, emit) {
        return backend.history.subscribe((scope) =>
          emit({ scope, state: backend.history.state(scope) }),
        );
      },
      status(_params, emit) {
        emit(backend.status.get());
        return backend.status.subscribe(() => emit(backend.status.get()));
      },
      progress({ token }, emit) {
        progress.set(token, emit);
        return () => progress.delete(token);
      },
    },
  };
}
