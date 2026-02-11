import { ZeroProvider } from "@rocicorp/zero/react";
import { useQuery } from "@tanstack/react-query";
import {
  HeadContent,
  type NavigateOptions,
  Outlet,
  type ToOptions,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { RouterProvider } from "react-aria-components";

import type { RouterContext } from "@/main";

import { editorFontSizeAtom } from "@/atoms/workspace-settings";
import { ConfirmDialog } from "@/components/generic/ConfirmDialog";
import { ErrorPage } from "@/components/layout/ErrorPage";
import { LoadingScreen } from "@/components/layout/LoadingScreen";
import { getSessionQuery, type ExtendedSessionData } from "@/lib/auth/session";
import { identifyUser } from "@/lib/posthog";
import { getZeroInstance } from "@/lib/zero/instance";
import { getFontSizePixels } from "@/stores/font-size";

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
  beforeLoad: async ({ context: { queryClient } }) => {
    // Check if we have cached session data (persister restores before render)
    const cachedData = queryClient.getQueryData<ExtendedSessionData>(
      getSessionQuery().queryKey,
    );

    // If we have cached session with a user, use it immediately for fast load
    // but trigger background refetch to validate (staleTime: 0 ensures this)
    if (cachedData?.user) {
      void queryClient.fetchQuery(getSessionQuery());

      return {
        zero: getZeroInstance(cachedData),
        auth: cachedData,
      };
    }

    // No cached session - fetch fresh data (handles post-OAuth or not logged in)
    const sessionData = (await queryClient.fetchQuery(getSessionQuery())) as
      | ExtendedSessionData
      | undefined;

    return {
      zero: getZeroInstance(sessionData),
      auth: sessionData,
    };
  },
  component: () => {
    const router = useRouter();
    const { zero: zeroInstance } = Route.useRouteContext();
    const fontSizeOption = useAtomValue(editorFontSizeAtom);
    const [isRedirecting, setIsRedirecting] = useState(false);

    // Load session - uses cached data immediately, then refetches with staleTime: 0
    const { data: sessionData, isLoading } = useQuery(getSessionQuery()) as {
      data: ExtendedSessionData | undefined;
      isLoading: boolean;
    };

    // Handle organization redirect logic - only after we have confirmed fresh data
    // Only redirect if user is logged in but has no organizations
    useEffect(() => {
      // Only process after initial load completes
      if (!isLoading && sessionData?.user) {
        const organizations = sessionData.session?.organizations || [];
        const pathname = window.location.pathname;

        // Only redirect to /new if user has no orgs and isn't already on special pages
        if (
          organizations.length === 0 &&
          !pathname.startsWith("/new") &&
          !pathname.startsWith("/invitations") &&
          !pathname.startsWith("/auth")
        ) {
          setIsRedirecting(true);
          void router.navigate({ to: "/new" });
        }
      }
    }, [isLoading, sessionData, router]);

    // Apply font size
    useEffect(() => {
      if (fontSizeOption === "default") {
        document.documentElement.style.removeProperty("font-size");
      } else {
        document.documentElement.style.fontSize = `${getFontSizePixels(fontSizeOption)}px`;
      }
    }, [fontSizeOption]);

    // Identify user for analytics
    useEffect(() => {
      if (sessionData?.user?.id) {
        identifyUser(sessionData.user.id, {
          email: sessionData.user.email,
          name: sessionData.user.name,
        });
      }
    }, [sessionData?.user?.id, sessionData?.user?.email, sessionData?.user?.name]);

    // Show loading screen only during initial load
    if (isLoading || isRedirecting) {
      return <LoadingScreen />;
    }

    return (
      <>
        <HeadContent />
        <RouterProvider navigate={(to, options) => router.navigate({ to, ...options })}>
          <ZeroProvider zero={zeroInstance}>
            <ConfirmDialog />
            <Outlet />
          </ZeroProvider>
        </RouterProvider>
      </>
    );
  },
});
