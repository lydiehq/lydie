import type { QueryClient } from "@tanstack/react-query";

import { authClient } from "@/utils/auth";

export const SESSION_QUERY_KEY = ["auth", "getSession"];
export const SESSION_CACHE_KEY = "lydie:query:cache:session";

const SESSION_QUERY_STALE_TIME = Number.POSITIVE_INFINITY;
const REVALIDATION_THROTTLE_MS = 30 * 1000;

type SessionData = Awaited<ReturnType<typeof authClient.getSession>>["data"];

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

async function fetchSession() {
  const response = await authClient.getSession();
  return response.data;
}

export function getSessionQuery() {
  return {
    queryKey: SESSION_QUERY_KEY,
    queryFn: fetchSession,
    staleTime: SESSION_QUERY_STALE_TIME,
    retry: 2,
  };
}

export type LoadSessionResult = {
  auth: SessionData | undefined;
  hadCachedSession: boolean;
};

export function getCachedSession(queryClient: QueryClient): ExtendedSessionData | undefined {
  return queryClient.getQueryData<ExtendedSessionData>(SESSION_QUERY_KEY);
}

export function hasLoadedSession(queryClient: QueryClient): boolean {
  const state = queryClient.getQueryState(SESSION_QUERY_KEY);
  return Boolean(state?.dataUpdatedAt);
}

let lastRevalidationTime = 0;

export function shouldThrottleRevalidation(): boolean {
  const now = Date.now();
  if (now - lastRevalidationTime < REVALIDATION_THROTTLE_MS) {
    return true;
  }
  lastRevalidationTime = now;
  return false;
}

export async function loadSession(queryClient: QueryClient): Promise<LoadSessionResult> {
  const hadCachedSession = hasLoadedSession(queryClient);

  const data = hadCachedSession
    ? getCachedSession(queryClient)
    : ((await queryClient.fetchQuery({
        queryKey: SESSION_QUERY_KEY,
        queryFn: fetchSession,
        staleTime: SESSION_QUERY_STALE_TIME,
        retry: 2,
      })) as ExtendedSessionData);

  return {
    auth: data || undefined,
    hadCachedSession,
  };
}

export async function revalidateSession(queryClient: QueryClient) {
  await queryClient.fetchQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: fetchSession,
    staleTime: 0,
  });
}

let hasTriggeredStartupRevalidation = false;

export async function revalidateSessionOnStartup(queryClient: QueryClient) {
  if (hasTriggeredStartupRevalidation || shouldThrottleRevalidation()) {
    return;
  }

  hasTriggeredStartupRevalidation = true;
  await revalidateSession(queryClient);
}

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

export function clearPersistedSessionCache() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(SESSION_CACHE_KEY);
  } catch {}
}

export async function clearSession(queryClient: QueryClient) {
  await queryClient.cancelQueries({
    queryKey: SESSION_QUERY_KEY,
  });

  queryClient.clear();
  clearPersistedSessionCache();
}
