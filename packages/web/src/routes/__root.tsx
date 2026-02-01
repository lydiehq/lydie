import {
  HeadContent,
  type NavigateOptions,
  Outlet,
  type ToOptions,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router";
import { authClient } from "@/utils/auth";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { RouterProvider } from "react-aria-components";

import type { RouterContext } from "@/main";

import { ConfirmDialog } from "@/components/generic/ConfirmDialog";
import { ErrorPage } from "@/components/layout/ErrorPage";
import { LoadingScreen } from "@/components/layout/LoadingScreen";
import { AuthProvider } from "@/lib/auth/provider";
import { useAuth } from "@/lib/auth/store";
import { getFontSizePixels, rootFontSizeAtom } from "@/stores/font-size";

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
    const siteURL = typeof window !== "undefined" ? window.location.origin : "";
    return {
      meta: [
        { title: "Lydie" },
        {
          name: "description",
          content:
            "Lydie is a modern writing workspace for structured documents, notes, and knowledge.",
        },
        { name: "robots", content: "noindex, nofollow" },
        { property: "og:type", content: "website" },
        { property: "og:title", content: "Lydie" },
        {
          property: "og:description",
          content:
            "Lydie is a modern writing workspace for structured documents, notes, and knowledge.",
        },
        {
          property: "og:image",
          content: siteURL ? `${siteURL}/og-image.png` : "/og-image.png",
        },
        { property: "twitter:card", content: "summary_large_image" },
        { property: "twitter:title", content: "Lydie" },
        {
          property: "twitter:description",
          content:
            "Lydie is a modern writing workspace for structured documents, notes, and knowledge.",
        },
        {
          property: "twitter:image",
          content: siteURL ? `${siteURL}/og-image.png` : "/og-image.png",
        },
      ],
      links: [
        ...(zeroCacheURL
          ? [
              {
                rel: "preconnect",
                href: zeroCacheURL,
              },
            ]
          : []),
      ],
    };
  },
  pendingComponent: LoadingScreen,
  errorComponent: ErrorPage,
  // Load auth in beforeLoad so it's available in context for child routes
  beforeLoad: async ({ context: { queryClient } }) => {
    const session = await authClient.getSession();
    return { queryClient, session: session.data };
  },
  component: () => {
    const router = useRouter();
    const { queryClient } = Route.useRouteContext();
    const fontSizeOption = useAtomValue(rootFontSizeAtom);

    useEffect(() => {
      if (fontSizeOption === "default") {
        document.documentElement.style.removeProperty("font-size");
      } else {
        document.documentElement.style.fontSize = `${getFontSizePixels(fontSizeOption)}px`;
      }
    }, [fontSizeOption]);

    return (
      <>
        <HeadContent />
        <RouterProvider navigate={(to, options) => router.navigate({ to, ...options })}>
          <AuthProvider queryClient={queryClient} fallback={<LoadingScreen />}>
            <AuthSync />
            <ConfirmDialog />
            <Outlet />
          </AuthProvider>
        </RouterProvider>
      </>
    );
  },
});

/**
 * AuthSync - Handles post-auth redirects
 */
function AuthSync() {
  const router = useRouter();
  const { access } = useAuth();

  useEffect(() => {
    const syncAuth = async () => {
      const auth = await access();

      // Handle redirects for users without organizations
      if (
        auth?.user &&
        auth?.session?.organizations?.length === 0 &&
        !location.pathname.startsWith("/new") &&
        !location.pathname.startsWith("/invitations") &&
        !location.pathname.startsWith("/auth")
      ) {
        await router.navigate({ to: "/new" });
      }
    };

    syncAuth();
  }, [access, router]);

  return null;
}
