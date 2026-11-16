// A browser window (and the desktop app's renderer only if it had no services, which it always
// has): the database runs in the page, in PowerSync's worker. `early.ts` has usually started the
// single-tab lock and the local database before this chunk loaded.
import {
  createEventHub,
  createLocalBackend,
  handledOperations,
  markdownExtract,
  reextractIfStale,
} from "@lydie/app/backend";
import { gettingStartedId, LYDIE_VERSION } from "@lydie/contract";
import type { Operations } from "@lydie/contract";
import type { Platform } from "@lydie/platform";
import type { HostServices, WorkspaceScope } from "@lydie/plugin-api";
import { createGettingStarted, createRuntime, uuid } from "@lydie/runtime";
import type { Blob as BlobPort } from "@lydie/runtime";
import { createMemoryPorts } from "@lydie/runtime/memory";
import { deleteWebDatabaseFiles, openWebStore } from "@lydie/store/web";
import { createScopePreference, createSession } from "@lydie/sync";
import type { Session } from "@lydie/sync";

import { ABOUT } from "./compose.ts";
import type { ComposeOptions, Composition } from "./compose.ts";
import {
  DISCARDED_KEY,
  discardedDatabases,
  existingLocalWorkspace,
  FIRST_DB,
  takeEarly,
  WORKSPACE_KEY,
} from "./early.ts";
import type { WorkspaceRecord } from "./early.ts";
import { browserExports } from "./exports.ts";
import {
  apiUrl,
  cachedWorkspaceId,
  cachedWorkspaceName,
  cachedWorkspaceSlug,
  collabApi,
  completeProviderReturn,
  createAccount,
  createHandoff,
  localKv,
  rememberWorkspaceNames,
  webBase,
} from "./hosted.ts";
import type { ProviderReturn } from "./hosted.ts";
import { createWebPlatform } from "./platform.ts";
import { decideScope, linkedScope } from "./scope.ts";
import { takeWelcome } from "./welcome.ts";

// Forgets this browser's workspace: the next local window makes a new one, in a new database.
function discardLocalWorkspace() {
  const record = existingLocalWorkspace();
  if (!record) return;
  localStorage.setItem(
    DISCARDED_KEY,
    JSON.stringify([...new Set([...discardedDatabases(), record.db ?? FIRST_DB])]),
  );
  localStorage.removeItem(WORKSPACE_KEY);
}

// Best effort: a database another tab still shows stays until a later start.
async function deleteDiscardedDatabases(current: string): Promise<void> {
  const names = discardedDatabases().filter((name) => name !== current);
  if (names.length === 0) return;
  const left: string[] = [];
  for (const name of names) {
    await deleteWebDatabaseFiles(name).catch(() => left.push(name));
  }
  if (left.length > 0) localStorage.setItem(DISCARDED_KEY, JSON.stringify(left));
  else localStorage.removeItem(DISCARDED_KEY);
}

function renameLocalWorkspace(name: string) {
  const raw = localStorage.getItem(WORKSPACE_KEY);
  const record = raw ? (JSON.parse(raw) as WorkspaceRecord) : null;
  if (record) localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ ...record, name }));
}

function localWorkspace(): WorkspaceRecord & { created: boolean } {
  const existing = existingLocalWorkspace();
  if (existing) return { ...existing, created: false };
  const id = uuid();
  // The first database's name is free unless a moved workspace still waits there to be deleted.
  const db = discardedDatabases().includes(FIRST_DB)
    ? `lydie-local-${id.slice(0, 8)}.db`
    : FIRST_DB;
  const record: WorkspaceRecord = { id, name: "My notes", ...(db === FIRST_DB ? {} : { db }) };
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(record));
  return { ...record, created: true };
}

async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    // Best effort: without it the browser may evict the notes when the device runs out of space.
  }
}

