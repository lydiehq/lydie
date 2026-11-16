// Hosted windows in the desktop app. The main process holds the session (its token in the OS
// keychain through the platform's secret store), decides each window's scope once, and runs one
// synced database, runtime and sync engine per hosted workspace, served to the renderer over the
// backend service like a folder's vault. Collab runs in the renderer with tokens from here.
// Electron-free so it is unit-tested directly.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { dirname, join } from "node:path";

import {
  createEventHub,
  createLocalBackend,
  handledOperations,
  serveBackend,
} from "@lydie/app/backend";
import type { BackendContract } from "@lydie/app/backend";
import { LYDIE_VERSION, uuidsForUlids } from "@lydie/contract";
import type { Operations } from "@lydie/contract";
import type { ServiceHandlers, WorkspaceScope as PlatformScope } from "@lydie/platform";
import { createRuntime } from "@lydie/runtime";
import {
  accountService,
  createScopePreference,
  createSession,
  readProviderReturn,
  toWire,
} from "@lydie/sync";
import type {
  AccountServiceContract,
  AccountWireState,
  AuthProvider,
  HandoffPlan,
  HandoffProgress,
  HandoffSource,
  HostedParts,
  KeyValueStorage,
  SecretStorage,
  Session,
  SessionState,
  SessionUser,
  SyncWire,
  WindowScope,
  WindowScopeInfo,
} from "@lydie/sync";
import { z } from "zod";

import type { ServiceImplementation, ServiceRegistry } from "./services.ts";

type HostedHost = {
  parts: HostedParts<ReturnType<typeof createRuntime<Operations>>>;
  handlers: ServiceHandlers<BackendContract>;
  close(): Promise<void>;
};

type Slot = { holders: Set<string>; ready: Promise<HostedHost>; host: HostedHost | null };

export type HostedManagerOptions = {
  // userData: hosted databases go to `<dataDir>/hosted/`, attachment bytes to `<dataDir>/attachments`.
  dataDir: string;
  apiUrl: string;
  // Where the session token lives (the platform's secret store: the OS keychain).
  secrets: SecretStorage;
  // Non-secret state: which scope new windows open in.
  kv?: KeyValueStorage;
  // Packaged apps load PowerSync's worker from app.asar.unpacked.
  packaged?: boolean;
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  // Opens a URL in the system browser (provider sign-in). Without it, provider sign-in is off.
  openExternal?: (url: string) => Promise<void>;
  // Where the provider sign-in comes back (the app's deep link). Null where the scheme is not
  // registered with the OS (development builds), which turns provider sign-in off.
  signInReturn?: string | null;
};

// How long a provider sign-in in the browser may take before the app stops waiting.
const SIGN_IN_TIMEOUT_MS = 10 * 60_000;

class SignInWithError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

// Plain JSON key/value file (the scope preference).
export function createFileKv(file: string): KeyValueStorage {
  let values: Record<string, string> = {};
  try {
    // A preference saved before ids were UUIDs names the workspace as a ULID: the same id.
    values = JSON.parse(uuidsForUlids(readFileSync(file, "utf8"))) as Record<string, string>;
  } catch {
    // first run
  }
  let writing = Promise.resolve();
  const persist = () => {
    const data = JSON.stringify(values);
    const done = writing.then(async () => {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(`${file}.tmp`, data);
      await rename(`${file}.tmp`, file);
    });
    // One failed write must not stop the next ones.
    writing = done.catch(() => {});
    return done;
  };
  return {
    get: async (key) => values[key] ?? null,
    async set(key, value) {
      values[key] = value;
      await persist();
    },
    async delete(key) {
      delete values[key];
      await persist();
    },
  };
}

// `fetch` over node:http(s). Electron's fetch (undici, and `net.fetch`) adds `Sec-Fetch-*` headers,
// and the auth endpoints then refuse a request without an Origin as a cross-site browser request.
// A native client sends neither.
export async function nodeFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input);
  const body =
    typeof init.body === "string" ? init.body : init.body == null ? null : String(init.body);
  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((value, key) => (headers[key] = value));
  if (body !== null) headers["content-length"] = String(Buffer.byteLength(body));
  return new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      { method: init.method ?? "GET", headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const out = new Headers();
          for (const [key, value] of Object.entries(res.headers)) {
            if (value === undefined) continue;
            for (const v of Array.isArray(value) ? value : [value]) out.append(key, v);
          }
          const status = res.statusCode ?? 0;
          const empty = status === 204 || status === 304;
          resolve(new Response(empty ? null : Buffer.concat(chunks), { status, headers: out }));
        });
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    const signal = init.signal;
    if (signal?.aborted) req.destroy(new Error("aborted"));
    signal?.addEventListener("abort", () => req.destroy(new Error("aborted")), { once: true });
    if (body !== null) req.write(body);
    req.end();
  });
}

