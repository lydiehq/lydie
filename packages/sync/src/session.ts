import { ApiError, createApiClient } from "./http.ts";
import type { ApiClient } from "./http.ts";
import { createObservable, jsonEqual } from "./types.ts";
import type { FetchLike, KeyValueStorage, Observable, SecretStorage } from "./types.ts";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  // Two-step verification: a password sign-in also asks for a code. Absent in sessions stored
  // before it existed (read as off until the server is next asked).
  twoFactorEnabled?: boolean;
};

// What finishes a sign-in that asked for a second factor: a code from the authenticator app, or
// one of the backup codes.
export type SecondFactor = { code: string; method: "app" | "backup" };

// Sets up an authenticator app: the otpauth:// link it scans and new backup codes. Two-step
// verification is on once `twoFactor.confirm` gets a code from the app.
export type TwoFactorSetup = { uri: string; backupCodes: string[] };

// The error code of a password sign-in that needs a second factor (`verifySignIn` finishes it).
export const TWO_FACTOR_REQUIRED = "two_factor_required";

// The header carrying a pending two-factor sign-in (the core's modules/auth/two-factor.ts).
const TWO_FACTOR_HEADER = "lydie-two-factor";

// Identity providers the core can sign in with.
export type AuthProvider = "google";

// What a provider sign-in left in the app's URL when it came back: a one-time token for
// `signInWithToken`, or an error code. Null when the URL is not a return from one.
export function readProviderReturn(url: URL): { token: string } | { error: string } | null {
  const token = url.searchParams.get("login");
  if (token) return { token };
  const error = url.searchParams.get("login_error");
  return error ? { error } : null;
}

// `url` without the return parameters, to replace it in the address bar.
export function withoutProviderReturn(url: URL): URL {
  const clean = new URL(url);
  clean.searchParams.delete("login");
  clean.searchParams.delete("login_error");
  return clean;
}

// "expired": a token is stored but the server refused it (401). The user must sign in again; the
// hosted database stays where it is and keeps its unsynced changes until then.
export type SessionState =
  | { status: "signed-out" }
  | { status: "signed-in"; user: SessionUser; token: string }
  | { status: "expired"; user: SessionUser };

export type WorkspaceSummary = {
  id: string;
  name: string;
  // The workspace's name in web app URLs: /w/<slug>.
  slug: string;
  // Its picture (a URL or an SVG data: URL); null: the generated one. Absent from older cores.
  image?: string | null;
  role: "owner" | "admin" | "member" | "guest";
  createdAt: string;
  updatedAt: string;
};

export type TeamspaceSummary = {
  id: string;
  workspaceId: string;
  name: string;
  visibility: "open" | "closed" | "private";
  isDefault: boolean;
  myRole: "owner" | "member" | null;
};

export type SessionOptions = {
  // The core's API origin, e.g. "http://localhost:4100".
  baseUrl: string;
  // Where the bearer token lives (keychain on desktop). Never localStorage for the token if the
  // platform offers something better.
  secrets: SecretStorage;
  fetch?: FetchLike;
  version?: string;
  // How long `check` waits for the server. Default CHECK_TIMEOUT_MS.
  checkTimeoutMs?: number;
};

