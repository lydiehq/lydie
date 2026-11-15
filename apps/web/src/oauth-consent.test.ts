import { describe, expect, test } from "bun:test";

import { decide, describeScope, loadRequest, safeLogo } from "./oauth-consent.ts";
import type { ConsentApi } from "./oauth-consent.ts";

// A fake of the server's consent routes.
function fakeServer() {
  const calls: { id: string; input: unknown }[] = [];
  const pending = new Map([
    [
      "req1",
      {
        id: "req1",
        client: {
          name: "Claude",
          redirectHost: "claude.ai",
          logoUri: "https://claude.ai/logo.png",
        },
        scopes: ["docs:read", "docs:write"],
        expiresAt: "2026-11-13T04:00:00.000Z",
      },
    ],
  ]);
  const call = async (id: string, input: Record<string, unknown>) => {
    calls.push({ id, input });
    const found = pending.get(String(input.id));
    if (!found) throw Object.assign(new Error("No such request"), { status: 404 });
    if (id === "oauth.getRequest") return found;
    pending.delete(found.id);
    return {
      redirectTo: input.approve
        ? "https://claude.ai/callback?code=abc&state=s"
        : "https://claude.ai/callback?error=access_denied&state=s",
    };
  };
  // The fake answers only the two consent operations.
  return { api: { call } as unknown as ConsentApi, calls };
}

describe("OAuth consent", () => {
  test("loads a pending request; an unknown or used one is gone", async () => {
    const { api } = fakeServer();
    const loaded = await loadRequest(api, "req1");
    expect(loaded.status).toBe("ok");
    if (loaded.status === "ok") expect(loaded.request.client.name).toBe("Claude");
    expect(await loadRequest(api, "nope")).toEqual({ status: "gone" });
  });

  test("approving sends the workspace and scopes and returns where to go", async () => {
    const { api, calls } = fakeServer();
    const to = await decide(api, "req1", {
      approve: true,
      workspaceId: "w1",
      scopes: ["docs:read"],
    });
    expect(to).toContain("code=abc");
    expect(calls.at(-1)).toEqual({
      id: "oauth.decide",
      input: { id: "req1", approve: true, workspaceId: "w1", scopes: ["docs:read"] },
    });
    // Used once.
    expect(await loadRequest(api, "req1")).toEqual({ status: "gone" });
  });

  test("denying returns the app's error redirect", async () => {
    const { api } = fakeServer();
    expect(await decide(api, "req1", { approve: false })).toContain("error=access_denied");
  });

  test("scopes in plain words; logos only over http(s)", () => {
    expect(describeScope("docs:write")).toBe("Create, change and delete pages for you");
    expect(describeScope("custom:thing")).toBe("custom:thing");
    expect(safeLogo("https://x.test/l.png")).toBe("https://x.test/l.png");
    expect(safeLogo("javascript:alert(1)")).toBeNull();
    expect(safeLogo(null)).toBeNull();
  });
});
