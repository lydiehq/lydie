import { isLydieError, LydieError } from "@lydie/contract";
import type {
  Attachment,
  DatabaseDefinition,
  InputOf,
  LydieEvent,
  OperationId,
  Operations,
  OutputOf,
} from "@lydie/contract";
import type {
  Backend,
  BackendInfo,
  BackendOps,
  BackendStatus,
  LiveParams,
  LiveQueryName,
  LiveRow,
  LiveState,
  OperationOptions,
} from "@lydie/plugin-api";
import { addAttachment, uuid } from "@lydie/runtime";
import type { Blob as BlobPort, Events, Runtime } from "@lydie/runtime";
import { queries } from "@lydie/store";
import type { LiveQuery, Store, StoreQuery } from "@lydie/store";

import { liveDefinition, liveView, queryDefinition, viewItems } from "./databases.ts";
import type { PropertyIndex } from "./databases.ts";
import { createLiveRegistry, liveKey, stabilize } from "./live-registry.ts";
import {
  OPTIMISTIC_OPS,
  patcherFor,
  pendingHistory,
  recordedLabel,
  viewPatcher,
} from "./optimistic.ts";
import type { PatchContext, Patcher } from "./optimistic.ts";

// Store-backed queries other than database views need no context.
const noContext: PatchContext = { properties: () => null };
import type { LiveSource } from "./live-registry.ts";

export type LocalBackendOptions = {
  store: Store;
  runtime: Runtime<Operations>;
  info: Omit<BackendInfo, "mode"> & { mode?: BackendInfo["mode"] };
  // Where attachment bytes live (the runtime's blob port). Without it attachments cannot be added.
  blob?: BlobPort;
  // Domain events published after commit (see `createEventHub`); re-runs queries the store cannot
  // watch by itself (the trash list). Without it they re-run after this backend's own mutations.
  events?: EventHub;
  lingerMs?: number;
  // Replaces the store's status, e.g. a hosted window's sync status (`@lydie/sync`'s
  // `parts.backendStatus`).
  status?: {
    get: () => BackendStatus;
    subscribe: (listener: () => void) => () => void;
    dismissRejected?: (operationIds?: readonly string[]) => void;
  };
  // Hosted mode: a URL for attachment bytes that are not on this device yet.
  resolveRemoteUrl?: (attachmentId: string) => Promise<string | null>;
};

// The in-process backend has two extras the transport needs.
export type LocalBackend = Backend & {
  readAttachment(id: string): Promise<{ data: Uint8Array; contentType: string } | null>;
  // Where to fetch bytes that are not local (hosted mode), or null.
  remoteAttachmentUrl(id: string): Promise<string | null>;
  // Called by the transport so remote subscribers see the same history state.
  readonly runtime: Runtime<Operations>;
};

// Fans out the runtime's events port to listeners: pass `hub.port` as `createRuntime({ events })`.
export type EventHub = {
  port: Events;
  subscribe(listener: (events: readonly LydieEvent[]) => void): () => void;
};

