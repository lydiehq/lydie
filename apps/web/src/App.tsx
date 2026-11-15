import { getInjectedPlatform } from "@lydie/platform";
import { lazy, Suspense, useEffect } from "react";

import { AppLockGate } from "./AppLock.tsx";
import { removeBootShell } from "./boot-shell.ts";
import { LydieWeb } from "./LydieWeb.tsx";

// The playground (design system and editor check) stays available in development only.
const Playground = import.meta.env.DEV ? lazy(() => import("./playground/Playground.tsx")) : null;
// Pages outside the app: an invitation link, a public page and the OAuth consent of the hosted MCP
// server (no workspace is opened for them).
const InvitePage = lazy(() => import("./InvitePage.tsx").then((m) => ({ default: m.InvitePage })));
const PublicPage = lazy(() => import("./PublicPage.tsx").then((m) => ({ default: m.PublicPage })));
const OAuthConsentPage = lazy(() =>
  import("./OAuthConsentPage.tsx").then((m) => ({ default: m.OAuthConsentPage })),
);

function routeOf(pathname: string): "invite" | "share" | "consent" | null {
  const base = import.meta.env.BASE_URL ?? "/";
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : pathname.slice(1);
  if (/^invite\/?$/.test(rest)) return "invite";
  if (/^s\/[^/]+/.test(rest)) return "share";
  if (/^oauth\/consent\/?$/.test(rest)) return "consent";
  return null;
}

function isPlayground(): boolean {
  return window.location.pathname.replace(/\/$/, "").endsWith("/playground");
}

export function App() {
  const workspace = !(Playground && isPlayground()) && !routeOf(window.location.pathname);
  useEffect(() => {
    if (!workspace) removeBootShell();
  }, [workspace]);

  if (Playground && isPlayground()) {
    return (
      <Suspense>
        <Playground />
      </Suspense>
    );
  }
  const route = routeOf(window.location.pathname);
  if (route) {
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
