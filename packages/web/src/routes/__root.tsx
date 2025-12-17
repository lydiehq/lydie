import type { RouterContext } from "@/main";
import { loadSession } from "@/lib/auth/session";
import {
  Outlet,
  createRootRouteWithContext,
  redirect,
  useRouter,
  type NavigateOptions,
  type ToOptions,
} from "@tanstack/react-router";
import { LoadingScreen } from "@/components/layout/LoadingScreen";
import { ErrorPage } from "@/components/layout/ErrorPage";
import { ConfirmDialog } from "@/components/generic/ConfirmDialog";
import { FontSizeSync } from "@/components/layout/FontSizeSync";
import { RouterProvider } from "react-aria-components";

declare module "react-aria-components" {
  interface RouterConfig {
    href: ToOptions["to"];
    routerOptions: Omit<NavigateOptions, keyof ToOptions>;
  }
}

export const Route = createRootRouteWithContext<RouterContext>()({
  ssr: false,
  pendingComponent: LoadingScreen,
  errorComponent: ({ error, reset }) => (
    <ErrorPage error={error} reset={reset} />
  ),
  beforeLoad: async ({ context: { queryClient } }) => {
    try {
      const result = await loadSession(queryClient);
      return result;
    } catch (error) {
      throw new Error("Failed to load session");
    }
  },
  component: () => {
    const router = useRouter();
    return (
      <RouterProvider
        navigate={(to, options) => router.navigate({ to, ...options })}
      >
        <FontSizeSync />
        <ConfirmDialog />
        <Outlet />
      </RouterProvider>
    );
  },
});
