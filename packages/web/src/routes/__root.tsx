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

import { editorFontSizeAtom } from "@/atoms/workspace-settings";
import { ConfirmDialog } from "@/components/generic/ConfirmDialog";
import { ErrorPage } from "@/components/layout/ErrorPage";
import { LoadingScreen } from "@/components/layout/LoadingScreen";
import {
  getSessionQuery,
  loadSession,
  revalidateSessionOnStartup,
  type ExtendedSessionData,
} from "@/lib/auth/session";
import { identifyUser } from "@/lib/posthog";
import { getZeroInstance } from "@/lib/zero/instance";
import type { RouterContext } from "@/main";
import { getFontSizePixels } from "@/atoms/font-size";

declare module "react-aria-components" {
  interface RouterConfig {
    href: ToOptions;
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
    const { auth, hadCachedSession } = await loadSession(queryClient);

    return {
      zero: getZeroInstance(auth),
      auth,
      hadCachedSession,
    };
  },
  component: () => {
    const router = useRouter();
    const { hadCachedSession, queryClient, zero: zeroInstance } = Route.useRouteContext();
    const fontSizeOption = useAtomValue(editorFontSizeAtom);
    const [isRedirecting, setIsRedirecting] = useState(false);

    const { data: sessionData, isLoading } = useQuery(getSessionQuery()) as {
      data: ExtendedSessionData | undefined;
      isLoading: boolean;
    };

    useEffect(() => {
      if (!hadCachedSession) {
        return;
      }

      void revalidateSessionOnStartup(queryClient);
    }, [hadCachedSession, queryClient]);

    useEffect(() => {
      if (!isLoading && sessionData?.user) {
        const organizations = sessionData.session?.organizations || [];
        const pathname = window.location.pathname;

        if (
          organizations.length === 0 &&
          !pathname.startsWith("/new") &&
          !pathname.startsWith("/invitations") &&
          !pathname.startsWith("/auth")
        ) {
          setIsRedirecting(true);
          void router.navigate({ href: "/new" });
        }
      }
    }, [isLoading, sessionData, router]);

    useEffect(() => {
      if (fontSizeOption === "default") {
        document.documentElement.style.removeProperty("font-size");
      } else {
        document.documentElement.style.fontSize = `${getFontSizePixels(fontSizeOption)}px`;
      }
    }, [fontSizeOption]);

    useEffect(() => {
      if (sessionData?.user?.id) {
        identifyUser(sessionData.user.id, {
          email: sessionData.user.email,
          name: sessionData.user.name,
        });
      }
    }, [sessionData?.user?.id, sessionData?.user?.email, sessionData?.user?.name]);

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
