import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { LoadingScreen } from "@/components/layout/LoadingScreen";
import { AssistantPreferencesProvider } from "@/context/assistant-preferences.context";
import { getSessionQuery } from "@/lib/auth/session";

const QUERY_CACHE_KEY = "lydie:query:cache:session";

export const Route = createFileRoute("/__auth")({
  component: RouteComponent,
  ssr: false,
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
        void router.navigate({ to: "/auth" });
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
