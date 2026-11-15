import { describe, expect, test } from "bun:test";

import { isApiError } from "./http.ts";
import { createSession, TWO_FACTOR_REQUIRED } from "./session.ts";
import type { FetchLike, SecretStorage } from "./types.ts";

// Better Auth's two-factor endpoints as the core serves them (modules/auth/two-factor.ts): the
// pending sign-in travels in `lydie-two-factor`, and turning it on or off replaces the session.
function fakeAuth() {
  const user = { id: "u1", email: "ada@x.dev", name: "Ada", image: null, twoFactorEnabled: false };
  let token = "token-1";
  const calls: Array<{ path: string; headers: Record<string, string>; body: unknown }> = [];
  const json = (body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json", ...headers },
    });
  const fail = (status: number, code: string) =>
    new Response(JSON.stringify({ code, message: code }), { status });
  const fetch: FetchLike = async (input, init) => {
    const path = new URL(input).pathname;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body ? (JSON.parse(init.body as string) as Record<string, string>) : null;
    calls.push({ path, headers, body });
    const authed = headers.authorization === `Bearer ${token}`;
    switch (path) {
      case "/auth/sign-in/email":
        if (!user.twoFactorEnabled) return json({ token, user }, { "set-auth-token": token });
        return json(
          { twoFactorRedirect: true, twoFactorMethods: ["totp"] },
          { "lydie-two-factor": "better-auth.two_factor=challenge" },
        );
      case "/auth/two-factor/verify-totp":
        if (authed) {
          if (body?.code !== "123456") return fail(401, "INVALID_CODE");
          user.twoFactorEnabled = true;
          token = "token-2";
          return json({ token: "token-1", user }, { "set-auth-token": token });
        }
        if (headers["lydie-two-factor"] !== "better-auth.two_factor=challenge") {
          return fail(401, "INVALID_TWO_FACTOR_COOKIE");
        }
        if (body?.code !== "123456") return fail(401, "INVALID_CODE");
        token = "token-3";
        return json({ token, user }, { "set-auth-token": token });
      case "/auth/two-factor/verify-backup-code":
        if (headers["lydie-two-factor"] !== "better-auth.two_factor=challenge") {
          return fail(401, "INVALID_TWO_FACTOR_COOKIE");
        }
        token = "token-4";
        return json({ token, user }, { "set-auth-token": token });
      case "/auth/two-factor/enable":
        if (!authed) return fail(401, "UNAUTHORIZED");
        if (body?.password !== "password1234") return fail(400, "INVALID_PASSWORD");
        return json({ totpURI: "otpauth://totp/Lydie:ada@x.dev?secret=ABC", backupCodes: ["a-1"] });
      case "/auth/two-factor/disable":
        if (!authed) return fail(401, "UNAUTHORIZED");
        user.twoFactorEnabled = false;
        token = "token-5";
        return json({ status: true }, { "set-auth-token": token });
      case "/auth/get-session":
        return authed ? json({ session: { token }, user }) : json(null);
      case "/auth/list-accounts":
        return json([{ providerId: "credential" }]);
      default:
        return fail(404, "NOT_FOUND");
    }
  };
  return { fetch, calls, user };
}

function memorySecrets(): SecretStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => void data.set(key, value),
    delete: async (key) => void data.delete(key),
  };
}

describe("two-step verification", () => {
  test("turning it on: the setup, then a code from the app, which replaces the token", async () => {
    const core = fakeAuth();
    const secrets = memorySecrets();
    const session = createSession({ baseUrl: "http://core.test", secrets, fetch: core.fetch });
    await session.signIn({ email: "ada@x.dev", password: "password1234" });
    expect(await session.twoFactor.hasPassword()).toBe(true);

    const wrong = await session.twoFactor.enable("nope").catch((e: unknown) => e);
    expect(isApiError(wrong) && wrong.code).toBe("INVALID_PASSWORD");
    const setup = await session.twoFactor.enable("password1234");
    expect(setup).toEqual({
      uri: "otpauth://totp/Lydie:ada@x.dev?secret=ABC",
      backupCodes: ["a-1"],
    });

    // A mistyped code is refused with a 401 that is about the code, not the session.
    const mistyped = await session.twoFactor.confirm("000000").catch((e: unknown) => e);
    expect(isApiError(mistyped) && mistyped.code).toBe("INVALID_CODE");
    expect(session.state.get().status).toBe("signed-in");

    const user = await session.twoFactor.confirm("123 456");
    expect(user.twoFactorEnabled).toBe(true);
    expect(session.token()).toBe("token-2");
    expect(JSON.parse(secrets.data.get("lydie.session:http://core.test")!)).toMatchObject({
      token: "token-2",
      user: { twoFactorEnabled: true },
    });

    const off = await session.twoFactor.disable("password1234");
    expect(off.twoFactorEnabled).toBe(false);
    expect(session.token()).toBe("token-5");
  });

  test("a sign-in that needs a code rejects, then finishes with the code", async () => {
    const core = fakeAuth();
    core.user.twoFactorEnabled = true;
    const session = createSession({
      baseUrl: "http://core.test",
      secrets: memorySecrets(),
      fetch: core.fetch,
    });
    const pending = await session
      .signIn({ email: "ada@x.dev", password: "password1234" })
      .catch((e: unknown) => e);
    expect(isApiError(pending) && pending.code).toBe(TWO_FACTOR_REQUIRED);
    expect(session.state.get().status).toBe("signed-out");

    const wrong = await session
      .verifySignIn({ code: "000000", method: "app" })
      .catch((e: unknown) => e);
    expect(isApiError(wrong) && wrong.code).toBe("INVALID_CODE");

    // A mistyped code can be corrected (the core allows five tries per sign-in).
    const user = await session.verifySignIn({ code: "123456", method: "app" });
    expect(user.email).toBe("ada@x.dev");
    expect(session.state.get().status).toBe("signed-in");
    expect(session.token()).toBe("token-3");
    const verify = core.calls.findLast((call) => call.path === "/auth/two-factor/verify-totp");
    expect(verify?.headers.authorization).toBeUndefined();

    // Used once.
    const used = await session
      .verifySignIn({ code: "123456", method: "app" })
      .catch((e: unknown) => e);
    expect(isApiError(used) && used.code).toBe("two_factor_expired");
  });

  test("a backup code instead of the app", async () => {
    const core = fakeAuth();
    core.user.twoFactorEnabled = true;
    const session = createSession({
      baseUrl: "http://core.test",
      secrets: memorySecrets(),
      fetch: core.fetch,
    });
    await session.signIn({ email: "ada@x.dev", password: "password1234" }).catch(() => {});
    await session.verifySignIn({ code: "a-1", method: "backup" });
    expect(session.token()).toBe("token-4");
  });
});
