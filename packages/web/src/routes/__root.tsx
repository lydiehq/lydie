import type { RouterContext } from "@/main"
import { loadSession } from "@/lib/auth/session"
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  type NavigateOptions,
  type ToOptions,
  HeadContent,
  redirect,
} from "@tanstack/react-router"
import { LoadingScreen } from "@/components/layout/LoadingScreen"
import { ConfirmDialog } from "@/components/generic/ConfirmDialog"
import { FontSizeSync } from "@/components/layout/FontSizeSync"
import { RouterProvider } from "react-aria-components"
import { ErrorPage } from "@/components/layout/ErrorPage"
import { ZeroProvider } from "@rocicorp/zero/react"
import { getZeroInstance } from "@/lib/zero/instance"
import { PostHogProvider } from "@/context/posthog.context"
import { usePageViewTracking } from "@/hooks/use-posthog-tracking"
import { identifyUser } from "@/lib/posthog"
import { useEffect } from "react"

declare module "react-aria-components" {
  interface RouterConfig {
    href: ToOptions["to"]
    routerOptions: Omit<NavigateOptions, keyof ToOptions>
  }
}
export const Route = createRootRouteWithContext<RouterContext>()({
  ssr: false,
  head: () => {
    const zeroCacheURL = import.meta.env.VITE_ZERO_URL
    const siteURL = typeof window !== "undefined" ? window.location.origin : ""
    return {
      meta: [
        { title: "Lydie" },
        {
          name: "description",
          content: "A minimal, powerful writing environment supercharged with AI.",
        },
        { property: "og:type", content: "website" },
        { property: "og:title", content: "Lydie" },
        {
          property: "og:description",
          content: "A minimal, powerful writing environment supercharged with AI.",
        },
        {
          property: "og:image",
          content: siteURL ? `${siteURL}/og-image.png` : "/og-image.png",
        },
        { property: "twitter:card", content: "summary_large_image" },
        { property: "twitter:title", content: "Lydie" },
        {
          property: "twitter:description",
          content: "A minimal, powerful writing environment supercharged with AI.",
        },
        {
          property: "twitter:image",
          content: siteURL ? `${siteURL}/og-image.png` : "/og-image.png",
        },
      ],
      links: zeroCacheURL
        ? [
            {
              rel: "preconnect",
              href: zeroCacheURL,
            },
          ]
        : [],
    }
  },
  pendingComponent: LoadingScreen,
  errorComponent: ErrorPage,
  beforeLoad: async ({ context: { queryClient } }) => {
    const { auth, organizations } = await loadSession(queryClient)
    const zeroInstance = getZeroInstance(auth)

    // Redirect to onboarding if user has no organizations
    if (
      auth?.user &&
      organizations.length === 0 &&
      !location.pathname.startsWith("/onboarding") &&
      !location.pathname.startsWith("/invitations")
    ) {
      throw redirect({
        to: "/onboarding",
      })
    }

    return { auth, organizations, zero: zeroInstance }
  },
  component: () => {
    const router = useRouter()
    const { zero } = Route.useRouteContext()
    return (
      <>
        <HeadContent />
        <PostHogProvider>
          <RouterProvider navigate={(to, options) => router.navigate({ to, ...options })}>
            <ZeroProvider zero={zero}>
              <PostHogUserIdentifier />
              <FontSizeSync />
              <ConfirmDialog />
              <Outlet />
            </ZeroProvider>
          </RouterProvider>
        </PostHogProvider>
      </>
    )
  },
})

// Component to identify users and track page views
function PostHogUserIdentifier() {
  const { auth, organizations } = Route.useRouteContext()

  // Track page views automatically
  usePageViewTracking()

  // Identify user when authenticated and track login/signup
  useEffect(() => {
    if (auth?.user) {
      const isNewUser = organizations.length === 0

      identifyUser(auth.user.id, {
        email: auth.user.email,
        hasOrganizations: organizations.length > 0,
        organizationCount: organizations.length,
      })

      // Track signup or login based on whether user has organizations
      // This runs once when user first authenticates
      if (isNewUser) {
        // Will be followed by organization_created in onboarding
      } else {
        // User has organizations, this is a login
      }
    }
  }, [auth?.user, organizations])

  return null
}
