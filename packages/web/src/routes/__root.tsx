import type { RouterContext } from "@/main";
import { loadSession } from "@/lib/auth/session";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  type NavigateOptions,
  type ToOptions,
} from "@tanstack/react-router";
import { LoadingScreen } from "@/components/layout/LoadingScreen";
import { ConfirmDialog } from "@/components/generic/ConfirmDialog";
import { FontSizeSync } from "@/components/layout/FontSizeSync";
import { RouterProvider } from "react-aria-components";
import { ErrorPage } from "@/components/layout/ErrorPage";
import { ZeroProvider } from "@rocicorp/zero/react";
import { getZeroInstance } from "@/lib/zero/instance";

declare module "react-aria-components" {
  interface RouterConfig {
    href: ToOptions["to"];
    routerOptions: Omit<NavigateOptions, keyof ToOptions>;
  }
}
export const Route = createRootRouteWithContext<RouterContext>()({
  ssr: false,
  head: () => {
    const zeroCacheURL = import.meta.env.VITE_ZERO_URL;
    return {
      links: zeroCacheURL
        ? [
            {
              rel: "preconnect",
              href: zeroCacheURL,
            },
          ]
        : [],
    };
  },
  pendingComponent: LoadingScreen,
  errorComponent: ErrorPage,
  beforeLoad: async ({ context: { queryClient } }) => {
    const { auth, organizations } = await loadSession(queryClient);
    const zeroInstance = getZeroInstance(auth);

    return { auth, organizations, zero: zeroInstance };
  },
  component: () => {
    const router = useRouter();
    const { zero } = Route.useRouteContext();
    return (
      <RouterProvider
        navigate={(to, options) => router.navigate({ to, ...options })}
      >
        <ZeroProvider zero={zero}>
          <FontSizeSync />
          <ConfirmDialog />
          <Outlet />
        </ZeroProvider>
      </RouterProvider>
    );
  },
});
