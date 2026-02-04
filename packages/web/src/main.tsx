import type { Zero } from "@rocicorp/zero";

import { QueryClient, type QueryClient as QueryClientType } from "@tanstack/react-query";
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

function createRouter() {
  const queryClient = new QueryClient();
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
