import { appUrl, belowBase, parseAppUrl } from "@lydie/app/url";
// The web app's side of hosted mode: the account service plugins see (`app.services.account`), the
// collab adapter for the editor, and the local → hosted hand-off. `compose.ts` decides the scope.
import { LYDIE_VERSION } from "@lydie/contract";
import type { Observable } from "@lydie/plugin-api";
import type {
  AccountApi,
  AccountState,
  CollabApi,
  CollabSession,
  HandoffApi,
  HandoffPlanHandle,
  HostedApiError,
  LocalWorkspaceSummary,
  SignInFollowUp,
  SyncDetails,
  WorkspaceScope,
} from "@lydie/plugin-api/hosted";
import { createApiCaller } from "@lydie/sdk";
import type { Store } from "@lydie/store";
import { isApiError, readProviderReturn, withoutProviderReturn } from "@lydie/sync";
import type {
  Collab,
  HandoffPlan,
  HostedSync,
  KeyValueStorage,
  Session,
  SessionState,
  SyncStatus,
} from "@lydie/sync";

import { rememberWelcome } from "./welcome.ts";

// Where the hosted API is. A relative value (e.g. "/__core") is resolved against the page, so a
// same-origin proxy works.
export function apiUrl(): string {
  const raw = (import.meta.env.VITE_LYDIE_API_URL as string | undefined) ?? "http://localhost:4100";
  return new URL(raw, window.location.href).toString().replace(/\/+$/, "");
}

// The web app's own base path ("/" or "/app/").
export function webBase(): string {
  return import.meta.env.BASE_URL ?? "/";
}

// Non-secret state (scope preference, hand-off checkpoints) in localStorage.
export const localKv: KeyValueStorage = {
  get: async (key) => localStorage.getItem(`lydie:${key}`),
  set: async (key, value) => localStorage.setItem(`lydie:${key}`, value),
  delete: async (key) => localStorage.removeItem(`lydie:${key}`),
};

// Hosted workspace names, so a hosted window can paint its name before the network answers.
const NAMES_KEY = "lydie:hosted-workspace-names";

export function cachedWorkspaceName(id: string): string | null {
  try {
    return (
      (JSON.parse(localStorage.getItem(NAMES_KEY) ?? "{}") as Record<string, string>)[id] ?? null
    );
  } catch {
    return null;
  }
}

// Their slugs (`/w/<slug>`), so URLs can be written and read before the network answers.
const SLUGS_KEY = "lydie:hosted-workspace-slugs";

function cached(key: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function cachedWorkspaceSlug(id: string): string | null {
  return cached(SLUGS_KEY)[id] ?? null;
}

// The id of a workspace this browser has listed, from what a URL calls it: its slug or its id.
export function cachedWorkspaceId(ref: string): string | null {
  if (ref in cached(NAMES_KEY)) return ref;
  const found = Object.entries(cached(SLUGS_KEY)).find(([, slug]) => slug === ref);
  return found ? found[0] : null;
}

export function rememberWorkspaceNames(
  list: readonly { id: string; name: string; slug?: string }[],
) {
  try {
    const names = cached(NAMES_KEY);
    const slugs = cached(SLUGS_KEY);
    for (const w of list) {
      names[w.id] = w.name;
      if (w.slug) slugs[w.id] = w.slug;
    }
    localStorage.setItem(NAMES_KEY, JSON.stringify(names));
    localStorage.setItem(SLUGS_KEY, JSON.stringify(slugs));
  } catch {
    // best effort
  }
}

export function toHostedError(error: unknown): HostedApiError {
  if (isApiError(error)) {
    const out = new Error(error.body?.message ?? error.message) as HostedApiError;
    out.kind = error.kind;
    if (error.status !== null) out.status = error.status;
    out.code = error.code;
    return out;
  }
  return error instanceof Error ? error : new Error(String(error));
}

async function hosted<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw toHostedError(error);
  }
}

