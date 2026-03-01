import { useQuery } from "@tanstack/react-query";
import { Outlet, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { LoadingScreen } from "@/components/layout/LoadingScreen";
import { AssistantPreferencesProvider } from "@/context/assistant-preferences.context";
import {
  clearPersistedSessionCache,
  getSessionQuery,
  hasLoadedSession,
  SESSION_QUERY_KEY,
  type ExtendedSessionData,
} from "@/lib/auth/session";

export const Route = createFileRoute("/__auth")({
  component: RouteComponent,
  ssr: false,
  beforeLoad: ({ context }) => {
    const auth = context.auth as ExtendedSessionData | undefined;

    if (!auth?.user && hasLoadedSession(context.queryClient)) {
      context.queryClient.setQueryData(SESSION_QUERY_KEY, undefined);
      clearPersistedSessionCache();

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
  const { data: sessionData, isLoading } = useQuery(getSessionQuery());

  useEffect(() => {
    if (isLoading || sessionData?.user) {
      return;
    }

    const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
    void router.navigate({
      href: `/auth?redirect=${encodeURIComponent(currentPath)}`,
    });
  }, [isLoading, sessionData, router]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!sessionData?.user) {
    return null;
  }

  return (
    <AssistantPreferencesProvider>
      <Outlet />
    </AssistantPreferencesProvider>
  );
}