// Attachment bytes in OPFS (`attachments/<sha256>`), or in memory where OPFS is missing.
async function createBrowserBlob(): Promise<BlobPort> {
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle("attachments", { create: true });
    return {
      async put(key, data) {
        const file = await dir.getFileHandle(key, { create: true });
        const writable = await file.createWritable();
        await writable.write(data as BufferSource);
        await writable.close();
      },
      async get(key) {
        try {
          const file = await (await dir.getFileHandle(key)).getFile();
          return new Uint8Array(await file.arrayBuffer());
        } catch {
          return null;
        }
      },
      async delete(key) {
        await dir.removeEntry(key).catch(() => {});
      },
      async has(key) {
        try {
          await dir.getFileHandle(key);
          return true;
        } catch {
          return false;
        }
      },
    };
  } catch {
    return createMemoryPorts().blob;
  }
}

// The id of a hosted workspace the signed-in user can open, from what a URL calls it (its slug or
// its id). One this browser has listed before is taken at its word, so a reload works offline; a
// new one (a link someone sent) is looked up.
async function resolveWorkspace(session: Session, ref: string): Promise<string | null> {
  const known = cachedWorkspaceId(ref);
  if (known) return known;
  try {
    const list = await session.workspaces();
    rememberWorkspaceNames(list);
    return list.find((w) => w.id === ref || w.slug === ref)?.id ?? null;
  } catch {
    return null;
  }
}

