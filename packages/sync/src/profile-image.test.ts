import { describe, expect, test } from "bun:test";

import { createSession } from "./session.ts";
import type { FetchLike, SecretStorage } from "./types.ts";

// Better Auth's update-user and get-session as the core serves them: the picture is stored on the
// user (the core copies it to their memberships).
function fakeAuth() {
  const user: { id: string; email: string; name: string; image: string | null } = {
    id: "u1",
    email: "ada@x.dev",
    name: "Ada",
    image: null,
  };
  const token = "token-1";
  const json = (body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json", ...headers },
    });
  const fetch: FetchLike = async (input, init) => {
    const path = new URL(input).pathname;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const authed = headers.authorization === `Bearer ${token}`;
    switch (path) {
      case "/auth/sign-in/email":
        return json({ token, user }, { "set-auth-token": token });
      case "/auth/update-user": {
        if (!authed) return new Response(JSON.stringify({ code: "UNAUTHORIZED" }), { status: 401 });
        const body = JSON.parse(init?.body as string) as { image: string | null };
        user.image = body.image;
        return json({ status: true });
      }
      case "/auth/get-session":
        return authed ? json({ session: { token }, user }) : json(null);
      default:
        return new Response("{}", { status: 404 });
    }
  };
  return { fetch, user };
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

describe("profile picture", () => {
  test("setImage stores it on the account, and the session and stored user follow", async () => {
    const core = fakeAuth();
    const secrets = memorySecrets();
    const session = createSession({ baseUrl: "http://core.test", secrets, fetch: core.fetch });
    await session.signIn({ email: "ada@x.dev", password: "password1234" });

    const drawn = "data:image/svg+xml,%3Csvg%2F%3E";
    const user = await session.setImage(drawn);
    expect(user.image).toBe(drawn);
    expect(core.user.image).toBe(drawn);
    const state = session.state.get();
    expect(state.status === "signed-in" && state.user.image).toBe(drawn);
    expect([...secrets.data.values()].some((v) => v.includes("svg"))).toBe(true);

    // Null goes back to the generated avatar.
    expect((await session.setImage(null)).image).toBeNull();
  });
});
