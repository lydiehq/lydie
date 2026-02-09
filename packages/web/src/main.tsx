import type { Zero } from "@rocicorp/zero";
import type { PersistedClient } from "@tanstack/react-query-persist-client";

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

// Sanitize session data by removing sensitive fields (tokens, etc.)
function sanitizeSessionData(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeSessionData(item));
  }

  const record = data as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    // Skip sensitive fields
    if (key === "token" || key === "accessToken" || key === "refreshToken") {
      continue;
    }

    // Recursively sanitize nested objects
    if (value && typeof value === "object") {
      sanitized[key] = sanitizeSessionData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// Sanitize dehydrated cache state to remove tokens
function sanitizeDehydratedState(state: unknown): unknown {
  if (!state || typeof state !== "object") return state;

  const dehydratedState = state as {
    queries?: Array<{
      queryKey: unknown[];
      state: { data: unknown };
    }>;
  };

  if (!dehydratedState.queries || !Array.isArray(dehydratedState.queries)) {
    return state;
  }

  return {
    ...dehydratedState,
    queries: dehydratedState.queries.map((query) => ({
      ...query,
      state: {
        ...query.state,
        data: sanitizeSessionData(query.state.data),
      },
    })),
  };
}

// Create persister for localStorage with sanitization
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: "lydie:query:cache:session",
  serialize: (data) => {
    // Sanitize to remove tokens before storing
    const sanitized = sanitizeDehydratedState(data);
    return JSON.stringify(sanitized);
  },
  deserialize: (data) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return JSON.parse(data) as PersistedClient;
    } catch {
      // Return empty client on parse error
      return { buster: Date.now().toString() } as PersistedClient;
    }
  },
});

async function createRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 1000 * 60 * 60 * 24, // 24 hours
      },
    },
  });

  // Restore persisted data immediately (blocking render until restored)
  // This loads the cached session from localStorage before the app renders
  await persistQueryClientRestore({
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

  // Create router asynchronously to ensure cache is restored before rendering
  void createRouter().then((router) => {
    root.render(
      <StrictMode>
        <CatchBoundary errorComponent={ErrorPage} getResetKey={() => "error"}>
          <RouterProvider router={router} />
        </CatchBoundary>
      </StrictMode>,
    );
  });
}

reportWebVitals();
