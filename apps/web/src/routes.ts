// Which page a URL is: a page outside the app (no workspace is opened for it), the playground, or
// the workspace. Read by the entry before the app's code loads.
export type Route = "invite" | "share" | "consent" | "playground" | "workspace";

export function routeOf(pathname: string): Route {
  // The playground (design system and editor check) stays available in development only.
  if (import.meta.env.DEV && pathname.replace(/\/$/, "").endsWith("/playground")) {
    return "playground";
  }
  const base = import.meta.env.BASE_URL ?? "/";
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : pathname.slice(1);
  if (/^invite\/?$/.test(rest)) return "invite";
  if (/^s\/[^/]+/.test(rest)) return "share";
  if (/^oauth\/consent\/?$/.test(rest)) return "consent";
  return "workspace";
}

// Whether a URL names a hosted workspace (`w/<slug or id>/…`), the part of `linkedScope`
// (scope.ts) this needs: true or false below the app's base, null at the base itself (the
// preference decides) or outside it. Not `linkedScope` itself: it would bring the contract's
// schemas into the entry (scope.test.ts checks the two agree).
export function urlNamesHosted(base: string, pathname: string): boolean | null {
  if (pathname === base.slice(0, -1)) return null;
  if (!pathname.startsWith(base)) return null;
  const below = pathname.slice(base.length);
  if (below === "" || below === "index.html") return null;
  return /^w\/[^/]+/.test(below);
}