export async function composeBrowser(
  injected: Platform | null,
  options: ComposeOptions,
): Promise<Composition> {
  const platform = injected ?? createWebPlatform();
  const early = takeEarly({ benchmark: options.benchmark ?? false });
  await early.lock;
  const about = { ...ABOUT, version: platform.app.version, shell: "web" };

  // The window's scope, decided once: the workspace the URL names, else the one opened last. Only
  // a hosted scope waits for the stored session (not for the server to confirm it); a local window
  // checks the stored session in the background (it never needs the network to open).
  const session = createSession({
    baseUrl: apiUrl(),
    secrets: platform.secrets,
    version: LYDIE_VERSION,
  });
  const scopes = createScopePreference(localKv);
  // Back from signing in with Google: sign in before choosing the scope.
  const providerReturn = options.benchmark ? null : await completeProviderReturn(session, scopes);
  const linked = options.benchmark ? null : linkedScope(webBase(), window.location.pathname);
  const preferred = options.benchmark ? null : await scopes.get();
  const hostedNamed = (linked ?? preferred)?.kind === "hosted";
  // Its code downloads while the session is read.
  if (hostedNamed) void import("./hosted-lazy.ts").catch(() => {});
  // The stored session, read without the network; the server's check follows in the background.
  const stored = session.load().catch(() => session.state.get());
  void stored.then(() => session.check()).catch(() => {});
  const decision = await decideScope({
    linked,
    preferred,
    signedIn: async () => (await stored).status !== "signed-out",
    resolve: (ref) => resolveWorkspace(session, ref),
  });
  let { scope, wanted } = decision;
  const notice = decision.notice ?? undefined;
  if (scope.kind === "hosted") {
    try {
      const hosted = await composeHosted({
        platform,
        session,
        scopes,
        scope,
        about,
        providerReturn,
      });
      // No local database is open here: a good moment to delete the ones moved to the cloud.
      void deleteDiscardedDatabases("");
      // The workspace opened last is where the app's base goes.
      if (linked || preferred?.workspaceId !== scope.workspaceId) {
        void scopes.set(scope).catch(() => {});
      }
      return { ...hosted, ...(notice ? { notice } : {}) };
    } catch (error) {
      const { SignInRequiredError } = await import("./hosted-lazy.ts");
      if (!(error instanceof SignInRequiredError)) throw error;
      wanted = scope;
      scope = { kind: "local", workspaceId: null };
    }
  }

  const workspace: WorkspaceRecord & { created: boolean } = options.benchmark
    ? { id: "bench", name: "Benchmark", created: false }
    : localWorkspace();
  const dbFilename = options.benchmark ? "lydie-bench.db" : (workspace.db ?? FIRST_DB);
  const t0 = performance.now();
  const [store, blob] = await Promise.all([
    early.store?.dbFilename === dbFilename ? early.store.opening : openWebStore({ dbFilename }),
    createBrowserBlob(),
  ]);
  if (!options.benchmark) void deleteDiscardedDatabases(dbFilename);
  performance.measure("lydie:open-store", { start: t0 });
  // Notes live only here: ask the browser not to evict them under storage pressure. Chromium decides
  // silently, Firefox may ask the user once.
  if (store.persistent && !options.benchmark && !options.embed) void requestPersistentStorage();
  const hub = createEventHub();
  const runtime = createRuntime<Operations>({
    ...store.ports,
    registry: handledOperations(),
    blob,
    exports: browserExports(() => existingLocalWorkspace()?.name ?? workspace.name),
    events: hub.port,
    extract: markdownExtract,
    actor: { type: "user", id: "local" },
  });
  const backend = createLocalBackend({
    store,
    runtime,
    blob,
    events: hub,
    info: {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      persistent: store.persistent,
    },
  });

  const t2 = performance.now();
  let welcomeDocId: string | null = null;
  // A database that only lives in memory starts empty every time: greet again.
  const empty =
    !store.persistent &&
    (await backend.query("doc.children", { workspaceId: workspace.id, parentId: null })).length ===
      0;
  if (workspace.created || empty) {
    const created = await runtime.transaction(
      "Getting started",
      (ops) => createGettingStarted(ops, { workspaceId: workspace.id, mode: "browser" }),
      { history: false, activity: false },
    );
    welcomeDocId = created?.id ?? null;
  }

  performance.measure("lydie:first-run", { start: t2 });
  // Bodies indexed by an older extractor get their links and blocks again, once, when the app is
  // idle: it shares the one database connection with the first screen's queries.
  if (!options.benchmark) {
    const idle =
      (globalThis as { requestIdleCallback?: (fn: () => void) => void }).requestIdleCallback ??
      ((fn: () => void) => setTimeout(fn, 1000));
    idle(() => void reextractIfStale(store, runtime, workspace.id).catch(console.error));
  }
  const account = createAccount({
    session,
    scopes,
    scope: { kind: "local", workspaceId: workspace.id },
    wanted,
    localWorkspace: { id: workspace.id, name: workspace.name, kind: "browser", current: true },
    handoff: createHandoff({
      session,
      store,
      workspaceId: workspace.id,
      blob,
      async changedSince(since) {
        let from = since ?? "";
        if (since === null) {
          // With no time to count from: since the Getting started page and its pages were
          // written (a few operations, so a few seconds are allowed), when the workspace was made.
          const [welcome] = await backend
            .query("doc.get", { id: gettingStartedId(workspace.id) })
            .catch(() => []);
          const made = welcome ? Date.parse(welcome.document.createdAt) : Number.NaN;
          if (!Number.isNaN(made)) from = new Date(made + 5000).toISOString();
        }
        // Live pages by last change (a body save counts), newest first.
        const recent = await backend.query("doc.recent", { workspaceId: workspace.id, limit: 500 });
        return recent.filter((doc) => doc.updatedAt > from).length;
      },
      // Not in a database that lives in memory: there is nothing to forget, and it is not the
      // person's lasting copy.
      discard: async () => {
        if (store.persistent && !options.benchmark) discardLocalWorkspace();
      },
    }),
    sync: null,
    providerReturn,
  });
  return {
    platform,
    backend,
    welcomeDocId,
    ...(notice ? { notice } : {}),
    services: {
      account,
      about,
      renameWorkspace: async (name) => renameLocalWorkspace(name),
    },
    local: {
      async seedLarge(onProgress) {
        // One SQL query; the doc.listChildren operation counts children one query at a time.
        if (
          (await backend.query("doc.children", { workspaceId: workspace.id, parentId: null }))
            .length > 0
        )
          return;
        const { seedWorkspace } = await import("../../../scripts/seed/seed.ts");
        await seedWorkspace(store, {
          workspaceId: workspace.id,
          notes: 10_000,
          dbRows: 5_000,
          blocks: 2_000,
          bigFolder: 5_000,
          onProgress,
        });
      },
    },
  };
}

