import type { CollabToken } from "./collab/collab.ts";
import type { HandoffProgress, HandoffSummary } from "./handoff.ts";
import { isApiError, messageOf } from "./http.ts";
// The account service of the desktop app: the main process holds the session (its token in the OS
// keychain) and hosted windows' databases; the renderer asks it for sign-in, workspaces, hosted API
// calls, collab tokens and sync status. Both sides import this file. Structurally
// a `ServiceContract` of @lydie/platform (this package may not import it), like the vault service.
import type {
  AuthProvider,
  SecondFactor,
  SessionUser,
  TwoFactorSetup,
  WindowScope,
  WorkspaceSummary,
} from "./session.ts";
import type { SyncStatus } from "./sync.ts";
import type { RejectedChange } from "./upload.ts";

export type AccountWireState =
  | { status: "signed-out" }
  | { status: "signed-in" | "expired"; user: SessionUser };

// A hosted API failure, kept intact across the process boundary.
export type WireError = {
  kind: "network" | "server" | "auth" | "client";
  status: number | null;
  code: string;
  message: string;
};

// Network calls answer with an envelope instead of throwing, so the error survives IPC.
export type Wire<T> = { ok: true; value: T } | { ok: false; error: WireError };

export type WindowScopeInfo = {
  // This window's scope, fixed until it reloads; null: a window with neither a folder nor a hosted
  // workspace (it shows the start screen).
  scope: WindowScope | null;
  // A hosted workspace this window was meant to open but could not without a sign-in.
  wanted: WindowScope | null;
  apiUrl: string;
};

export type SyncWire = SyncStatus & { rejectedChanges: RejectedChange[] };

export type HandoffOutcomeWire = {
  ok: boolean;
  applied: number;
  duplicates: number;
  rejected: RejectedChange[];
  bodies: { pushed: number; skipped: number; failed: string[] };
  attachments: { uploaded: number; missing: string[]; failed: string[] };
  renamed: Record<string, string>;
};

export type AccountServiceContract = {
  requests: {
    state: { input: null; output: AccountWireState };
    scope: { input: null; output: WindowScopeInfo };
    // Remembers the scope for new windows and for this window's next load (then reload it).
    setScope: { input: { scope: WindowScope }; output: null };
    signIn: { input: { email: string; password: string }; output: Wire<SessionUser> };
    signUp: {
      input: { email: string; password: string; name?: string };
      output: Wire<SessionUser>;
    };
    // After signIn answered TWO_FACTOR_REQUIRED (the pending sign-in stays in main).
    verifySignIn: { input: SecondFactor; output: Wire<SessionUser> };
    twoFactorHasPassword: { input: null; output: Wire<boolean> };
    twoFactorEnable: { input: { password: string }; output: Wire<TwoFactorSetup> };
    twoFactorConfirm: { input: { code: string }; output: Wire<SessionUser> };
    twoFactorDisable: { input: { password: string }; output: Wire<SessionUser> };
    twoFactorBackupCodes: { input: { password: string }; output: Wire<string[]> };
    setImage: { input: { image: string | null }; output: Wire<SessionUser> };
    // Opens the system browser to sign in with a provider; answers once the app's deep link brings
    // the session back, or the attempt is cancelled, superseded or times out.
    signInWith: { input: { provider: AuthProvider }; output: Wire<SessionUser> };
    cancelSignInWith: { input: null; output: null };
    signOut: { input: null; output: null };
    workspaces: { input: null; output: Wire<WorkspaceSummary[]> };
    createWorkspace: {
      input: { name: string; gettingStarted?: boolean };
      output: Wire<WorkspaceSummary>;
    };
    // Any hosted API request with the session's token (`path` under the API origin, e.g. /v1/…).
    request: {
      input: { method: string; path: string; body?: unknown };
      output: Wire<unknown>;
    };
    collabToken: { input: null; output: Wire<CollabToken> };
    // This window's hosted workspace (null in other windows).
    sync: { input: null; output: SyncWire | null };
    retrySync: { input: null; output: null };
    // Folder windows: copy the folder's workspace into a hosted one (the folder is not touched).
    handoffPlan: {
      input: { workspaceId: string };
      output: Wire<{ planId: string; summary: HandoffSummary }>;
    };
    handoffRun: { input: { planId: string }; output: Wire<HandoffOutcomeWire> };
    handoffCancel: { input: { planId: string }; output: null };
    // Remembers a hosted workspace and opens a window on it (this window keeps its folder).
    openHostedWindow: { input: { workspaceId: string }; output: null };
  };
  streams: {
    state: { params: null; event: AccountWireState };
    sync: { params: null; event: SyncWire };
    handoff: { params: { planId: string }; event: HandoffProgress };
  };
};

export const ACCOUNT_SERVICE = "lydie-account";

// What `defineService<AccountServiceContract>("lydie-account")` returns.
export const accountService: { readonly name: string; readonly contract?: AccountServiceContract } =
  { name: ACCOUNT_SERVICE };

// Runs a hosted call and wraps its outcome for the trip to the renderer.
export async function toWire<T>(run: () => Promise<T>): Promise<Wire<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    if (isApiError(error)) {
      return {
        ok: false,
        error: {
          kind: error.kind,
          status: error.status,
          code: error.code,
          message: error.body?.message ?? error.message,
        },
      };
    }
    const code = (error as { code?: unknown } | null)?.code;
    return {
      ok: false,
      error: {
        kind: "client",
        status: null,
        code: typeof code === "string" ? code : "error",
        message: messageOf(error),
      },
    };
  }
}
