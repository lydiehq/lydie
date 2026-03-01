import { beforeEach, describe, expect, it, vi } from "vitest";

import type { QueryClient } from "@tanstack/react-query";

vi.mock("@/utils/auth", () => ({
  authClient: {
    getSession: vi.fn(),
  },
}));

describe("auth session helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches session once on cold load", async () => {
    const module = await import("./session");

    const queryClient = {
      getQueryState: vi.fn().mockReturnValue(undefined),
      getQueryData: vi.fn().mockReturnValue(undefined),
      fetchQuery: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
    };

    const result = await module.loadSession(queryClient as unknown as QueryClient);

    expect(result.hadCachedSession).toBe(false);
    expect(result.auth).toEqual({ user: { id: "user-1" } });
    expect(queryClient.fetchQuery).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData).not.toHaveBeenCalled();
  });

  it("uses cached session without fetching on warm load", async () => {
    const module = await import("./session");

    const cachedSession = { user: { id: "user-1" } };
    const queryClient = {
      getQueryState: vi.fn().mockReturnValue({ dataUpdatedAt: Date.now() }),
      getQueryData: vi.fn().mockReturnValue(cachedSession),
      fetchQuery: vi.fn(),
    };

    const result = await module.loadSession(queryClient as unknown as QueryClient);

    expect(result.hadCachedSession).toBe(true);
    expect(result.auth).toEqual(cachedSession);
    expect(queryClient.fetchQuery).not.toHaveBeenCalled();
    expect(queryClient.getQueryData).toHaveBeenCalledTimes(1);
  });

  it("only triggers startup revalidation once", async () => {
    const module = await import("./session");

    const queryClient = {
      fetchQuery: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
    };

    await module.revalidateSessionOnStartup(queryClient as unknown as QueryClient);
    await module.revalidateSessionOnStartup(queryClient as unknown as QueryClient);

    expect(queryClient.fetchQuery).toHaveBeenCalledTimes(1);
  });
});