export type Session = {
  readonly state: Observable<SessionState>;
  readonly baseUrl: string;
  // Authenticated client for the core's API (`/v1/...`). A 401 marks the session expired.
  readonly api: ApiClient;
  token(): string | null;
  user(): SessionUser | null;
  // The stored token and user, without the network: signed in from them at once, or signed out.
  load(): Promise<SessionState>;
  // Asks the server whether the session is still good (at most `checkTimeoutMs`): fresh details,
  // or expired. Offline or slow: keeps the session as it is.
  check(): Promise<SessionState>;
  // load, then check.
  restore(): Promise<SessionState>;
  // An account with two-step verification rejects with an ApiError whose code is
  // TWO_FACTOR_REQUIRED; `verifySignIn` then finishes it (within ten minutes).
  signIn(input: { email: string; password: string }): Promise<SessionUser>;
  verifySignIn(input: SecondFactor): Promise<SessionUser>;
  signUp(input: { email: string; password: string; name?: string }): Promise<SessionUser>;
  // Where to send a browser to sign in with a provider. It comes back to `returnTo` (the web app,
  // or the desktop app's lydie://auth/callback) with `login=<one-time token>` or `login_error`.
  socialUrl(provider: AuthProvider, returnTo: string): string;
  // Exchanges the one-time token from a provider sign-in for the session.
  signInWithToken(token: string): Promise<SessionUser>;
  // Revokes the session on the server when reachable and forgets the token either way.
  signOut(): Promise<void>;
  // Called when any request with this session's token gets a 401.
  markExpired(): void;
  // Two-step verification of the signed-in account. Turning it on or off replaces the session on
  // the server; the new token is taken over here.
  readonly twoFactor: {
    // Whether the account has a password (an account that only signs in with Google has none, and
    // two-step verification only applies to password sign-ins).
    hasPassword(): Promise<boolean>;
    enable(password: string): Promise<TwoFactorSetup>;
    confirm(code: string): Promise<SessionUser>;
    disable(password: string): Promise<SessionUser>;
    // New backup codes; the old ones stop working.
    backupCodes(password: string): Promise<string[]>;
  };
  // Sets the signed-in person's picture (a URL, or an SVG `data:` URL); null goes back to the
  // generated one. The server copies it to their memberships, so others see it too.
  setImage(image: string | null): Promise<SessionUser>;
  workspaces(): Promise<WorkspaceSummary[]>;
  // gettingStarted: the server adds the Getting started page before it answers.
  createWorkspace(input: {
    name: string;
    id?: string;
    gettingStarted?: boolean;
  }): Promise<WorkspaceSummary>;
  teamspaces(workspaceId: string): Promise<TeamspaceSummary[]>;
};

type Stored = { token: string; user: SessionUser };

// How long the session check waits for the server: a stalled connection would otherwise hang for
// the operating system's TCP timeout.
export const CHECK_TIMEOUT_MS = 10_000;

const storageKey = (baseUrl: string) => `lydie.session:${baseUrl}`;

