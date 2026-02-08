import type { Zero } from "@rocicorp/zero";

import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import {
  QueryClient,
  type Query,
  type QueryClient as QueryClientType,
} from "@tanstack/react-query";
import {
  persistQueryClientRestore,
  persistQueryClientSubscribe,
} from "@tanstack/react-query-persist-client";
import {
  CatchBoundary,
  type NavigateOptions,
  RouterProvider,
  type ToOptions,
  createRouter as createTanStackRouter,
} from "@tanstack/react-router";

import "./styles/tailwind.css";
import { routerWithQueryClient } from "@tanstack/react-router-with-query";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";

import type { authClient } from "./utils/auth.ts";

import { ErrorPage } from "./components/layout/ErrorPage.tsx";
import { initPostHog } from "./lib/posthog.ts";
import reportWebVitals from "./reportWebVitals.ts";
import { routeTree } from "./routeTree.gen";

export interface RouterContext {
  queryClient: QueryClientType;
  zero: Zero;
  auth: Awaited<ReturnType<typeof authClient.getSession>>["data"];
}

// Minimal session data type for caching (non-sensitive)
type MinimalUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
};

type MinimalOrganization = {
  id: string;
  name: string;
  slug: string;
};

type MinimalSessionData = {
  user: MinimalUser;
  session?: {
    organizations?: MinimalOrganization[];
    activeOrganizationSlug?: string;
  };
};

// Sanitize session data to only include non-sensitive fields
function sanitizeSessionData(data: unknown): MinimalSessionData | undefined {
  if (!data || typeof data !== "object") return undefined;

  const sessionData = data as Record<string, unknown>;

  // Extract only minimal user fields
  const user = sessionData.user as Record<string, unknown> | undefined;
  if (!user || typeof user !== "object" || !user.id) {
    return undefined;
  }

  const minimalUser: MinimalUser = {
    id: String(user.id),
    name: user.name ? String(user.name) : null,
    email: String(user.email || ""),
    image: user.image ? String(user.image) : null,
  };

  // Extract only minimal organization fields
  const session = sessionData.session as Record<string, unknown> | undefined;
  const organizations =
    (session?.organizations as Array<Record<string, unknown>> | undefined) ?? [];
  const minimalOrgs: MinimalOrganization[] = organizations.map((org) => ({
    id: String(org.id),
    name: String(org.name || ""),
    slug: String(org.slug || ""),
  }));

  return {
    user: minimalUser,
    session: {
      organizations: minimalOrgs,
      activeOrganizationSlug: session?.activeOrganizationSlug
        ? String(session.activeOrganizationSlug)
        : undefined,
    },
  };
}

// Create persister for localStorage with sanitized data
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: "lydie:query:cache:session",
  serialize: (data) => {
    // Sanitize the data before storing
    const sanitized = sanitizeSessionData(data);
    return JSON.stringify(sanitized);
  },
  deserialize: (data) => {
    try {
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  },
});

function createRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 1000 * 60 * 60 * 24, // 24 hours
      },
    },
  });

  // Restore persisted data immediately (blocking render until restored)
  // This loads the cached session from localStorage before the app renders
  persistQueryClientRestore({
    queryClient,
    persister,
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
  });

  // Subscribe to persist changes - only persist the session query
  persistQueryClientSubscribe({
    queryClient,
    persister,
    dehydrateOptions: {
      shouldDehydrateQuery: (query: Query) => {
        // Only persist the session query
        return query.queryKey[0] === "auth" && query.queryKey[1] === "getSession";
      },
    },
  });

  return routerWithQueryClient(
    createTanStackRouter({
      routeTree,
      context: {
        queryClient,
        zero: undefined as unknown as Zero,
        auth: undefined as unknown as ReturnType<typeof authClient.getSession>,
      } satisfies RouterContext,
      defaultPreload: "viewport",
      // https://github.com/rocicorp/ztunes/blob/main/app/router.tsx
      defaultPreloadStaleTime: 0,
      defaultPreloadGcTime: 0,
      scrollRestoration: true,
      defaultStructuralSharing: true,
    }),
    queryClient,
  );
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}

declare module "react-aria-components" {
  interface RouterConfig {
    href: ToOptions;
    routerOptions: Omit<NavigateOptions, keyof ToOptions>;
  }
}

initPostHog();

const rootElement = document.getElementById("app");
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <CatchBoundary errorComponent={ErrorPage} getResetKey={() => "error"}>
        <RouterProvider router={createRouter()} />
      </CatchBoundary>
    </StrictMode>,
  );
}

reportWebVitals();
