import interWoff2 from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import { ZeroProvider } from "@rocicorp/zero/react";
import {
  HeadContent,
  type NavigateOptions,
  Outlet,
  type ToOptions,
  createRootRouteWithContext,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { RouterProvider } from "react-aria-components";

import type { RouterContext } from "@/main";

import { ConfirmDialog } from "@/components/generic/ConfirmDialog";
import { ErrorPage } from "@/components/layout/ErrorPage";
import { LoadingScreen } from "@/components/layout/LoadingScreen";
import { loadSession } from "@/lib/auth/session";
import { getZeroInstance } from "@/lib/zero/instance";
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
        {
          rel: "preload",
          as: "font",
          type: "font/woff2",
          href: interWoff2,
          crossOrigin: "anonymous",
        },
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
    const { auth, organizations } = await loadSession(queryClient);
    const zeroInstance = getZeroInstance(auth);

    if (
      auth?.user &&
      organizations.length === 0 &&
      !location.pathname.startsWith("/new") &&
      !location.pathname.startsWith("/invitations")
    ) {
      throw redirect({
        to: "/new",
      });
    }

    return { auth, organizations, zero: zeroInstance };
  },
  component: () => {
    const router = useRouter();
    const { zero } = Route.useRouteContext();
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
          <ZeroProvider zero={zero}>
            <ConfirmDialog />
            <Outlet />
          </ZeroProvider>
        </RouterProvider>
      </>
    );
  },
});
