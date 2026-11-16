// The desktop app's renderer side of accounts and hosted windows. The main process holds the session
// and the hosted database (`apps/desktop/src/main/hosted.ts`); this window talks to it over the
// account service and runs collab itself, with tokens from main.
import { serviceClient, toPlatformError } from "@lydie/platform";
import type {
  FolderRef,
  Platform,
  ServiceChannel,
  ServiceClient,
  ServiceDefinition,
} from "@lydie/platform";
import type { Backend, Observable } from "@lydie/plugin-api";
import type {
  AccountApi,
  AccountState,
  HandoffApi,
  HandoffPlanHandle,
  HostedApiError,
  LocalWorkspaceSummary,
  SyncDetails,
  WorkspaceScope,
} from "@lydie/plugin-api/hosted";
import { createApiCaller } from "@lydie/sdk";
import { accountService, hostedDatabaseName } from "@lydie/sync";
import type {
  AccountServiceContract,
  AccountWireState,
  Collab,
  SyncWire,
  WindowScopeInfo,
  Wire,
} from "@lydie/sync";

import { rememberWelcome } from "./welcome.ts";

export type AccountClient = ServiceClient<AccountServiceContract>;

export function accountClient(channel: ServiceChannel): AccountClient {
  return serviceClient(
    channel,
    accountService as unknown as ServiceDefinition<AccountServiceContract>,
  );
}

// The value of a wire envelope, or the hosted error it carries.
export function unwrap<T>(wire: Wire<T>): T {
  if (wire.ok) return wire.value;
  const error = new Error(wire.error.message) as HostedApiError;
  error.kind = wire.error.kind;
  if (wire.error.status !== null) error.status = wire.error.status;
  error.code = wire.error.code;
  throw error;
}

