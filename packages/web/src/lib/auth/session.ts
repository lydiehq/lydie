import type { QueryClient } from "@tanstack/react-query";

import { authClient } from "@/utils/auth";

export const SESSION_QUERY_KEY = ["auth", "getSession"];

// 5 minutes - how long cached session data is considered fresh
const SESSION_CACHE_STALE_TIME = 5 * 60 * 1000;

// 30 seconds - minimum time between background revalidation calls
const REVALIDATION_THROTTLE_MS = 30 * 1000;

type SessionData = Awaited<ReturnType<typeof authClient.getSession>>["data"];

// Extended session type that includes organizations from customSession plugin
export type ExtendedSessionData = SessionData & {
  session?: {
    organizations?: Array<{
      id: string;
      name: string;
      slug: string;
      [key: string]: any;
    }>;
    activeOrganizationSlug?: string;
  };
};

// Fetch session data from the server
async function fetchSession() {
  const response = await authClient.getSession();
  return response.data;
}

// Query configuration for use in components (always revalidates on mount)
export function getSessionQuery() {
  return {
    queryKey: SESSION_QUERY_KEY,
    queryFn: fetchSession,
    staleTime: 0, // Always revalidate on mount to catch auth state changes
    retry: 2,
  };
}

export type LoadSessionResult = {
  auth: SessionData | undefined;
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    [key: string]: any;
  }>;
};

// Get cached session without triggering a fetch
export function getCachedSession(queryClient: QueryClient): ExtendedSessionData | undefined {
  return queryClient.getQueryData<ExtendedSessionData>(SESSION_QUERY_KEY);
}

// Check if session has been loaded at least once
export function hasLoadedSession(queryClient: QueryClient): boolean {
  const state = queryClient.getQueryState(SESSION_QUERY_KEY);
  return Boolean(state?.dataUpdatedAt);
}

// Throttled background revalidation - prevents spam on rapid route changes
let lastRevalidationTime = 0;

export function shouldThrottleRevalidation(): boolean {
  const now = Date.now();
  if (now - lastRevalidationTime < REVALIDATION_THROTTLE_MS) {
    return true;
  }
  lastRevalidationTime = now;
  return false;
}

// Load session data for route loaders - uses cache when fresh
export async function loadSession(queryClient: QueryClient): Promise<LoadSessionResult> {
  const data = (await queryClient.ensureQueryData({
    queryKey: SESSION_QUERY_KEY,
    queryFn: fetchSession,
    staleTime: SESSION_CACHE_STALE_TIME,
    retry: 2,
  })) as ExtendedSessionData;

  return {
    auth: data || undefined,
    organizations: data?.session?.organizations || [],
  };
}

// Revalidate session data by forcing a fresh fetch from the server
export async function revalidateSession(queryClient: QueryClient) {
  await queryClient.fetchQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: fetchSession,
    staleTime: 0,
  });
}

// Wait for session to reflect organization changes (with retries)
export async function waitForSessionUpdate(
  queryClient: QueryClient,
  checkFn: (session: ExtendedSessionData | undefined) => boolean,
  maxAttempts = 10,
  delayMs = 200,
): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const session = (await queryClient.fetchQuery({
      queryKey: SESSION_QUERY_KEY,
      queryFn: fetchSession,
      staleTime: 0,
    })) as ExtendedSessionData | undefined;

    if (checkFn(session)) {
      return true;
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return false;
}

// Clear session data (useful for logout)
export function clearSession(queryClient: QueryClient) {
  // Cancel all ongoing queries to prevent race conditions
  queryClient.cancelQueries({
    queryKey: SESSION_QUERY_KEY,
  });

  // Clear all queries (more thorough than just removing session)
  queryClient.clear();

  // Clear persisted cache from localStorage to prevent stale data on next visit
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem("lydie:query:cache:session");
    } catch {
      // Ignore localStorage errors
    }
  }
}
