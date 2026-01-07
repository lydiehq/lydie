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
import { mutators } from "@lydie/zero/mutators";
import { schema } from "@lydie/zero/schema";
import { Zero } from "@rocicorp/zero";
import { ZeroProvider } from "@rocicorp/zero/react";

declare module "react-aria-components" {
  interface RouterConfig {
    href: ToOptions["to"];
    routerOptions: Omit<NavigateOptions, keyof ToOptions>;
  }
}

let _zeroInstance: Zero | undefined;

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
    try {
      const { auth, organizations } = await loadSession(queryClient);
      const zeroInstance = _zeroInstance
        ? _zeroInstance
        : new Zero({
            userID: auth.session.userId,
            schema,
            cacheURL: import.meta.env.VITE_ZERO_URL,
            mutators,
            context: auth.session,
          });

      return { auth, organizations, zero: zeroInstance };
    } catch (error) {
      throw new Error("Failed to load session");
    }
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