export function createSession(options: SessionOptions): Session {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const key = storageKey(baseUrl);
  const state = createObservable<SessionState>({ status: "signed-out" }, jsonEqual);

  const token = () => {
    const current = state.get();
    return current.status === "signed-in" ? current.token : null;
  };
  const user = () => {
    const current = state.get();
    return current.status === "signed-out" ? null : current.user;
  };

  const api = createApiClient({
    baseUrl,
    token,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.version ? { version: options.version } : {}),
    onUnauthorized: () => markExpired(),
  });

  function markExpired() {
    const current = state.get();
    if (current.status === "signed-in") state.set({ status: "expired", user: current.user });
  }

  async function persist(stored: Stored | null) {
    if (stored) await options.secrets.set(key, JSON.stringify(stored));
    else await options.secrets.delete(key);
  }

  // A password sign-in waiting for its second factor.
  let challenge: { value: string; expiresAt: number } | null = null;

  // Turning two-step verification on or off ends the session and starts a new one (Better Auth):
  // keep the new token and the user as the server now sees it. A request still in flight with the
  // old token may have been refused meanwhile (marking the session expired): the new token ends
  // that.
  async function takeOver(response: Response, previous: string): Promise<SessionUser> {
    const current = state.get();
    if (current.status === "signed-out") throw new ApiError("auth", "Not signed in", 401);
    const issued = response.headers.get("set-auth-token") ?? previous;
    state.set({ status: "signed-in", user: current.user, token: issued });
    const data = await api.get<{ user?: Record<string, unknown> } | null>("/auth/get-session");
    const fresh = data?.user ? toUser(data.user) : current.user;
    await persist({ token: issued, user: fresh });
    state.set({ status: "signed-in", user: fresh, token: issued });
    return fresh;
  }

  async function adopt(response: Response, data: unknown): Promise<SessionUser> {
    const body = data as { token?: string | null; user?: Record<string, unknown> } | null;
    const issued = response.headers.get("set-auth-token") ?? body?.token ?? null;
    if (!issued || !body?.user) {
      throw new Error("The server did not return a session (is email verification required?)");
    }
    const signedIn = toUser(body.user);
    await persist({ token: issued, user: signedIn });
    state.set({ status: "signed-in", user: signedIn, token: issued });
    return signedIn;
  }

  async function load(): Promise<SessionState> {
    const raw = await options.secrets.get(key);
    if (!raw) {
      state.set({ status: "signed-out" });
      return state.get();
    }
    let stored: Stored;
    try {
      stored = JSON.parse(raw) as Stored;
    } catch {
      await persist(null);
      state.set({ status: "signed-out" });
      return state.get();
    }
    state.set({ status: "signed-in", user: stored.user, token: stored.token });
    return state.get();
  }

  async function check(): Promise<SessionState> {
    const current = state.get();
    if (current.status !== "signed-in") return current;
    try {
      const data = await api.get<{ user?: Record<string, unknown> } | null>("/auth/get-session", {
        timeoutMs: options.checkTimeoutMs ?? CHECK_TIMEOUT_MS,
      });
      // Signed in or out meanwhile: that is newer than this answer.
      if (state.get() !== current) return state.get();
      if (!data?.user) {
        state.set({ status: "expired", user: current.user });
      } else {
        const fresh = toUser(data.user);
        if (!jsonEqual(fresh, current.user)) await persist({ token: current.token, user: fresh });
        state.set({ status: "signed-in", user: fresh, token: current.token });
      }
    } catch {
      // Offline, slow or the server is down: keep working from the stored session. A 401 has
      // marked it expired already.
    }
    return state.get();
  }

  return {
    state,
    baseUrl,
    api,
    token,
    user,
    markExpired,

    load,
    check,
    async restore() {
      await load();
      return check();
    },

    async signIn(input) {
      challenge = null;
      const { response, data } = await api.send("POST", "/auth/sign-in/email", {
        auth: false,
        body: { email: input.email, password: input.password },
      });
      const pending = response.headers.get(TWO_FACTOR_HEADER);
      if ((data as { twoFactorRedirect?: unknown } | null)?.twoFactorRedirect === true) {
        if (!pending) throw new Error("The server asked for a second factor but sent no challenge");
        challenge = { value: pending, expiresAt: Date.now() + 10 * 60_000 };
        throw new ApiError("client", "Enter the code from your authenticator app", 200, {
          code: TWO_FACTOR_REQUIRED,
          message: "Enter the code from your authenticator app",
        });
      }
      return adopt(response, data);
    },

    async verifySignIn(input) {
      if (!challenge || challenge.expiresAt < Date.now()) {
        challenge = null;
        throw new ApiError("client", "The sign-in took too long. Sign in again.", null, {
          code: "two_factor_expired",
          message: "The sign-in took too long. Sign in again.",
        });
      }
      const path =
        input.method === "backup"
          ? "/auth/two-factor/verify-backup-code"
          : "/auth/two-factor/verify-totp";
      const { response, data } = await api.send("POST", path, {
        auth: false,
        body: { code: input.code.replace(/\s+/g, "") },
        headers: { [TWO_FACTOR_HEADER]: challenge.value },
      });
      challenge = null;
      return adopt(response, data);
    },

    async signUp(input) {
      const { response, data } = await api.send("POST", "/auth/sign-up/email", {
        auth: false,
        body: {
          email: input.email,
          password: input.password,
          name: input.name ?? input.email.split("@")[0] ?? input.email,
        },
      });
      return adopt(response, data);
    },

    socialUrl(provider, returnTo) {
      return `${baseUrl}/v1/auth/social/${provider}?return_to=${encodeURIComponent(returnTo)}`;
    },

    async signInWithToken(oneTime) {
      const { data } = await api.send("POST", "/auth/one-time-token/verify", {
        auth: false,
        body: { token: oneTime },
      });
      const body = data as { session?: { token?: string }; user?: Record<string, unknown> } | null;
      const issued = body?.session?.token;
      if (!issued || !body?.user) throw new Error("The server did not return a session");
      const signedIn = toUser(body.user);
      await persist({ token: issued, user: signedIn });
      state.set({ status: "signed-in", user: signedIn, token: issued });
      return signedIn;
    },

    async signOut() {
      if (token()) {
        await api.post("/auth/sign-out").catch(() => {});
      }
      await persist(null);
      state.set({ status: "signed-out" });
    },

    async setImage(image) {
      const current = state.get();
      if (current.status !== "signed-in") throw new ApiError("auth", "Not signed in", 401);
      await api.post("/auth/update-user", { image });
      const data = await api.get<{ user?: Record<string, unknown> } | null>(
        "/auth/get-session?disableCookieCache=true",
      );
      const fresh = data?.user ? toUser(data.user) : { ...current.user, image };
      await persist({ token: current.token, user: fresh });
      state.set({ status: "signed-in", user: fresh, token: current.token });
      return fresh;
    },

    twoFactor: {
      async hasPassword() {
        const accounts = await api.get<Array<{ providerId?: string }>>("/auth/list-accounts");
        return accounts.some((account) => account.providerId === "credential");
      },
      async enable(password) {
        const data = await api.post<{ totpURI?: string; backupCodes?: string[] }>(
          "/auth/two-factor/enable",
          { password },
        );
        if (!data.totpURI || !data.backupCodes) throw new Error("The server sent no setup");
        return { uri: data.totpURI, backupCodes: data.backupCodes };
      },
      async confirm(code) {
        const previous = token();
        const { response } = await api.send("POST", "/auth/two-factor/verify-totp", {
          body: { code: code.replace(/\s+/g, "") },
          keepSessionOn401: true,
        });
        return takeOver(response, previous ?? "");
      },
      async disable(password) {
        const previous = token();
        const { response } = await api.send("POST", "/auth/two-factor/disable", {
          body: { password },
        });
        return takeOver(response, previous ?? "");
      },
      async backupCodes(password) {
        const data = await api.post<{ backupCodes?: string[] }>(
          "/auth/two-factor/generate-backup-codes",
          { password },
        );
        if (!data.backupCodes) throw new Error("The server sent no backup codes");
        return data.backupCodes;
      },
    },

    async workspaces() {
      return (await api.get<{ workspaces: WorkspaceSummary[] }>("/v1/workspaces")).workspaces;
    },
    createWorkspace: (input) => api.post<WorkspaceSummary>("/v1/workspaces", input),
    async teamspaces(workspaceId) {
      return (
        await api.get<{ teamspaces: TeamspaceSummary[] }>(
          `/v1/workspaces/${encodeURIComponent(workspaceId)}/teamspaces`,
        )
      ).teamspaces;
    },
  };
}