// A hosted window: the user's synced database, the sync engine and the collab pool.
async function composeHosted(options: {
  platform: Platform;
  session: Session;
  scopes: ReturnType<typeof createScopePreference>;
  scope: WorkspaceScope & { kind: "hosted" };
  about: NonNullable<HostServices["about"]>;
  providerReturn: ProviderReturn | null;
}): Promise<Composition> {
  const { platform, session, scope } = options;
  const [{ colourFor, createHostedBackendParts }, blob] = await Promise.all([
    import("./hosted-lazy.ts"),
    createBrowserBlob(),
  ]);
  const hub = createEventHub();
  const t0 = performance.now();
  const parts = await createHostedBackendParts({
    scope,
    baseUrl: session.baseUrl,
    version: LYDIE_VERSION,
    secrets: platform.secrets,
    session,
    openStore: ({ dbFilename, mode }) => openWebStore({ dbFilename, mode }),
    createRuntime: ({ store, actor }) =>
      createRuntime<Operations>({
        ...store.ports,
        registry: handledOperations(),
        blob,
        events: hub.port,
        extract: markdownExtract,
        actor,
      }),
    blob,
    // Offline edits to bodies live in the same database as everything else.
    yjs: (_user, store) => store.yjs,
  });
  performance.measure("lydie:open-hosted", { start: t0 });
  const backend = createLocalBackend({
    store: parts.store,
    runtime: parts.runtime,
    blob,
    events: hub,
    info: {
      mode: "synced",
      workspaceId: scope.workspaceId,
      workspaceName: cachedWorkspaceName(scope.workspaceId) ?? "Workspace",
      workspaceSlug: cachedWorkspaceSlug(scope.workspaceId),
      persistent: (parts.store as { persistent?: boolean }).persistent ?? true,
    },
    status: {
      get: () => parts.backendStatus.get(),
      subscribe: (listener) => parts.backendStatus.subscribe(listener),
      dismissRejected: (ids) => parts.sync.dismissRejected(ids),
    },
    ...(parts.sync.attachments
      ? {
          resolveRemoteUrl: (id: string) =>
            parts.sync.attachments!.downloadUrl(id).catch(() => null),
        }
      : {}),
  });
  // Connecting must not hold up the first paint: everything reads the local database.
  void parts.start().catch((error: unknown) => console.warn("Sync did not start", error));
  parts.needsReopen.subscribe((reopen) => {
    if (reopen) window.location.reload();
  });
  // The name for next time (and the workspace switcher).
  void session
    .workspaces()
    .then(rememberWorkspaceNames)
    .catch(() => {});
  const user = { name: parts.user.name || parts.user.email, color: colourFor(parts.user.id) };
  // The switcher offers this browser's workspace too, once it exists.
  const browserWorkspace = existingLocalWorkspace();
  const account = createAccount({
    session,
    scopes: options.scopes,
    scope,
    wanted: null,
    localWorkspace: browserWorkspace
      ? { ...browserWorkspace, kind: "browser", current: false }
      : null,
    handoff: null,
    sync: parts.sync,
    providerReturn: options.providerReturn,
  });
  return {
    platform,
    backend,
    welcomeDocId: takeWelcome(scope.workspaceId),
    local: null,
    services: {
      account,
      about: options.about,
      ...(parts.collab ? { collab: collabApi(parts.collab, user) } : {}),
    },
  };
}
