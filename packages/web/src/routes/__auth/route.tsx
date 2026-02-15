import { useQuery } from "@tanstack/react-query";
import { Outlet, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { LoadingScreen } from "@/components/layout/LoadingScreen";
import { AssistantPreferencesProvider } from "@/context/assistant-preferences.context";
import { getSessionQuery, hasLoadedSession, type ExtendedSessionData } from "@/lib/auth/session";

const QUERY_CACHE_KEY = "lydie:query:cache:session";

export const Route = createFileRoute("/__auth")({
  component: RouteComponent,
  ssr: false,
  beforeLoad: ({ context }) => {
    const auth = context.auth as ExtendedSessionData | undefined;

    // Only redirect if we have confirmed there's no session (data was fetched)
    if (!auth?.user && hasLoadedSession(context.queryClient)) {
      throw redirect({
        to: "/auth",
        search: {
          redirect: typeof window !== "undefined" ? window.location.pathname : undefined,
        },
      });
    }
  },
});

function RouteComponent() {
  const router = useRouter();
  const hasCheckedAuth = useRef(false);

  // Load session - uses cached data immediately, then refetches with staleTime: 0
  const { data: sessionData, isLoading } = useQuery(getSessionQuery());

  useEffect(() => {
    // Clear persisted cache when on auth page
    try {
      localStorage.removeItem(QUERY_CACHE_KEY);
    } catch {
      // Ignore errors
    }

    // Only redirect once after initial load completes (not on background refetch)
    if (!isLoading && !hasCheckedAuth.current) {
      hasCheckedAuth.current = true;

      if (!sessionData?.user) {
        // Use href for external route navigation
        const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
        void router.navigate({
          href: `/auth?redirect=${encodeURIComponent(currentPath)}`,
        });
      }
    }
  }, [isLoading, sessionData, router]);

  // Show loading while checking auth
  if (isLoading) {
    return <LoadingScreen />;
  }

  // If not authenticated, don't render (redirect is happening)
  if (!sessionData?.user) {
    return null;
  }

  return (
    <AssistantPreferencesProvider>
      <Outlet />
    </AssistantPreferencesProvider>
  );
}
