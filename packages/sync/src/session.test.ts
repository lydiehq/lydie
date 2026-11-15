import { describe, expect, test } from "bun:test";

import { createFakeCore } from "../test/fake-core.ts";
import {
  createScopePreference,
  createSession,
  formatScope,
  hostedDatabaseName,
  parseScope,
  readProviderReturn,
  withoutProviderReturn,
} from "./session.ts";
import type { SecretStorage } from "./types.ts";

function memorySecrets(): SecretStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => void data.set(key, value),
    delete: async (key) => void data.delete(key),
  };
}

describe("session", () => {
  test("signs in, stores the token in secret storage and restores it", async () => {
    const core = createFakeCore();
    const secrets = memorySecrets();
    const session = createSession({ baseUrl: "http://core.test/", secrets, fetch: core.fetch });
    const user = await session.signIn({ email: "ada@x.dev", password: "password1234" });
    expect(user).toMatchObject({ id: "user-ada@x.dev", email: "ada@x.dev" });
    expect(session.token()).toBe("token-ada@x.dev");
    expect(JSON.parse(secrets.data.get("lydie.session:http://core.test")!)).toMatchObject({
      token: "token-ada@x.dev",
    });

    const again = createSession({ baseUrl: "http://core.test", secrets, fetch: core.fetch });
    expect((await again.restore()).status).toBe("signed-in");
    expect(again.user()?.id).toBe("user-ada@x.dev");
  });

  test("a provider sign-in: the URL to start it, and the one-time token it returns", async () => {
    const core = createFakeCore();
    const secrets = memorySecrets();
    const session = createSession({ baseUrl: "http://core.test", secrets, fetch: core.fetch });
    expect(session.socialUrl("google", "https://lydie.co/app/")).toBe(
      "http://core.test/v1/auth/social/google?return_to=https%3A%2F%2Flydie.co%2Fapp%2F",
    );
    const back = new URL("https://lydie.co/app/?x=1&login=one-time-ada");
    const result = readProviderReturn(back);
    expect(result).toEqual({ token: "one-time-ada" });
    expect(withoutProviderReturn(back).toString()).toBe("https://lydie.co/app/?x=1");
    expect(readProviderReturn(new URL("https://lydie.co/app/?login_error=access_denied"))).toEqual({
      error: "access_denied",
    });
    expect(readProviderReturn(new URL("https://lydie.co/app/"))).toBeNull();

    const user = await session.signInWithToken("one-time-ada");
    expect(user.email).toBe("ada@gmail.test");
    expect(session.token()).toBe("token-google-ada");
    const again = createSession({ baseUrl: "http://core.test", secrets, fetch: core.fetch });
    expect((await again.restore()).status).toBe("signed-in");

    let failed = false;
    await session.signInWithToken("used-or-wrong").catch(() => (failed = true));
    expect(failed).toBe(true);
  });

  test("a wrong password fails without touching the stored session", async () => {
    const core = createFakeCore();
    const session = createSession({
      baseUrl: "http://core.test",
      secrets: memorySecrets(),
      fetch: core.fetch,
    });
    const error = await session.signIn({ email: "a@x", password: "nope" }).catch((e: Error) => e);
    expect((error as Error).message).toContain("401");
    expect(session.state.get().status).toBe("signed-out");
  });

  test("a 401 on any request marks the session expired; signing in again recovers", async () => {
    const core = createFakeCore();
    const session = createSession({
      baseUrl: "http://core.test",
      secrets: memorySecrets(),
      fetch: core.fetch,
    });
    await session.signIn({ email: "ada@x.dev", password: "password1234" });
    core.sessions.clear();
    await session.workspaces().catch(() => {});
    expect(session.state.get()).toMatchObject({
      status: "expired",
      user: { id: "user-ada@x.dev" },
    });
    await session.signIn({ email: "ada@x.dev", password: "password1234" });
    expect(session.state.get().status).toBe("signed-in");
  });

  test("restore keeps a stored session offline and expires it when the server refuses it", async () => {
    const core = createFakeCore();
    const secrets = memorySecrets();
    const session = createSession({ baseUrl: "http://core.test", secrets, fetch: core.fetch });
    await session.signIn({ email: "ada@x.dev", password: "password1234" });

    core.hook = () => "network";
    const offline = createSession({ baseUrl: "http://core.test", secrets, fetch: core.fetch });
    expect((await offline.restore()).status).toBe("signed-in");

    core.hook = null;
    core.sessions.clear();
    const refused = createSession({ baseUrl: "http://core.test", secrets, fetch: core.fetch });
    expect((await refused.restore()).status).toBe("expired");
  });

  test("sign-out forgets the token", async () => {
    const core = createFakeCore();
    const secrets = memorySecrets();
    const session = createSession({ baseUrl: "http://core.test", secrets, fetch: core.fetch });
    await session.signIn({ email: "ada@x.dev", password: "password1234" });
    await session.signOut();
    expect(session.state.get().status).toBe("signed-out");
    expect(secrets.data.size).toBe(0);
    expect(core.sessions.has("token-ada@x.dev")).toBe(false);
  });
});

describe("window scope", () => {
  test("formats and parses", () => {
    expect(formatScope({ kind: "local", workspaceId: null })).toBe("local");
    expect(formatScope({ kind: "hosted", workspaceId: "w1" })).toBe("hosted:w1");
    expect(parseScope("hosted:w1")).toEqual({ kind: "hosted", workspaceId: "w1" });
    expect(parseScope("local:abc")).toEqual({ kind: "local", workspaceId: "abc" });
    expect(parseScope("nonsense")).toBeNull();
    expect(Object.isFrozen(parseScope("hosted:w1"))).toBe(true);
    expect(hostedDatabaseName("u/1")).toBe("lydie-hosted-u_1.sqlite");
  });

  test("chooses once at startup; hosted without a session asks to sign in", async () => {
    const prefs = createScopePreference(memorySecrets());
    const local = { kind: "local", workspaceId: null } as const;
    expect(await prefs.choose({ status: "signed-out" }, local)).toMatchObject({
      reason: "fallback",
    });
    await prefs.set({ kind: "hosted", workspaceId: "w1" });
    expect(await prefs.choose({ status: "signed-out" }, local)).toMatchObject({
      scope: local,
      reason: "needs-sign-in",
      wanted: { kind: "hosted", workspaceId: "w1" },
    });
    const user = { id: "u", email: "", name: "", image: null };
    expect(await prefs.choose({ status: "expired", user }, local)).toMatchObject({
      scope: { kind: "hosted", workspaceId: "w1" },
      reason: "preferred",
    });
  });
});
