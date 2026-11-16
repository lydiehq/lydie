// The web app's service worker, built into `sw.js` by vite-startup.ts (which writes the build's
// manifest in) and registered by sw-register.ts. It makes the app start from the device: the
// pages, the startup files and the database's worker and WASM come from a cache, so a reload does
// not wait for the network and this browser's notes open offline.
//
// Updates: every build has its own cache, filled when its worker installs. A page is always the
// index.html of the worker that serves it, with that build's files, so it never mixes an old page
// with files that are gone. A new worker takes over as soon as it has installed: the open page
// keeps running its build (its lazy chunks still come from the previous cache, kept until the
// next update, or from the network) and the next load is the new build.
//
// Only GETs to this origin: the app's pages, `assets/` and the files index.html loads. The API
// (another origin, or `apiPrefix`) and everything else go to the network untouched.
import { cacheName, isAppPage, isAsset, staleCaches } from "./sw-rules.ts";
import type { SwManifest } from "./sw-rules.ts";

declare const __LYDIE_SW_MANIFEST__: SwManifest;

type ExtendableEvent = Event & { waitUntil(promise: Promise<unknown>): void };
type FetchEvent = ExtendableEvent & {
  readonly request: Request;
  respondWith(response: Promise<Response>): void;
};
type Worker = {
  readonly location: Location;
  skipWaiting(): Promise<void>;
  addEventListener(type: "install" | "activate", listener: (event: ExtendableEvent) => void): void;
  addEventListener(type: "fetch", listener: (event: FetchEvent) => void): void;
};

const worker = self as unknown as Worker;
const manifest = __LYDIE_SW_MANIFEST__;
const current = cacheName(manifest.version);
const precached = new Set(manifest.precache);

// A response a navigation can be answered with (not one that followed a redirect).
async function settled(response: Response): Promise<Response> {
  if (!response.redirected) return response;
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

worker.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(current);
      await Promise.all(
        manifest.precache.map(async (path) => {
          // Hashed files never change; the rest must be this build's, not the HTTP cache's.
          const url = new URL(path, worker.location.origin);
          const response = await fetch(url, {
            cache: isAsset(url, manifest.base) ? "default" : "no-cache",
          });
          if (!response.ok) throw new Error(`${path}: ${response.status}`);
          await cache.put(path, await settled(response));
        }),
      );
      await worker.skipWaiting();
    })(),
  );
});

worker.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of staleCaches(await caches.keys(), current)) await caches.delete(name);
    })(),
  );
});

// The page: this build's index.html, whatever the path (the app routes in the page).
async function page(request: Request): Promise<Response> {
  const cached = await (await caches.open(current)).match(manifest.base);
  return cached ?? fetch(request);
}

// A file: from any build's cache (an open page of the previous build), else the network, keeping
// a hashed one for next time.
async function file(request: Request, url: URL): Promise<Response> {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && isAsset(url, manifest.base)) {
    const copy = response.clone();
    void caches.open(current).then((cache) => cache.put(request, copy));
  }
  return response;
}

worker.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== worker.location.origin) return;
  if (request.mode === "navigate") {
    if (isAppPage(url, manifest)) event.respondWith(page(request));
    return;
  }
  if (isAsset(url, manifest.base) || precached.has(url.pathname)) {
    event.respondWith(file(request, url));
  }
});
