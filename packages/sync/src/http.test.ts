import { describe, expect, test } from "bun:test";

import { ApiError, createApiClient } from "./http.ts";
import type { FetchLike } from "./types.ts";

// Answers only when the request's signal aborts, like a connection that never gets a reply.
const stalled: FetchLike = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  });

describe("createApiClient", () => {
  test("a request with timeoutMs fails as a network error when nothing answers", async () => {
    const api = createApiClient({ baseUrl: "http://core", token: () => null, fetch: stalled });
    const error = await api.get("/auth/get-session", { timeoutMs: 20 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("network");
  });

  test("the caller's own abort is passed through, timeout or not", async () => {
    const api = createApiClient({ baseUrl: "http://core", token: () => null, fetch: stalled });
    const controller = new AbortController();
    const pending = api
      .get("/v1/workspaces", { signal: controller.signal, timeoutMs: 10_000 })
      .catch((e: unknown) => e);
    controller.abort(new Error("stop"));
    const error = await pending;
    expect(error).not.toBeInstanceOf(ApiError);
    expect((error as Error).message).toBe("stop");
  });

  test("a request that answers in time is not affected", async () => {
    const api = createApiClient({
      baseUrl: "http://core",
      token: () => null,
      fetch: async () => Response.json({ ok: true }),
    });
    expect(await api.get("/v1/ping", { timeoutMs: 1000 })).toEqual({ ok: true });
  });
});