// The session's state as the plugin API shows it (no token), one object per change.
function accountState(session: Session): Observable<AccountState> {
  let last: { from: SessionState; value: AccountState } | null = null;
  const get = () => {
    const from = session.state.get();
    if (last?.from === from) return last.value;
    const value: AccountState =
      from.status === "signed-out"
        ? { status: "signed-out" }
        : { status: from.status, user: from.user };
    last = { from, value };
    return value;
  };
  return { get, subscribe: (listener) => session.state.subscribe(() => listener()) };
}

export function observe<T, U>(
  source: { get(): T; subscribe(l: (v: T) => void): () => void },
  map: (value: T) => U,
): Observable<U> {
  let last: { from: T; value: U } | null = null;
  const get = () => {
    const from = source.get();
    if (last && last.from === from) return last.value;
    last = { from, value: map(from) };
    return last.value;
  };
  return { get, subscribe: (listener) => source.subscribe(() => listener()) };
}

// The sync engine's status and refused changes as one observable value.
export function syncDetails(sync: HostedSync): Observable<SyncDetails> {
  let last: { status: SyncStatus; rejected: unknown; value: SyncDetails } | null = null;
  const get = () => {
    const status = sync.status.get();
    const rejected = sync.rejected.get();
    if (last && last.status === status && last.rejected === rejected) return last.value;
    const uploading: Record<string, number> = {};
    for (const [id, p] of Object.entries(status.uploading)) uploading[id] = p.total - p.loaded;
    const value: SyncDetails = {
      state: status.state,
      pendingOperations: status.pendingOperations,
      pendingUploads: status.pendingUploads,
      uploading,
      rejected: rejected.map((r) => ({
        operationId: r.operationId,
        operation: r.operation,
        reason: r.reason,
        rejectedAt: r.rejectedAt,
      })),
      lastSyncedAt: status.lastSyncedAt,
      error: status.error,
      retryAt: status.retryAt,
    };
    last = { status, rejected, value };
    return value;
  };
  return {
    get,
    subscribe(listener) {
      const a = sync.status.subscribe(() => listener());
      const b = sync.rejected.subscribe(() => listener());
      return () => {
        a();
        b();
      };
    },
  };
}

// ---- Sign in with a provider: the page leaves for the provider and comes back with a token.

const INTENT_KEY = "lydie:sign-in-intent";
type Intent = {
  then?: SignInFollowUp;
  wanted?: WorkspaceScope | null;
  // Where the page was when it left for the provider (path, query and fragment).
  returnTo?: string;
};
export type ProviderReturn = { then: SignInFollowUp; error: string | null };

// Run at startup, before the window's scope is chosen: exchanges the token a provider sign-in
// returned with for the session, and restores what the window meant to do next. A window that was
// meant to open a hosted workspace is pointed at it, so it opens signed in.
export async function completeProviderReturn(
  session: Session,
  scopes: { set(scope: WorkspaceScope): Promise<void> },
): Promise<ProviderReturn | null> {
  const here = new URL(window.location.href);
  const result = readProviderReturn(here);
  if (!result) return null;
  // The token is single-use; keep it out of the history and of reloads.
  window.history.replaceState(window.history.state, "", withoutProviderReturn(here).toString());
  let intent: Intent = {};
  try {
    intent = JSON.parse(sessionStorage.getItem(INTENT_KEY) ?? "{}") as Intent;
  } catch {
    // no intent
  }
  sessionStorage.removeItem(INTENT_KEY);
  // Back where the page was (a link to a workspace that asked for the sign-in).
  if (intent.returnTo?.startsWith(webBase())) {
    window.history.replaceState(window.history.state, "", intent.returnTo);
  }
  const then = intent.then ?? null;
  if ("error" in result) return { then, error: result.error };
  try {
    await session.signInWithToken(result.token);
  } catch (error) {
    return { then, error: toHostedError(error).code ?? "failed" };
  }
  if (intent.wanted?.kind === "hosted") {
    await scopes.set(intent.wanted);
    return { then: null, error: null };
  }
  return { then, error: null };
}