function toUser(raw: Record<string, unknown>): SessionUser {
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return {
    id: text(raw.id),
    email: text(raw.email),
    name: text(raw.name) || text(raw.email),
    image: typeof raw.image === "string" ? raw.image : null,
    twoFactorEnabled: raw.twoFactorEnabled === true,
  };
}

// ---- Window scope (plan §4): an immutable startup choice per window.

// "local": the browser's private database or a folder; "hosted": a workspace in the core, synced
// for one signed-in user. A window never changes scope while open: signing in, out or handing a
// local workspace off reopens the window with the new scope.
export type WindowScope =
  | { readonly kind: "local"; readonly workspaceId: string | null }
  | { readonly kind: "hosted"; readonly workspaceId: string };

export function formatScope(scope: WindowScope): string {
  if (scope.kind === "hosted") return `hosted:${scope.workspaceId}`;
  return scope.workspaceId ? `local:${scope.workspaceId}` : "local";
}

export function parseScope(value: string | null | undefined): WindowScope | null {
  if (!value) return null;
  if (value === "local") return Object.freeze({ kind: "local", workspaceId: null });
  const match = /^(local|hosted):(.+)$/.exec(value);
  if (!match) return null;
  return Object.freeze({ kind: match[1] as "local" | "hosted", workspaceId: match[2]! });
}

// The PowerSync database of a signed-in user: every hosted workspace of that user syncs into one
// file (sync streams are per user), and each window filters by its workspace. A different user
// gets a different file, so signing in as someone else never mixes data.
export function hostedDatabaseName(userId: string): string {
  return `lydie-hosted-${userId.replace(/[^A-Za-z0-9_-]/g, "_")}.sqlite`;
}

export type ScopeChoice =
  | { scope: WindowScope; reason: "preferred" | "fallback" }
  // Hosted was preferred, but there is no usable session: show sign-in, or open local.
  | { scope: WindowScope; reason: "needs-sign-in"; wanted: WindowScope };

const SCOPE_KEY = "lydie.scope";

// Remembers which scope the next window opens in, and decides it at startup. The decision is made
// once; the result is frozen and must be passed to everything that opens a database.
export function createScopePreference(storage: KeyValueStorage) {
  return {
    async get(): Promise<WindowScope | null> {
      return parseScope(await storage.get(SCOPE_KEY));
    },
    async set(scope: WindowScope): Promise<void> {
      await storage.set(SCOPE_KEY, formatScope(scope));
    },
    async choose(session: SessionState, fallback: WindowScope): Promise<ScopeChoice> {
      const wanted = parseScope(await storage.get(SCOPE_KEY));
      if (!wanted) return { scope: Object.freeze({ ...fallback }), reason: "fallback" };
      if (wanted.kind === "hosted" && session.status === "signed-out") {
        return { scope: Object.freeze({ ...fallback }), reason: "needs-sign-in", wanted };
      }
      // "expired" still opens hosted: the data is local; sync waits for a new sign-in.
      return { scope: wanted, reason: "preferred" };
    },
  };
}
