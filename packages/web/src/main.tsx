import ReactDOM from "react-dom/client";
import {
  RouterProvider,
  createRouter as createTanStackRouter,
  type NavigateOptions,
  type ToOptions,
  CatchBoundary,
} from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import "./styles/tailwind.css";
import reportWebVitals from "./reportWebVitals.ts";
import { StrictMode } from "react";
import type { Zero } from "@rocicorp/zero";
import {
  QueryClient,
  type QueryClient as QueryClientType,
} from "@tanstack/react-query";
import type { authClient } from "./utils/auth.ts";
import { routerWithQueryClient } from "@tanstack/react-router-with-query";
import { ErrorPage } from "./components/layout/ErrorPage.tsx";

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
    queryClient
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

const rootElement = document.getElementById("app");
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <CatchBoundary errorComponent={ErrorPage} getResetKey={() => "error"}>
        <RouterProvider router={createRouter()} />
      </CatchBoundary>
    </StrictMode>
  );
}

reportWebVitals();