// Names the app in the core's list of signed-in devices ("Lydie desktop app on macOS").
function withUserAgent(fetch: typeof nodeFetch): typeof nodeFetch {
  const agent = `Lydie-Desktop (${process.platform})`;
  return (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has("user-agent")) headers.set("user-agent", agent);
    return fetch(input, { ...init, headers });
  };
}

const wireState = (state: SessionState): AccountWireState =>
  state.status === "signed-out" ? state : { status: state.status, user: state.user };

export class HostedManager {
  readonly session: Session;
  private readonly scopes: ReturnType<typeof createScopePreference>;
  private readonly windowScopes = new Map<string, WindowScopeInfo>();
  private readonly slots = new Map<string, Slot>();
  private readonly holderWorkspace = new Map<string, string>();
  private readonly plans = new Map<
    string,
    {
      plan: HandoffPlan;
      listeners: Set<(progress: HandoffProgress) => void>;
      abort: AbortController;
    }
  >();
  private readonly kv: KeyValueStorage;
  private pendingSignIn: {
    resolve: (user: SessionUser) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  readonly ready: Promise<SessionState>;

  constructor(private readonly options: HostedManagerOptions) {
    this.session = createSession({
      baseUrl: options.apiUrl,
      secrets: options.secrets,
      version: LYDIE_VERSION,
      fetch: options.fetch ?? withUserAgent(nodeFetch),
    });
    this.kv = options.kv ?? createFileKv(join(options.dataDir, "account.json"));
    this.scopes = createScopePreference(this.kv);
    // Windows open from the stored session: the server's answer (fresh details, or that the
    // session expired) arrives later through `session.state`, which the renderer follows. Offline
    // or no keychain: the window opens signed out (or from the stored session).
    this.ready = this.session.load().catch(() => this.session.state.get());
    void this.ready.then(() => this.session.check()).catch(() => {});
  }

  // Opens the browser on the provider and waits for the deep link that brings the session back.
  // A new attempt supersedes a waiting one.
  async signInWith(provider: AuthProvider): Promise<SessionUser> {
    const { openExternal, signInReturn } = this.options;
    if (!openExternal || !signInReturn) {
      throw new SignInWithError(
        "unavailable",
        "Signing in with Google needs the installed app (this build cannot receive the sign-in).",
      );
    }
    this.cancelSignInWith("superseded");
    const done = new Promise<SessionUser>((resolve, reject) => {
      const timer = setTimeout(() => this.cancelSignInWith("timeout"), SIGN_IN_TIMEOUT_MS);
      this.pendingSignIn = { resolve, reject, timer };
    });
    await openExternal(this.session.socialUrl(provider, signInReturn));
    return done;
  }

  cancelSignInWith(code = "cancelled") {
    const pending = this.pendingSignIn;
    if (!pending) return;
    this.pendingSignIn = null;
    clearTimeout(pending.timer);
    pending.reject(new SignInWithError(code, "Sign-in was not completed."));
  }

  // A deep link from the system browser; true when it was a provider sign-in's return (handled
  // here, never routed to a window).
  takeSignInLink(link: string): boolean {
    const { signInReturn } = this.options;
    let url: URL;
    try {
      url = new URL(link);
    } catch {
      return false;
    }
    if (!signInReturn || `${url.protocol}//${url.host}${url.pathname}` !== signInReturn)
      return false;
    const pending = this.pendingSignIn;
    // A stale link (the app stopped waiting): its token expires unused.
    if (!pending) return true;
    this.pendingSignIn = null;
    clearTimeout(pending.timer);
    const result = readProviderReturn(url);
    if (!result)
      pending.reject(new SignInWithError("failed", "The sign-in did not return a session."));
    else if ("error" in result)
      pending.reject(new SignInWithError(result.error, "Sign-in was not completed."));
    else this.session.signInWithToken(result.token).then(pending.resolve, pending.reject);
    return true;
  }

  // The scope of a window, decided on its first load and kept until it reloads after `setScope`.
  // A window on a folder shows the folder; one without opens the remembered hosted workspace.
  async scopeFor(windowId: string, platform: PlatformScope): Promise<WindowScopeInfo> {
    const known = this.windowScopes.get(windowId);
    if (known) return known;
    const local: WindowScope = { kind: "local", workspaceId: null };
    let info: WindowScopeInfo;
    if (platform.kind === "local") {
      info = { scope: local, wanted: null, apiUrl: this.options.apiUrl };
    } else {
      const choice = await this.scopes.choose(await this.ready, local);
      info =
        choice.reason === "needs-sign-in"
          ? { scope: null, wanted: choice.wanted, apiUrl: this.options.apiUrl }
          : {
              scope: choice.scope.kind === "hosted" ? choice.scope : null,
              wanted: null,
              apiUrl: this.options.apiUrl,
            };
    }
    this.windowScopes.set(windowId, info);
    return info;
  }

  // New windows without a folder open a synced workspace.
  async prefersSynced(): Promise<boolean> {
    return (await this.scopes.get())?.kind === "hosted";
  }

  async setScope(windowId: string, scope: WindowScope) {
    await this.scopes.set(scope);
    this.windowScopes.set(windowId, { scope, wanted: null, apiUrl: this.options.apiUrl });
    // The window reloads into the new scope; its old hosted database is released then.
    await this.release(windowId);
  }

  showsSynced(windowId: string): boolean {
    return this.hostedScopeOf(windowId) !== null;
  }

  private hostedScopeOf(windowId: string): (WindowScope & { kind: "hosted" }) | null {
    const scope = this.windowScopes.get(windowId)?.scope;
    return scope?.kind === "hosted" ? scope : null;
  }

  // The backend of a hosted window; null for other windows (the folder's vault serves them).
  async backendFor(windowId: string): Promise<ServiceHandlers<BackendContract> | null> {
    const scope = this.hostedScopeOf(windowId);
    if (!scope) return null;
    return (await this.acquire(scope, windowId)).handlers;
  }

  private acquire(scope: WindowScope & { kind: "hosted" }, holder: string): Promise<HostedHost> {
    let slot = this.slots.get(scope.workspaceId);
    if (!slot) {
      const created: Slot = { holders: new Set(), ready: this.open(scope), host: null };
      created.ready.then(
        (host) => (created.host = host),
        () => this.slots.delete(scope.workspaceId),
      );
      slot = created;
      this.slots.set(scope.workspaceId, slot);
    }
    slot.holders.add(holder);
    this.holderWorkspace.set(holder, scope.workspaceId);
    return slot.ready;
  }

  private async open(scope: WindowScope & { kind: "hosted" }): Promise<HostedHost> {
    const hub = createEventHub();
    const {
      createDirectoryBlob,
      createHostedBackendParts,
      markdownExtract,
      openNodeStore,
      unpackedAsar,
    } = await import("./hosted-lazy.ts");
    const blob = createDirectoryBlob(join(this.options.dataDir, "attachments"));
    const parts = await createHostedBackendParts({
      scope,
      baseUrl: this.options.apiUrl,
      version: LYDIE_VERSION,
      secrets: this.options.secrets,
      session: this.session,
      fetch: this.options.fetch ?? nodeFetch,
      openStore: async ({ dbFilename, mode }) => {
        await mkdir(join(this.options.dataDir, "hosted"), { recursive: true });
        return openNodeStore({
          path: join(this.options.dataDir, "hosted", dbFilename),
          mode,
          ...(this.options.packaged ? { workerUrl: unpackedAsar } : {}),
        });
      },
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
      // no `yjs`: collab runs in the renderer, with tokens from `collabToken`.
    });
    const workspaces = await this.session.workspaces().catch(() => []);
    const backend = createLocalBackend({
      store: parts.store,
      runtime: parts.runtime,
      blob,
      events: hub,
      info: {
        mode: "synced",
        workspaceId: scope.workspaceId,
        workspaceName: workspaces.find((w) => w.id === scope.workspaceId)?.name ?? "Workspace",
        persistent: true,
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
    void parts
      .start()
      .catch((error: unknown) => console.warn("[hosted] sync did not start", error));
    return {
      parts,
      handlers: serveBackend(backend),
      async close() {
        await backend.close();
        await parts.close();
      },
    };
  }

  // A window closed or reloads into another scope.
  async release(holder: string): Promise<void> {
    const workspaceId = this.holderWorkspace.get(holder);
    if (!workspaceId) return;
    this.holderWorkspace.delete(holder);
    const slot = this.slots.get(workspaceId);
    if (!slot) return;
    slot.holders.delete(holder);
    if (slot.holders.size > 0) return;
    this.slots.delete(workspaceId);
    await (await slot.ready.catch(() => null))?.close();
  }

  forget(windowId: string) {
    this.windowScopes.delete(windowId);
    return this.release(windowId);
  }

  busy(): boolean {
    return this.slots.size > 0;
  }

  async closeAll(): Promise<void> {
    const slots = [...this.slots.values()];
    this.slots.clear();
    this.holderWorkspace.clear();
    await Promise.all(slots.map(async (s) => (await s.ready.catch(() => null))?.close()));
  }

  private syncOf(windowId: string): SyncWire | null {
    const scope = this.hostedScopeOf(windowId);
    const slot = scope ? this.slots.get(scope.workspaceId) : undefined;
    const host = slot?.host;
    if (!host) return null;
    return {
      ...host.parts.sync.status.get(),
      rejectedChanges: [...host.parts.sync.rejected.get()],
    };
  }

  // The account service (`@lydie/sync`'s accountService) for every window.
  register(
    services: ServiceRegistry,
    hooks: {
      platformScopeOf: (windowId: string) => PlatformScope | null;
      // The folder workspace of a window, for the hand-off (null: the window has no folder).
      handoffSourceFor?: (windowId: string) => Promise<HandoffSource | null>;
      // Opens a window that shows the remembered hosted workspace.
      openHostedWindow?: () => Promise<void>;
      // A window settled on a scope (its first load, or a reload after `setScope`).
      scopeChosen?: (windowId: string, scope: WindowScope | null) => void;
    },
  ) {
    const platformScopeOf = hooks.platformScopeOf;
    const session = this.session;
    const credentials = z.object({ email: z.string(), password: z.string() });
    const password = z.object({ password: z.string().min(1).max(1024) });
    const implementation: ServiceImplementation<AccountServiceContract> = {
      requests: {
        state: {
          input: z.null(),
          handle: async () => {
            await this.ready;
            return wireState(session.state.get());
          },
        },
        scope: {
          input: z.null(),
          handle: async (_, caller) => {
            const info = await this.scopeFor(
              caller.windowId,
              platformScopeOf(caller.windowId) ?? { kind: "none" },
            );
            hooks.scopeChosen?.(caller.windowId, info.scope);
            return info;
          },
        },
        setScope: {
          input: z.object({
            scope: z.union([
              z.object({ kind: z.literal("local"), workspaceId: z.string().nullable() }),
              z.object({ kind: z.literal("hosted"), workspaceId: z.string() }),
            ]),
          }),
          handle: async ({ scope }, caller) => {
            await this.setScope(caller.windowId, scope);
            return null;
          },
        },
        signIn: { input: credentials, handle: (input) => toWire(() => session.signIn(input)) },
        signUp: {
          input: credentials.extend({ name: z.string().optional() }),
          handle: (input) => toWire(() => session.signUp(input)),
        },
        verifySignIn: {
          input: z.object({
            code: z.string().min(1).max(64),
            method: z.enum(["app", "backup"]),
          }),
          handle: (input) => toWire(() => session.verifySignIn(input)),
        },
        twoFactorHasPassword: {
          input: z.null(),
          handle: () => toWire(() => session.twoFactor.hasPassword()),
        },
        twoFactorEnable: {
          input: password,
          handle: (input) => toWire(() => session.twoFactor.enable(input.password)),
        },
        twoFactorConfirm: {
          input: z.object({ code: z.string().min(1).max(64) }),
          handle: (input) => toWire(() => session.twoFactor.confirm(input.code)),
        },
        twoFactorDisable: {
          input: password,
          handle: (input) => toWire(() => session.twoFactor.disable(input.password)),
        },
        twoFactorBackupCodes: {
          input: password,
          handle: (input) => toWire(() => session.twoFactor.backupCodes(input.password)),
        },
        setImage: {
          // A picture URL or a drawn avatar as an SVG data: URL, a few kB.
          input: z.object({ image: z.string().max(200_000).nullable() }),
          handle: (input) => toWire(() => session.setImage(input.image)),
        },
        signInWith: {
          input: z.object({ provider: z.literal("google") }),
          handle: ({ provider }) => toWire(() => this.signInWith(provider)),
        },
        cancelSignInWith: {
          input: z.null(),
          handle: () => {
            this.cancelSignInWith();
            return null;
          },
        },
        signOut: {
          input: z.null(),
          handle: async () => {
            await session.signOut();
            return null;
          },
        },
        workspaces: { input: z.null(), handle: () => toWire(() => session.workspaces()) },
        createWorkspace: {
          input: z.object({ name: z.string().min(1), gettingStarted: z.boolean().optional() }),
          handle: (input) => toWire(() => session.createWorkspace(input)),
        },
        request: {
          input: z.object({
            method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
            // The hosted API's own routes only.
            path: z.string().regex(/^\/(v1|auth)\//),
            body: z.unknown().optional(),
          }),
          handle: (input) =>
            toWire(async () => {
              const { data } = await session.api.send(input.method, input.path, {
                ...(input.body !== undefined ? { body: input.body } : {}),
              });
              return data;
            }),
        },
        collabToken: {
          input: z.null(),
          handle: () =>
            toWire(() =>
              session.api.get<{ url: string; token: string; expiresAt: string }>(
                "/v1/collab/token",
              ),
            ),
        },
        sync: { input: z.null(), handle: (_, caller) => this.syncOf(caller.windowId) },
        handoffPlan: {
          input: z.object({ workspaceId: z.string() }),
          handle: ({ workspaceId }, caller) =>
            toWire(async () => {
              const source = await hooks.handoffSourceFor?.(caller.windowId);
              if (!source) throw new Error("This window has no folder to copy");
              const user = session.user();
              if (!user || session.state.get().status !== "signed-in") {
                throw new Error("Sign in first");
              }
              const spaces = await session.teamspaces(workspaceId);
              const { planHandoff } = await import("./hosted-lazy.ts");
              const plan = await planHandoff(source, {
                api: session.api,
                userId: user.id,
                workspaceId,
                teamspaceId: spaces.find((t) => t.isDefault)?.id ?? null,
                version: LYDIE_VERSION,
              });
              const planId = randomUUID();
              this.plans.set(planId, { plan, listeners: new Set(), abort: new AbortController() });
              return { planId, summary: plan.summary };
            }),
        },
        handoffRun: {
          input: z.object({ planId: z.string() }),
          handle: ({ planId }) =>
            toWire(async () => {
              const entry = this.plans.get(planId);
              if (!entry) throw new Error("Unknown hand-off plan");
              try {
                // Bodies go up as Markdown with each page; the server builds the documents.
                const { runHandoff } = await import("./hosted-lazy.ts");
                const result = await runHandoff(entry.plan, {
                  storage: this.kv,
                  signal: entry.abort.signal,
                  onProgress: (progress) => {
                    for (const listener of entry.listeners) listener(progress);
                  },
                });
                return {
                  ok: result.ok,
                  applied: result.applied,
                  duplicates: result.duplicates,
                  rejected: result.rejected,
                  bodies: result.bodies,
                  attachments: result.attachments,
                  renamed: result.renamed,
                };
              } finally {
                this.plans.delete(planId);
              }
            }),
        },
        handoffCancel: {
          input: z.object({ planId: z.string() }),
          handle: ({ planId }) => {
            this.plans.get(planId)?.abort.abort();
            return null;
          },
        },
        openHostedWindow: {
          input: z.object({ workspaceId: z.string() }),
          handle: async ({ workspaceId }) => {
            await this.scopes.set({ kind: "hosted", workspaceId });
            await hooks.openHostedWindow?.();
            return null;
          },
        },
        retrySync: {
          input: z.null(),
          handle: async (_, caller) => {
            const scope = this.hostedScopeOf(caller.windowId);
            const slot = scope ? this.slots.get(scope.workspaceId) : undefined;
            void slot?.host?.parts.sync.flush().catch(() => {});
            return null;
          },
        },
      },
      streams: {
        handoff: {
          params: z.object({ planId: z.string() }),
          subscribe: ({ planId }, emit) => {
            const entry = this.plans.get(planId);
            if (!entry) return () => {};
            entry.listeners.add(emit);
            return () => entry.listeners.delete(emit);
          },
        },
        state: {
          params: z.null(),
          subscribe: (_, emit) => session.state.subscribe((state) => emit(wireState(state))),
        },
        sync: {
          params: z.null(),
          subscribe: (_, emit, caller) => {
            let offs: (() => void)[] = [];
            let stopped = false;
            const scope = this.hostedScopeOf(caller.windowId);
            if (scope) {
              void this.acquire(scope, caller.windowId).then((host) => {
                if (stopped) return;
                const send = () => {
                  const wire = this.syncOf(caller.windowId);
                  if (wire) emit(wire);
                };
                offs = [
                  host.parts.sync.status.subscribe(send),
                  host.parts.sync.rejected.subscribe(send),
                ];
                send();
              });
            }
            return () => {
              stopped = true;
              for (const off of offs) off();
            };
          },
        },
      },
    };
    services.register(
      accountService as { name: string; contract?: AccountServiceContract },
      implementation,
    );
  }
}