export type AccountOptions = {
  session: Session;
  scopes: { set(scope: WorkspaceScope): Promise<void> };
  scope: WorkspaceScope;
  wanted: WorkspaceScope | null;
  localWorkspace: LocalWorkspaceSummary | null;
  handoff: HandoffApi | null;
  sync: HostedSync | null;
  providerReturn?: ProviderReturn | null;
};

export function createAccount(options: AccountOptions): AccountApi {
  const { session } = options;
  let providerReturn = options.providerReturn ?? null;
  const caller = createApiCaller(async (request) => {
    try {
      const { data } = await session.api.send(request.method, request.path, {
        ...(request.body !== undefined ? { body: request.body } : {}),
      });
      return data;
    } catch (error) {
      throw toHostedError(error);
    }
  });
  // Another workspace is another URL: a hosted one's base, or the app's (this browser's own
  // workspace, now the one opened last). A link that named the workspace is kept.
  const reopen = async (scope: WorkspaceScope) => {
    await options.scopes.set(scope);
    if (scope.kind !== "hosted") return window.location.assign(webBase());
    const below = belowBase(webBase(), window.location.pathname);
    const here = below === null ? null : parseAppUrl(below).workspace;
    const slug = cachedWorkspaceSlug(scope.workspaceId);
    if (here !== null && (here === scope.workspaceId || here === slug)) window.location.reload();
    else window.location.assign(appUrl(webBase(), "/", slug ?? scope.workspaceId));
  };
  return {
    apiUrl: session.baseUrl,
    scope: options.scope,
    wanted: options.wanted,
    state: accountState(session),
    async signIn(input) {
      try {
        return await session.signIn(input);
      } catch (error) {
        throw toHostedError(error);
      }
    },
    async verifySignIn(input) {
      try {
        return await session.verifySignIn(input);
      } catch (error) {
        throw toHostedError(error);
      }
    },
    twoFactor: {
      hasPassword: () => hosted(() => session.twoFactor.hasPassword()),
      enable: (password) => hosted(() => session.twoFactor.enable(password)),
      confirm: (code) => hosted(async () => void (await session.twoFactor.confirm(code))),
      disable: (password) => hosted(async () => void (await session.twoFactor.disable(password))),
      backupCodes: (password) => hosted(() => session.twoFactor.backupCodes(password)),
    },
    setImage: (image) => hosted(() => session.setImage(image)),
    async signUp(input) {
      try {
        return await session.signUp(input);
      } catch (error) {
        throw toHostedError(error);
      }
    },
    signInWith(provider, input) {
      const { pathname, search, hash } = window.location;
      const intent: Intent = {
        then: input?.then ?? null,
        wanted: options.wanted,
        returnTo: pathname + search + hash,
      };
      sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent));
      const url = session.socialUrl(
        provider,
        new URL(webBase(), window.location.origin).toString(),
      );
      // Identity providers refuse to run in a frame (the site's embed): continue in a tab.
      if (window.top !== window.self) window.open(url, "_blank", "noopener");
      else window.location.assign(url);
      // The page is leaving; it signs in when it comes back.
      return new Promise<never>(() => {});
    },
    cancelSignInWith() {},
    takeProviderReturn() {
      const taken = providerReturn;
      providerReturn = null;
      return taken;
    },
    async signOut() {
      await session.signOut();
      if (options.scope.kind === "hosted") {
        await reopen({ kind: "local", workspaceId: null });
      }
    },
    async workspaces() {
      try {
        const list = await session.workspaces();
        rememberWorkspaceNames(list);
        return list;
      } catch (error) {
        throw toHostedError(error);
      }
    },
    async createWorkspace(input) {
      try {
        const created = await session.createWorkspace(input);
        rememberWorkspaceNames([created]);
        if (input.gettingStarted) rememberWelcome(created.id);
        return created;
      } catch (error) {
        throw toHostedError(error);
      }
    },
    localWorkspaces: () => (options.localWorkspace ? [options.localWorkspace] : []),
    // The browser has one local workspace.
    openLocalWorkspace: async () => {
      if (options.scope.kind !== "local") await reopen({ kind: "local", workspaceId: null });
    },
    openFolder: null,
    openScope: reopen,
    call: (id, input) => caller.call(id, input as never) as never,
    callContract: (id, input) => caller.call(id as never, input as never) as never,
    handoff: options.handoff,
    sync: options.sync
      ? {
          details: syncDetails(options.sync),
          retry: () => void options.sync?.flush().catch(() => {}),
        }
      : null,
    webUrl: (path) =>
      new URL(path.replace(/^\//, ""), window.location.origin + webBase()).toString(),
  };
}