// A value the main process pushes on a stream, starting from `current`. The stream is joined first,
// so a change made while the answer to `current` is on its way is not lost.
async function followed<T>(
  current: Promise<T>,
  subscribe: (set: (value: T) => void) => () => void,
): Promise<Observable<T>> {
  let value: T | undefined;
  let pushed = false;
  const listeners = new Set<() => void>();
  subscribe((next) => {
    value = next;
    pushed = true;
    for (const listener of [...listeners]) listener();
  });
  const first = await current;
  if (!pushed) value = first;
  return {
    get: () => value as T,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const toState = (wire: AccountWireState): AccountState =>
  wire.status === "signed-out" ? wire : { status: wire.status, user: wire.user };

function toDetails(wire: SyncWire): SyncDetails {
  const uploading: Record<string, number> = {};
  for (const [id, p] of Object.entries(wire.uploading)) uploading[id] = p.total - p.loaded;
  return {
    state: wire.state,
    pendingOperations: wire.pendingOperations,
    pendingUploads: wire.pendingUploads,
    uploading,
    rejected: wire.rejectedChanges.map((r) => ({
      operationId: r.operationId,
      operation: r.operation,
      reason: r.reason,
      rejectedAt: r.rejectedAt,
    })),
    lastSyncedAt: wire.lastSyncedAt,
    error: wire.error,
    retryAt: wire.retryAt,
  };
}

// Where public links and invitations point (the web app).
const WEB_URL =
  (import.meta.env.VITE_LYDIE_WEB_URL as string | undefined) ?? "https://app.lydie.co/";

// The recently opened folders, this window's first if it has one.
async function recentFolders(platform: Platform): Promise<LocalWorkspaceSummary[]> {
  const current = platform.scope.kind === "local" ? platform.scope.folder : null;
  const recent = await platform.folders.recent().catch(() => []);
  const list: LocalWorkspaceSummary[] = recent.map((f) => ({
    id: f.id,
    name: f.name,
    kind: "folder",
    ...(f.path ? { path: f.path } : {}),
    current: f.id === current?.id,
  }));
  if (current && !list.some((f) => f.current)) {
    list.unshift({
      id: current.id,
      name: current.name,
      kind: "folder",
      ...(current.path ? { path: current.path } : {}),
      current: true,
    });
  }
  return list;
}

// Shows a folder in place of this window (the scope of a window never changes).
async function replaceWithFolder(platform: Platform, folder: FolderRef) {
  try {
    await platform.windows.open({ scope: { kind: "local", folder }, replace: true });
  } catch (error) {
    throw new Error(`Could not open ${folder.name}: ${toPlatformError(error).detail}`);
  }
}

export async function desktopAccount(
  client: AccountClient,
  info: WindowScopeInfo,
  platform: Platform,
): Promise<AccountApi> {
  const folder = platform.scope.kind === "local" ? platform.scope.folder : null;
  const hosted = info.scope?.kind === "hosted";
  const [folders, state, details] = await Promise.all([
    recentFolders(platform),
    followed(client.request("state", null).then(toState), (set) =>
      client.subscribe("state", null, (next) => set(toState(next))),
    ),
    hosted
      ? followed<SyncDetails | null>(
          client.request("sync", null).then((first) => (first ? toDetails(first) : null)),
          (set) => client.subscribe("sync", null, (next) => set(toDetails(next))),
        )
      : null,
  ]);
  const caller = createApiCaller(async (request) =>
    unwrap(await client.request("request", request)),
  );
  const openScope = async (scope: WorkspaceScope) => {
    // A folder window cannot reload into a hosted workspace: a new window shows it, and this one
    // closes.
    if (folder && scope.kind === "hosted") {
      await client.request("openHostedWindow", { workspaceId: scope.workspaceId });
      platform.windows.close();
      return;
    }
    await client.request("setScope", { scope });
    window.location.reload();
  };
  return {
    apiUrl: info.apiUrl,
    scope: info.scope ?? { kind: "local", workspaceId: null },
    wanted: info.wanted,
    state,
    signIn: async (input) => unwrap(await client.request("signIn", input)),
    verifySignIn: async (input) => unwrap(await client.request("verifySignIn", input)),
    twoFactor: {
      hasPassword: async () => unwrap(await client.request("twoFactorHasPassword", null)),
      enable: async (password) => unwrap(await client.request("twoFactorEnable", { password })),
      confirm: async (code) => void unwrap(await client.request("twoFactorConfirm", { code })),
      disable: async (password) =>
        void unwrap(await client.request("twoFactorDisable", { password })),
      backupCodes: async (password) =>
        unwrap(await client.request("twoFactorBackupCodes", { password })),
    },
    setImage: async (image) => unwrap(await client.request("setImage", { image })),
    signUp: async (input) => unwrap(await client.request("signUp", input)),
    signInWith: async (provider) => unwrap(await client.request("signInWith", { provider })),
    cancelSignInWith: () => void client.request("cancelSignInWith", null),
    // The desktop app signs in without leaving the window.
    takeProviderReturn: () => null,
    async signOut() {
      await client.request("signOut", null);
      if (hosted) await openScope({ kind: "local", workspaceId: null });
    },
    workspaces: async () => unwrap(await client.request("workspaces", null)),
    async createWorkspace(input) {
      const created = unwrap(await client.request("createWorkspace", input));
      if (input.gettingStarted) rememberWelcome(created.id);
      return created;
    },
    localWorkspaces: () => folders,
    async openLocalWorkspace(id) {
      const target = folders.find((f) => f.id === id);
      if (!target || target.current) return;
      await replaceWithFolder(platform, {
        id: target.id,
        name: target.name,
        ...(target.path ? { path: target.path } : {}),
      });
    },
    openFolder: async () => {
      const picked = await platform.folders.pick({ title: "Open a folder of notes" });
      if (picked) await replaceWithFolder(platform, picked);
    },
    openScope,
    call: (id, input) => caller.call(id, input as never) as never,
    callContract: (id, input) => caller.call(id as never, input as never) as never,
    handoff: folder ? desktopHandoff(client) : null,
    sync: details
      ? {
          details: details as Observable<SyncDetails>,
          retry: () => void client.request("retrySync", null),
        }
      : null,
    webUrl: (path) => new URL(path.replace(/^\//, ""), WEB_URL).toString(),
  };
}

// "Copy to cloud" from a folder window: the main process reads the folder's database and
// copies it into the hosted workspace; the folder itself is not changed.
function desktopHandoff(client: AccountClient): HandoffApi {
  const plans = new WeakMap<HandoffPlanHandle, string>();
  return {
    async plan(target) {
      const { planId, summary } = unwrap(
        await client.request("handoffPlan", { workspaceId: target.workspaceId }),
      );
      const handle: HandoffPlanHandle = { summary, target };
      plans.set(handle, planId);
      return handle;
    },
    async run(handle, options = {}) {
      const planId = plans.get(handle);
      if (!planId) throw new Error("Unknown hand-off plan");
      const off = options.onProgress
        ? client.subscribe("handoff", { planId }, options.onProgress)
        : () => {};
      const onAbort = () => void client.request("handoffCancel", { planId });
      options.signal?.addEventListener("abort", onAbort);
      try {
        return unwrap(await client.request("handoffRun", { planId }));
      } finally {
        off();
        options.signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}

// Resolves once the document's access row has synced to the main process's database.
function whenServerHas(backend: Backend, docId: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const handle = backend.live("doc.access", { id: docId });
    const finish = (ok: boolean) => {
      off();
      signal.removeEventListener("abort", onAbort);
      if (ok) resolve();
      else reject(new Error("aborted"));
    };
    const check = () => {
      if (handle.getSnapshot().data[0]?.level) finish(true);
    };
    const onAbort = () => finish(false);
    const off = handle.subscribe(check);
    signal.addEventListener("abort", onAbort);
    check();
  });
}

// Collab in the renderer of a hosted window: tokens from main, bodies kept in this window's
// IndexedDB until the server has them.
export async function desktopCollab(
  client: AccountClient,
  backend: Backend,
  user: { id: string; name: string },
): Promise<Collab> {
  const { colourFor, createCollab, createIndexedDbYjsPersistence } =
    await import("./hosted-lazy.ts");
  return createCollab({
    token: async () => unwrap(await client.request("collabToken", null)),
    persistence: createIndexedDbYjsPersistence(hostedDatabaseName(user.id)),
    user: { name: user.name, color: colourFor(user.id) },
    gate: (docId, signal) => whenServerHas(backend, docId, signal),
  });
}

// A desktop window with neither a folder nor a hosted workspace: the start screen picks one.
export class NoWorkspaceError extends Error {
  constructor(
    readonly platform: Platform,
    readonly client: AccountClient,
    readonly info: WindowScopeInfo,
  ) {
    super("Open a folder or a cloud workspace");
    this.name = "NoWorkspaceError";
  }
}
