import type { QueryClient } from "@tanstack/react-query";
import { authClient } from "@/utils/auth";

const SESSION_QUERY_KEY = ["auth", "getSession"];
const STALE_TIME = 5 * 60 * 1000;

type SessionData = Awaited<ReturnType<typeof authClient.getSession>>["data"];

// Extended session type that includes organizations from customSession plugin
type ExtendedSessionData = SessionData & {
  session?: {
    organizations?: Array<{
      id: string;
      name: string;
      slug: string | null;
      [key: string]: any;
    }>;
  };
};

export type LoadSessionResult = {
  auth: SessionData | undefined;
  organizations: Array<{
    id: string;
    name: string;
    slug: string | null;
    [key: string]: any;
  }>;
};

/**
 * Fetch session data from the server
 */
async function fetchSession() {
  const response = await authClient.getSession();
  return response.data;
}

/**
 * Load session data, using cache when available
 */
export async function loadSession(
  queryClient: QueryClient
): Promise<LoadSessionResult> {
  const data = (await queryClient.ensureQueryData({
    queryKey: SESSION_QUERY_KEY,
    queryFn: fetchSession,
    staleTime: STALE_TIME,
    retry: 2,
  })) as ExtendedSessionData;

  return {
    auth: data || undefined,
    organizations: data?.session?.organizations || [],
  };
}

/**
 * Revalidate session data by forcing a fresh fetch from the server
 */
export async function revalidateSession(queryClient: QueryClient) {
  await queryClient.fetchQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: fetchSession,
    staleTime: 0,
  });
}

/**
 * Clear session data (useful for logout)
 */
export async function clearSession(queryClient: QueryClient) {
  await queryClient.invalidateQueries({
    queryKey: SESSION_QUERY_KEY,
  });
  queryClient.removeQueries({
    queryKey: SESSION_QUERY_KEY,
  });
}
