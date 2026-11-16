import { getInjectedPlatform } from "@lydie/platform";
import { lazy, Suspense, useEffect } from "react";

import { AppLockGate } from "./AppLock.tsx";
import { removeBootShell } from "./boot-shell.ts";
import { LydieWeb } from "./LydieWeb.tsx";
import { routeOf } from "./routes.ts";

const Playground = import.meta.env.DEV ? lazy(() => import("./playground/Playground.tsx")) : null;
// Pages outside the app: an invitation link, a public page and the OAuth consent of the hosted MCP
// server (no workspace is opened for them).
const InvitePage = lazy(() => import("./InvitePage.tsx").then((m) => ({ default: m.InvitePage })));
const PublicPage = lazy(() => import("./PublicPage.tsx").then((m) => ({ default: m.PublicPage })));
const OAuthConsentPage = lazy(() =>
  import("./OAuthConsentPage.tsx").then((m) => ({ default: m.OAuthConsentPage })),
);

export function App() {
  const route = routeOf(window.location.pathname);
  useEffect(() => {
    if (route !== "workspace") removeBootShell();
  }, [route]);

  if (route === "playground" && Playground) {
    return (
      <Suspense>
        <Playground />
      </Suspense>
    );
  }
  if (route !== "workspace") {
    return (
      <Suspense>
        {route === "invite" ? (
          <InvitePage />
        ) : route === "consent" ? (
          <OAuthConsentPage />
        ) : (
          <PublicPage />
        )}
      </Suspense>
    );
  }
  // The desktop app's lock (LYD-383) covers the workspace before it shows anything.
  const lock = getInjectedPlatform()?.appLock ?? null;
  return lock ? (
    <AppLockGate lock={lock}>
      <LydieWeb />
    </AppLockGate>
  ) : (
    <LydieWeb />
  );
}