export function createEventHub(next?: Events): EventHub {
  const listeners = new Set<(events: readonly LydieEvent[]) => void>();
  return {
    port: {
      async publish(events) {
        for (const listener of [...listeners]) listener(events);
        await next?.publish(events);
      },
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function toExecuteOptions(options: OperationOptions | undefined) {
  if (!options) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of ["scope", "coalesce", "history", "sessionId", "label", "onProgress"] as const) {
    if (options[key] !== undefined) out[key] = options[key];
  }
  return out;
}

// `ops.doc.move(input, options)` over any `execute`.
export function opsProxy(
  execute: (id: string, input: unknown, options?: OperationOptions) => Promise<unknown>,
): BackendOps {
  const namespaces = new Map<string, object>();
  return new Proxy({} as BackendOps, {
    get(_, ns) {
      if (typeof ns !== "string") return undefined;
      let proxy = namespaces.get(ns);
      if (!proxy) {
        proxy = new Proxy(
          {},
          {
            get: (_t, method) =>
              typeof method === "string"
                ? (input: unknown, options?: OperationOptions) =>
                    execute(`${ns}.${method}`, input, options)
                : undefined,
          },
        );
        namespaces.set(ns, proxy);
      }
      return proxy;
    },
  });
}

// The hosted space filter of the tree queries, only when given (`teamspaceId: null` is a filter).
const spaceOf = (p: { teamspaceId?: string | null; privateOwnerId?: string }) => ({
  ...(p.teamspaceId !== undefined ? { teamspaceId: p.teamspaceId } : {}),
  ...(p.privateOwnerId !== undefined ? { privateOwnerId: p.privateOwnerId } : {}),
});

type StoreBacked = { [N in LiveQueryName]?: (params: LiveParams<N>) => StoreQuery<LiveRow<N>> };

const storeQueries: StoreBacked = {
  "doc.children": (p) =>
    queries.children(p.workspaceId, p.parentId, {
      includeDeleted: p.includeDeleted ?? false,
      ...spaceOf(p),
    }),
  "doc.tree": (p) =>
    queries.listTree(p.workspaceId, {
      ...(p.rootId ? { rootId: p.rootId } : {}),
      ...(p.includeDeleted ? { includeDeleted: true } : {}),
      ...(p.expanded ? { expanded: p.expanded } : {}),
      ...spaceOf(p),
    }),
  "doc.get": (p) => queries.getDoc(p.id, { includeBody: p.includeBody ?? false }),
  "doc.recent": (p) =>
    queries.recent(p.workspaceId, p.limit === undefined ? {} : { limit: p.limit }),
  "doc.search": (p) =>
    queries.search(p.workspaceId, p.text, p.limit === undefined ? {} : { limit: p.limit }),
  "doc.backlinks": (p) => queries.backlinks(p.id),
  "doc.links": (p) => queries.outgoingLinks(p.id),
  "doc.blockBacklinks": (p) => queries.blockBacklinks(p.id, p.blockId),
  "doc.unresolvedLinks": (p) => queries.unresolvedLinks(p.workspaceId),
  "doc.unlinkedMentions": (p) =>
    queries.unlinkedMentions(
      p.workspaceId,
      p.targetId,
      p.phrases,
      p.limit === undefined ? {} : { limit: p.limit },
    ),
  "attachment.list": (p) =>
    queries.attachments(p.workspaceId, {
      ...(p.documentId ? { documentId: p.documentId } : {}),
      ...(p.includeDeleted ? { includeDeleted: true } : {}),
    }),
  "thread.list": (p) => queries.threads(p.documentId),
  "database.list": (p) => queries.databases(p.workspaceId),
  "database.properties": (p) => queries.databaseProperties(p.databaseId),
  "workspace.get": (p) => queries.workspace(p.workspaceId),
  "workspace.members": (p) => queries.workspaceMembers(p.workspaceId),
  "workspace.teamspaces": (p) => queries.teamspaces(p.workspaceId),
  "teamspace.members": (p) => queries.teamspaceMembers(p.teamspaceId),
  "doc.access": (p) => queries.myAccess(p.id),
  "doc.grants": (p) => queries.grants(p.id),
};

export function createLocalBackend(options: LocalBackendOptions): LocalBackend {
  const { store, runtime } = options;
  const info: BackendInfo = { mode: store.mode, ...options.info };
  const registry = createLiveRegistry({
    ...(options.lingerMs !== undefined ? { lingerMs: options.lingerMs } : {}),
  });
  // Re-runs of queries that are not store-watchable.
  const changed = new Set<() => void>();
  const signalChange = () => {
    for (const listener of [...changed]) listener();
  };
  const offEvents = options.events?.subscribe(signalChange);

  // Optimistic paint: renames and moves patch the cached results of the live queries that show
  // them before the database round trip (a worker hop and a re-query on the web); the store's
  // emission then replaces the patch. On failure the last real state comes back.
  const optimists = new Set<(op: string, input: unknown) => (() => void) | null>();
  // Operations not yet committed. Undo waits for them: the UI already shows their result, so a
  // quick Cmd+Z means "undo that", not the step before it.
  const inflight = new Set<Promise<void>>();
  const history = pendingHistory(runtime.history);
  const settled = async () => {
    while (inflight.size > 0) await Promise.all([...inflight]);
  };
  const optimistic = (op: string, input: unknown) => {
    const undo: (() => void)[] = [];
    for (const patch of optimists) {
      const revert = patch(op, input);
      if (revert) undo.push(revert);
    }
    return () => {
      for (const revert of undo) revert();
    };
  };

  const execute = async (id: string, input: unknown, opOptions?: OperationOptions) => {
    if (!(id in runtime.registry)) {
      throw new LydieError("unknown_operation", `Unknown operation: ${id}`);
    }
    // A new document gets its id here, so its optimistic row is the row that arrives.
    if (id === "doc.create" && input && typeof input === "object" && !("id" in input)) {
      input = { ...input, id: uuid() };
    }
    const revert = OPTIMISTIC_OPS.has(id) ? optimistic(id, input) : null;
    const recorded = recordedLabel(id, opOptions);
    const endPending = recorded ? history.begin(opOptions?.scope ?? "default", recorded) : null;
    let result: unknown;
    let settle!: () => void;
    const running = new Promise<void>((resolve) => (settle = resolve));
    inflight.add(running);
    try {
      result = await runtime.execute(
        id as OperationId,
        input as never,
        toExecuteOptions(opOptions),
      );
    } catch (error) {
      revert?.();
      throw error;
    } finally {
      inflight.delete(running);
      settle();
      endPending?.();
    }
    if (!options.events && runtime.registry[id as OperationId].kind === "mutation") signalChange();
    return result;
  };

  const storeSource =
    <T>(query: StoreQuery<T> | (() => LiveQuery<T>), patcher?: Patcher<T>): LiveSource<T> =>
    (emit) => {
      const live = typeof query === "function" ? query() : store.live(query);
      // The store hands out a new state object per emission even when nothing changed.
      let last: LiveState<T> | null = null;
      // Optimistic patches stack on what is shown (an earlier one may not have committed yet).
      let shown: LiveState<T> | null = null;
      const off = live.subscribe(() => {
        const next = live.state as LiveState<T>;
        if (
          last &&
          last.data === next.data &&
          last.isLoading === next.isLoading &&
          last.error === next.error
        ) {
          return;
        }
        last = next;
        shown = null;
        emit(next);
      });
      const optimist = patcher
        ? (op: string, input: unknown) => {
            const base = shown ?? last;
            if (!last || !base || base.isLoading) return null;
            const data = patcher(base.data, op, input);
            if (!data) return null;
            const real = last;
            const patched = { ...base, data };
            shown = patched;
            emit(patched);
            return () => {
              if (shown === patched && last === real) {
                shown = null;
                emit({ ...real });
              }
            };
          }
        : null;
      if (optimist) optimists.add(optimist);
      return () => {
        if (optimist) optimists.delete(optimist);
        off();
        void live.close();
      };
    };

  // The trash is a contract query, not a store query: run it and re-run it on change.
  const trashSource =
    (params: LiveParams<"trash.list">): LiveSource<LiveRow<"trash.list">> =>
    (emit) => {
      let state: LiveState<LiveRow<"trash.list">> = { data: [], isLoading: true, error: undefined };
      let stopped = false;
      let running = false;
      let again = false;
      const run = async () => {
        if (running) {
          again = true;
          return;
        }
        running = true;
        try {
          const { items } = await runtime.ops.trash.list({
            workspaceId: params.workspaceId,
            ...(params.limit ? { limit: params.limit } : {}),
          });
          const data = stabilize(state.data, items, (row) => `${row.kind}:${row.id}`);
          if (!stopped && (data !== state.data || state.isLoading || state.error)) {
            state = { data, isLoading: false, error: undefined };
            emit(state);
          }
        } catch (error) {
          if (!stopped) {
            state = { ...state, isLoading: false, error: toError(error) };
            emit(state);
          }
        } finally {
          running = false;
          if (again && !stopped) {
            again = false;
            void run();
          }
        }
      };
      changed.add(run);
      void run();
      return () => {
        stopped = true;
        changed.delete(run);
      };
    };

  const backend: LocalBackend = {
    info,
    runtime,
    ops: opsProxy(execute),
    execute: execute as Backend["execute"],
    async transaction(label, fn, opOptions) {
      const result = await runtime.transaction(
        label,
        (txOps) =>
          fn(
            opsProxy((id, input) => {
              const [ns, method] = id.split(".") as [string, string];
              const group = (txOps as unknown as Record<string, Record<string, unknown>>)[ns];
              const call = group?.[method];
              if (typeof call !== "function") {
                throw new LydieError("unknown_operation", `Unknown operation: ${id}`);
              }
              return (call as (input: unknown) => Promise<unknown>)(input);
            }),
          ),
        toExecuteOptions(opOptions),
      );
      if (!options.events) signalChange();
      return result;
    },
    live<N extends LiveQueryName>(name: N, params: LiveParams<N>) {
      return registry.get(
        liveKey(name, params),
        () => {
          if (name === "trash.list") {
            return trashSource(params as LiveParams<"trash.list">) as unknown as LiveSource<
              LiveRow<N>
            >;
          }
          if (name === "database.get") {
            const { id } = params as LiveParams<"database.get">;
            return storeSource(
              () => liveDefinition(store, id),
              patcherFor(name, params, noContext) as Patcher<DatabaseDefinition>,
            ) as unknown as LiveSource<LiveRow<N>>;
          }
          if (name === "database.view") {
            const p = params as LiveParams<"database.view">;
            const index: PropertyIndex = { byId: new Map() };
            return storeSource(
              () => liveView(store, p, index),
              viewPatcher(p, { properties: () => [...index.byId.values()] }),
            ) as unknown as LiveSource<LiveRow<N>>;
          }
          const build = storeQueries[name] as
            | ((p: LiveParams<N>) => StoreQuery<LiveRow<N>>)
            | undefined;
          if (!build) throw new LydieError("invalid_input", `Unknown live query: ${name}`);
          return storeSource(
            build(params),
            patcherFor(name, params, noContext) as Patcher<LiveRow<N>> | undefined,
          );
        },
        lingerFor(name, options.lingerMs),
      );
    },
    async query<N extends LiveQueryName>(name: N, params: LiveParams<N>) {
      if (name === "trash.list") {
        const p = params as LiveParams<"trash.list">;
        const { items } = await runtime.ops.trash.list({
          workspaceId: p.workspaceId,
          ...(p.limit ? { limit: p.limit } : {}),
        });
        return items as unknown as readonly LiveRow<N>[];
      }
      if (name === "database.get") {
        const { id } = params as LiveParams<"database.get">;
        return (await queryDefinition(store, id)) as unknown as readonly LiveRow<N>[];
      }
      if (name === "database.view") {
        const result = await store.queryView(params as LiveParams<"database.view">);
        return viewItems(result) as unknown as readonly LiveRow<N>[];
      }
      const build = storeQueries[name] as
        | ((p: LiveParams<N>) => StoreQuery<LiveRow<N>>)
        | undefined;
      if (!build) throw new LydieError("invalid_input", `Unknown query: ${name}`);
      return store.query(build(params));
    },
    history: {
      undo: async (scope) => {
        await settled();
        const done = await runtime.history.undo(scope);
        if (!options.events) signalChange();
        return done;
      },
      redo: async (scope) => {
        await settled();
        const done = await runtime.history.redo(scope);
        if (!options.events) signalChange();
        return done;
      },
      canUndo: (scope) => history.state(scope).canUndo,
      canRedo: (scope) => history.state(scope).canRedo,
      state: (scope) => history.state(scope),
      subscribe: (listener) => history.subscribe(listener),
    },
    status: options.status
      ? {
          get: () => options.status!.get(),
          subscribe: (listener) => options.status!.subscribe(listener),
          ...(options.status.dismissRejected
            ? {
                dismissRejected: (ids?: readonly string[]) => options.status!.dismissRejected!(ids),
              }
            : {}),
        }
      : {
          get: (): BackendStatus => store.status.get(),
          subscribe: (listener) => store.status.subscribe(() => listener()),
        },
    attachments: {
      async add(input, opOptions) {
        if (!options.blob) throw new LydieError("internal", "Attachments are not available here");
        return addAttachment(runtime, options.blob, input, toExecuteOptions(opOptions));
      },
      async url(id) {
        const found = await backend.readAttachment(id);
        if (!found) return backend.remoteAttachmentUrl(id);
        return URL.createObjectURL(new Blob([found.data as BlobPart], { type: found.contentType }));
      },
    },
    remoteAttachmentUrl: async (id) =>
      options.resolveRemoteUrl ? options.resolveRemoteUrl(id) : null,
    async readAttachment(id) {
      if (!options.blob) return null;
      let attachment: Attachment;
      try {
        attachment = await runtime.ops.attachment.get({ id });
      } catch (error) {
        if (isLydieError(error) && error.code === "not_found") return null;
        throw error;
      }
      const data = await options.blob.get(attachment.sha256);
      return data ? { data, contentType: attachment.contentType } : null;
    },
    layouts: {
      load: (id) => store.layouts.load(id),
      save: (id, layout) => store.layouts.save(id, layout),
    },
    async close() {
      offEvents?.();
      changed.clear();
      registry.close();
    },
  };
  return backend;
}

// Windows of a database view come and go as a list scrolls; each live one re-runs on every
// change, so they linger briefly instead of the registry's 10 s.
export const VIEW_LINGER_MS = 1000;

export function lingerFor(name: string, lingerMs: number | undefined): { lingerMs?: number } {
  if (name !== "database.view") return {};
  return { lingerMs: Math.min(lingerMs ?? VIEW_LINGER_MS, VIEW_LINGER_MS) };
}

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

// Re-exported for implementers that need the result types.
export type { InputOf, OutputOf };
