import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { LoadingScreen } from "@/components/layout/LoadingScreen";
import { AssistantPreferencesProvider } from "@/context/assistant-preferences.context";
import { getSessionQuery, type ExtendedSessionData } from "@/lib/auth/session";

const QUERY_CACHE_KEY = "lydie:query:cache:session";

export const Route = createFileRoute("/__auth")({
  component: RouteComponent,
  ssr: false,
  beforeLoad: ({ context }) => {
    const auth = context.auth as ExtendedSessionData | undefined;

    // Redirect to auth page if user is not authenticated
    if (!auth?.user) {
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
  const queryClient = useQueryClient();
  const hasCheckedAuth = useRef(false);

  // Load session - uses cached data immediately, then refetches with staleTime: 0
  const { data: sessionData, isLoading } = useQuery(getSessionQuery());

  useEffect(() => {
    // Only redirect once after initial load completes (not on background refetch)
    if (!isLoading && !hasCheckedAuth.current) {
      hasCheckedAuth.current = true;

      if (!sessionData?.user) {
        // Clear persisted cache to prevent stale data
        try {
          localStorage.removeItem(QUERY_CACHE_KEY);
        } catch {
          // Ignore errors
        }
        // Use href for external route navigation
        const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
        void router.navigate({
          href: `/auth?redirect=${encodeURIComponent(currentPath)}`,
        });
      }
    }
  }, [isLoading, sessionData, router, queryClient]);

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
