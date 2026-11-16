import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFileKv, HostedManager, nodeFetch } from "./hosted.ts";

const dirs: string[] = [];
afterEach(async () => {
  // Let preference writes finish before removing their folder.
  await Bun.sleep(20);
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function memorySecrets(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get: async (key: string) => values.get(key) ?? null,
    set: async (key: string, value: string) => void values.set(key, value),
    delete: async (key: string) => void values.delete(key),
  };
}

const API = "http://api.test";
const user = { id: "u1", email: "u@example.com", name: "U", image: null, twoFactorEnabled: false };

// A core that knows the stored session (or is unreachable).
async function manager(options: {
  signedIn: boolean;
  preferred?: string;
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
}) {
  const dir = mkdtempSync(join(tmpdir(), "lydie-hosted-"));
  dirs.push(dir);
  const kv = createFileKv(join(dir, "account.json"));
  if (options.preferred) await kv.set("lydie.scope", options.preferred);
  const secrets = memorySecrets(
    options.signedIn ? { [`lydie.session:${API}`]: JSON.stringify({ token: "t", user }) } : {},
  );
  return new HostedManager({
    dataDir: dir,
    apiUrl: API,
    secrets,
    kv,
    fetch: options.fetch ?? (async () => Response.json({ user })),
  });
}

// A core that never answers, until `answer` is called.
function stalledCore() {
  let answer: (response: Response) => void = () => {};
  const reply = new Promise<Response>((resolve) => (answer = resolve));
  return { fetch: () => reply, answer: (response: Response) => answer(response) };
}

describe("desktop window scopes", () => {
  test("a folder window shows its folder", async () => {
    const m = await manager({ signedIn: true, preferred: "hosted:w1" });
    const info = await m.scopeFor("win", { kind: "local", folder: { id: "/f", name: "f" } });
    expect(info.scope).toEqual({ kind: "local", workspaceId: null });
  });

  test("a window without a folder opens the remembered hosted workspace when signed in", async () => {
    const m = await manager({ signedIn: true, preferred: "hosted:w1" });
    expect((await m.scopeFor("win", { kind: "none" })).scope).toEqual({
      kind: "hosted",
      workspaceId: "w1",
    });
  });

  test("signed out, it shows the start screen and remembers what it wanted", async () => {
    const m = await manager({ signedIn: false, preferred: "hosted:w1" });
    const info = await m.scopeFor("win", { kind: "none" });
    expect(info.scope).toBeNull();
    expect(info.wanted).toEqual({ kind: "hosted", workspaceId: "w1" });
  });

  test("windows open from the stored session without waiting for the server", async () => {
    const core = stalledCore();
    const m = await manager({ signedIn: true, preferred: "hosted:w1", fetch: core.fetch });
    expect((await m.scopeFor("win", { kind: "none" })).scope).toEqual({
      kind: "hosted",
      workspaceId: "w1",
    });
    expect(m.session.state.get().status).toBe("signed-in");
    // The server's answer arrives later and moves the session on.
    core.answer(Response.json({ message: "no" }, { status: 401 }));
    await Bun.sleep(10);
    expect(m.session.state.get().status).toBe("expired");
  });

  test("a folder window does not wait for the session at all", async () => {
    const m = await manager({
      signedIn: true,
      preferred: "hosted:w1",
      fetch: stalledCore().fetch,
    });
    const info = await m.scopeFor("win", { kind: "local", folder: { id: "/f", name: "f" } });
    expect(info.scope).toEqual({ kind: "local", workspaceId: null });
  });

  test("the scope is fixed until setScope, which applies on the next load", async () => {
    const m = await manager({ signedIn: true });
    expect((await m.scopeFor("win", { kind: "none" })).scope).toBeNull();
    await m.setScope("win", { kind: "hosted", workspaceId: "w2" });
    expect((await m.scopeFor("win", { kind: "none" })).scope).toEqual({
      kind: "hosted",
      workspaceId: "w2",
    });
    // New windows open it too.
    expect((await m.scopeFor("other", { kind: "none" })).scope?.kind).toBe("hosted");
  });
});

test("nodeFetch sends no Sec-Fetch headers", async () => {
  let seen: Record<string, string> = {};
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      seen = Object.fromEntries(request.headers);
      return Response.json({ ok: true }, { status: 201 });
    },
  });
  try {
    const response = await nodeFetch(`http://127.0.0.1:${server.port}/x`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    expect(Object.keys(seen).some((k) => k.startsWith("sec-fetch"))).toBe(false);
    expect(seen.origin).toBeUndefined();
  } finally {
    server.stop(true);
  }
});

describe("sign in with Google from the desktop app", () => {
  const RETURN = "lydie://auth/callback";

  function googleManager(opened: string[], signInReturn: string | null = RETURN) {
    const dir = mkdtempSync(join(tmpdir(), "lydie-hosted-"));
    dirs.push(dir);
    return new HostedManager({
      dataDir: dir,
      apiUrl: API,
      secrets: memorySecrets(),
      kv: createFileKv(join(dir, "account.json")),
      // The core: exchanges the one-time token for a session.
      fetch: async (url, init) =>
        url.endsWith("/auth/one-time-token/verify") &&
        JSON.parse(String(init?.body)).token === "ott-1"
          ? Response.json({ session: { token: "session-1" }, user })
          : Response.json(
              { error: { code: "BAD_REQUEST", message: "Invalid token" } },
              { status: 400 },
            ),
      openExternal: async (url) => void opened.push(url),
      signInReturn,
    });
  }

  test("opens the browser on the core and signs in when the deep link comes back", async () => {
    const opened: string[] = [];
    const m = googleManager(opened);
    const done = m.signInWith("google");
    await Bun.sleep(0);
    expect(opened).toEqual([
      `${API}/v1/auth/social/google?return_to=${encodeURIComponent(RETURN)}`,
    ]);
    // Other deep links still go to windows.
    expect(m.takeSignInLink("lydie://open?doc=1")).toBe(false);
    expect(m.takeSignInLink(`${RETURN}?login=ott-1`)).toBe(true);
    expect(await done).toEqual(user);
    expect(m.session.token()).toBe("session-1");
  });

  test("an error, a cancel or a newer attempt ends the wait with its code", async () => {
    const m = googleManager([]);
    const codeOf = (promise: Promise<unknown>) =>
      promise.then(
        () => "resolved",
        (error: { code?: string }) => error.code,
      );

    const denied = codeOf(m.signInWith("google"));
    await Bun.sleep(0);
    m.takeSignInLink(`${RETURN}?login_error=access_denied`);
    expect(await denied).toBe("access_denied");

    const cancelled = codeOf(m.signInWith("google"));
    await Bun.sleep(0);
    m.cancelSignInWith();
    expect(await cancelled).toBe("cancelled");

    const first = codeOf(m.signInWith("google"));
    await Bun.sleep(0);
    const second = m.signInWith("google");
    expect(await first).toBe("superseded");
    m.cancelSignInWith();
    await second.catch(() => {});
    // A late link after the app stopped waiting is swallowed, not routed to a window.
    expect(m.takeSignInLink(`${RETURN}?login=ott-1`)).toBe(true);
  });

  test("a build that cannot receive the deep link says so", async () => {
    const m = googleManager([], null);
    const error = (await m.signInWith("google").catch((e: unknown) => e)) as { code: string };
    expect(error.code).toBe("unavailable");
    expect(m.takeSignInLink(`${RETURN}?login=x`)).toBe(false);
  });
});
