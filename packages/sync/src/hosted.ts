// Composition: what an app needs to run a window in hosted scope.
import { queries } from "@lydie/store";
import type { Store } from "@lydie/store";

import type { PutTransport } from "./attachments.ts";
import { createCollab } from "./collab/collab.ts";
import type { Collab, CollabUser } from "./collab/collab.ts";
import type { YjsPersistence } from "./collab/persistence.ts";
import { createSession, hostedDatabaseName } from "./session.ts";
import type { Session, SessionUser, WindowScope } from "./session.ts";
import { createHostedSync, toBackendStatus } from "./sync.ts";
import type { BackendStatusShape, HostedSync, SyncStatus } from "./sync.ts";
import { createObservable } from "./types.ts";
import type { BlobPort, FetchLike, Observable, SecretStorage, UserActor } from "./types.ts";

export class SignInRequiredError extends Error {
  override readonly name = "SignInRequiredError";
  constructor() {
    super("Sign in to open a hosted workspace");
  }
}

export type HostedPartsOptions<R> = {
  // The window's scope, decided once at startup (`createScopePreference().choose`).
  scope: WindowScope & { kind: "hosted" };
  // The core's API origin.
  baseUrl: string;
  // The contract's `LYDIE_VERSION` (sent as `Lydie-Version`).
  version: string;
  secrets: SecretStorage;
  // Opens the user's database in synced mode: `openWebStore` / `openNodeStore` from @lydie/store.
  openStore(options: { dbFilename: string; mode: "synced" }): Promise<Store>;
  // `createRuntime({ ...store.ports, actor, blob, events, extract })` from @lydie/runtime. The app
  // decides the extractor, blob and events, so the runtime is built there.
  createRuntime(context: { store: Store; actor: UserActor; user: SessionUser }): R;
  // Local attachment bytes (the runtime's blob port).
  blob?: BlobPort;
  // Yjs persistence for collab, e.g. `(_, store) => store.yjs`. Without it no collab pool is created
  // (Electron main: the renderer runs collab, see INTEGRATION.md).
  yjs?: (user: SessionUser, store: Store) => YjsPersistence;
  // An existing session for `baseUrl` (to share one between windows); default: a new one.
  session?: Session;
  fetch?: FetchLike;
  put?: PutTransport;
  WebSocketPolyfill?: unknown;
};

export type HostedParts<R> = {
  readonly scope: WindowScope & { kind: "hosted" };
  readonly workspaceId: string;
  readonly user: SessionUser;
  readonly session: Session;
  readonly store: Store;
  readonly runtime: R;
  readonly sync: HostedSync;
  readonly collab: Collab | null;
  readonly status: Observable<SyncStatus>;
  // Plugs into `Backend.status` (`{ get, subscribe }` with the plugin API's `BackendStatus`).
  readonly backendStatus: {
    get(): BackendStatusShape;
    subscribe(listener: () => void): () => void;
  };
  // True once a different user signed in under this window: sync stopped, the window must reopen.
  readonly needsReopen: Observable<boolean>;
  // Connects sync. Call after the backend is built.
  start(): Promise<void>;
  close(): Promise<void>;
};

// Resolves once the document's access row has synced down: the server has the page and the
// user's level in it. Rejects when aborted.
export function whenServerHas(store: Store, docId: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error("aborted"));
    const live = store.live(queries.myAccess(docId));
    const finish = (ok: boolean) => {
      off();
      signal.removeEventListener("abort", onAbort);
      void live.close();
      if (ok) resolve();
      else reject(new Error("aborted"));
    };
    const check = () => {
      if (live.state.data[0]?.level) finish(true);
    };
    const onAbort = () => finish(false);
    const off = live.subscribe(check);
    signal.addEventListener("abort", onAbort);
    check();
  });
}

const COLOURS = ["#e5484d", "#f76b15", "#ffc53d", "#46a758", "#12a594", "#0090ff", "#8e4ec6"];

// A stable caret colour per user.
export function colourFor(userId: string): string {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return COLOURS[Math.abs(hash) % COLOURS.length]!;
}

// Restores the session, opens the user's synced database and builds the runtime, sync engine and
// collab pool for one hosted window. Throws SignInRequiredError when nobody is signed in. An
// expired session still opens (the data is local); sync resumes after the next sign-in.
export async function createHostedBackendParts<R>(
  options: HostedPartsOptions<R>,
): Promise<HostedParts<R>> {
  const session =
    options.session ??
    createSession({
      baseUrl: options.baseUrl,
      secrets: options.secrets,
      version: options.version,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  const state = options.session ? session.state.get() : await session.restore();
  if (state.status === "signed-out") throw new SignInRequiredError();
  const user = state.user;

  const store = await options.openStore({
    dbFilename: hostedDatabaseName(user.id),
    mode: "synced",
  });
  if (store.mode !== "synced") {
    await store.close();
    throw new Error("The hosted store must be opened in synced mode");
  }
  const runtime = options.createRuntime({ store, actor: { type: "user", id: user.id }, user });
  const sync = createHostedSync({
    store,
    api: session.api,
    session: session.state,
    ...(options.blob ? { blob: options.blob } : {}),
    ...(options.put ? { put: options.put } : {}),
  });
  const collabUser: CollabUser = { name: user.name || user.email, color: colourFor(user.id) };
  const collab = options.yjs
    ? createCollab({
        api: session.api,
        persistence: options.yjs(user, store),
        gate: (docId, signal) => whenServerHas(store, docId, signal),
        user: collabUser,
        ...(options.WebSocketPolyfill ? { WebSocketPolyfill: options.WebSocketPolyfill } : {}),
      })
    : null;

  const needsReopen = createObservable(false);
  const offSession = session.state.subscribe((next) => {
    if (next.status === "signed-in" && next.user.id !== user.id) {
      needsReopen.set(true);
      void sync.stop();
      void collab?.close();
    }
  });

  let backend = toBackendStatus(sync.status.get());
  return {
    scope: options.scope,
    workspaceId: options.scope.workspaceId,
    user,
    session,
    store,
    runtime,
    sync,
    collab,
    status: sync.status,
    backendStatus: {
      get() {
        const next = toBackendStatus(sync.status.get());
        if (JSON.stringify(next) !== JSON.stringify(backend)) backend = next;
        return backend;
      },
      subscribe: (listener) => sync.status.subscribe(() => listener()),
    },
    needsReopen,
    async start() {
      await sync.start();
      // Offline edits from earlier sessions go up without the user opening those documents.
      void collab?.pushPending().catch(() => {});
    },
    async close() {
      offSession();
      await collab?.close();
      await sync.stop();
      await store.close();
    },
  };
}
