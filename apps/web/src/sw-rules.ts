// The service worker's decisions (`sw.ts`), kept apart so they are unit-tested.

// What the build tells the worker (vite-startup.ts writes it into sw.js).
export type SwManifest = {
  // Changes with every build that changes anything precached.
  version: string;
  // The app's base path ("/" or "/app/").
  base: string;
  // Paths (below the origin) fetched when the worker installs: index.html, the scripts it loads
  // before any module, the startup chunks, the stylesheet, the font, the database worker and WASM.
  precache: string[];
  // A same-origin API's path prefix ("/__core/") when the build talks to one; its pages are never
  // the app's.
  apiPrefix: string | null;
};

export const CACHE_PREFIX = "lydie-";

export function cacheName(version: string): string {
  return `${CACHE_PREFIX}${version}`;
}

// The caches to delete once `current` is active. `names` is in creation order (CacheStorage keeps
// it). The previous version's cache stays: a page that started on it may still load its lazy
// chunks (offline too). Older ones go.
export function staleCaches(names: readonly string[], current: string): string[] {
  const ours = names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== current);
  return ours.slice(0, -1);
}

// Whether a navigation to `url` is one of the app's pages, answered with its index.html: below the
// base, not a file (a path whose last segment has an extension: sw.js, favicon.svg, a download)
// and not the API.
export function isAppPage(url: URL, manifest: Pick<SwManifest, "base" | "apiPrefix">): boolean {
  const { pathname } = url;
  if (pathname !== manifest.base.slice(0, -1) && !pathname.startsWith(manifest.base)) return false;
  if (manifest.apiPrefix && pathname.startsWith(manifest.apiPrefix)) return false;
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  return last === "index.html" || !last.includes(".");
}

// Whether a request is for one of the build's hashed files, which never change.
export function isAsset(url: URL, base: string): boolean {
  return url.pathname.startsWith(`${base}assets/`);
}