// ---- Hand-off of the browser's local workspace into a hosted one

export function createHandoff(options: {
  session: Session;
  store: Store;
  workspaceId: string;
  blob: {
    get(key: string): Promise<Uint8Array | null>;
    put(key: string, data: Uint8Array): Promise<void>;
    delete(key: string): Promise<void>;
  };
  changedSince: NonNullable<HandoffApi["changedSince"]>;
  discard: NonNullable<HandoffApi["discard"]>;
}): HandoffApi {
  const plans = new WeakMap<HandoffPlanHandle, HandoffPlan>();
  return {
    changedSince: options.changedSince,
    discard: options.discard,
    async plan(target) {
      const user = options.session.user();
      if (!user || options.session.state.get().status !== "signed-in") {
        throw new Error("Sign in first");
      }
      try {
        const spaces = await options.session.teamspaces(target.workspaceId);
        const general = spaces.find((t) => t.isDefault) ?? null;
        const { planHandoff } = await import("./hosted-lazy.ts");
        const plan = await planHandoff(
          { store: options.store, workspaceId: options.workspaceId, blob: options.blob },
          {
            api: options.session.api,
            userId: user.id,
            workspaceId: target.workspaceId,
            teamspaceId: general?.id ?? null,
            version: LYDIE_VERSION,
          },
          { bodies: true },
        );
        const handle: HandoffPlanHandle = { summary: plan.summary, target };
        plans.set(handle, plan);
        return handle;
      } catch (error) {
        throw toHostedError(error);
      }
    },
    async run(handle, runOptions = {}) {
      const plan = plans.get(handle);
      if (!plan) throw new Error("Unknown hand-off plan");
      try {
        const { markdownToYjs, runHandoff } = await import("./hosted-lazy.ts");
        const result = await runHandoff(plan, {
          bodies: { toYjs: markdownToYjs },
          storage: localKv,
          ...(runOptions.onProgress ? { onProgress: runOptions.onProgress } : {}),
          ...(runOptions.signal ? { signal: runOptions.signal } : {}),
        });
        return {
          ok: result.ok,
          applied: result.applied,
          duplicates: result.duplicates,
          rejected: result.rejected.map((r) => ({
            operationId: r.operationId,
            operation: r.operation,
            reason: r.reason,
            rejectedAt: r.rejectedAt,
          })),
          bodies: result.bodies,
          attachments: result.attachments,
          renamed: result.renamed,
        };
      } catch (error) {
        throw toHostedError(error);
      }
    },
  };
}

// ---- Collab: the pool's documents as the plugin API types them

export function collabApi(collab: Collab, user: { name: string; color: string }): CollabApi {
  return {
    open(documentId): CollabSession {
      const doc = collab.open(documentId);
      return {
        id: doc.id,
        ydoc: doc.ydoc,
        awareness: doc.awareness,
        user,
        state: { get: () => doc.state.get(), subscribe: (l) => doc.state.subscribe(() => l()) },
        loaded: doc.loaded,
        release: () => doc.release(),
      };
    },
  };
}
