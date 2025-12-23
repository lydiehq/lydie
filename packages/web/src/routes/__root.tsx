import type { RouterContext } from "@/main";
import { loadSession } from "@/lib/auth/session";
import {
  Outlet,
  createRootRouteWithContext,
  redirect,
  useRouter,
  CatchBoundary,
  type NavigateOptions,
  type ToOptions,
} from "@tanstack/react-router";
import { LoadingScreen } from "@/components/layout/LoadingScreen";
import { ErrorPage } from "@/components/layout/ErrorPage";
import { ConfirmDialog } from "@/components/generic/ConfirmDialog";
import { FontSizeSync } from "@/components/layout/FontSizeSync";
import { RouterProvider } from "react-aria-components";
import { ZeroInit } from "@/components/zero/ZeroInit";

declare module "react-aria-components" {
  interface RouterConfig {
    href: ToOptions["to"];
    routerOptions: Omit<NavigateOptions, keyof ToOptions>;
  }
}

export const Route = createRootRouteWithContext<RouterContext>()({
  ssr: false,
  pendingComponent: LoadingScreen,
  beforeLoad: async ({ context: { queryClient }, location }) => {
    try {
      const result = await loadSession(queryClient);

      // Don't redirect if we're on landing pages or auth pages
      if (
        location.pathname.startsWith("/_landing") ||
        location.pathname === "/auth" ||
        location.pathname.startsWith("/integrations")
      ) {
        return result;
      }

      // If authenticated and trying to access unauthed routes, redirect to workspace
      if (result.auth && location.pathname.startsWith("/_unauthed")) {
        const activeOrgId = localStorage.getItem("lydie:active-organization");
        if (activeOrgId) {
          throw redirect({
            to: "/w/$organizationId",
            params: { organizationId: activeOrgId },
          });
        }
      }

      return result;
    } catch (error) {
      // If session loading fails, allow access to unauthed routes
      if (
        error instanceof Error &&
        error.message === "Failed to load session"
      ) {
        return { auth: null };
      }
      throw error;
    }
  },
  component: () => {
    const router = useRouter();
    const auth = Route.useRouteContext();
    return (
      <RouterProvider
        navigate={(to, options) => router.navigate({ to, ...options })}
      >
        <ZeroInit session={auth.auth?.session}>
          <Outlet />
        </ZeroInit>
        <FontSizeSync />
        <ConfirmDialog />
      </RouterProvider>
    );
  },
});
