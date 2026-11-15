// Serves the settings/hosted e2e build (`.e2e/settings`, built with VITE_LYDIE_API_URL=/__core)
// on a free port, with the hosted API proxied under `/__core` so the page and the API share an
// origin (the API only allows its configured web origin for CORS). The proxy presents that origin.
import { existsSync } from "node:fs";
import { join } from "node:path";

export const SETTINGS_DIST = join(import.meta.dir, "..", ".e2e", "settings");
export const CORE_URL = process.env.LYDIE_CORE_URL ?? "http://localhost:4100";
// The origin the API trusts (its CORS_ORIGINS / WEB_URL default).
const TRUSTED_ORIGIN = process.env.LYDIE_WEB_ORIGIN ?? "http://localhost:3000";

export type SettingsServer = { url: string; stop(): void };

export async function startSettingsServer(): Promise<SettingsServer> {
  if (!existsSync(SETTINGS_DIST)) {
    throw new Error("Missing .e2e/settings: run `bun run test:e2e:settings` (it builds first)");
  }
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/__core/")) {
        const target = CORE_URL + url.pathname.slice("/__core".length) + url.search;
        const headers = new Headers(request.headers);
        headers.set("origin", TRUSTED_ORIGIN);
        headers.delete("host");
        headers.delete("referer");
        try {
          const response = await fetch(target, {
            method: request.method,
            headers,
            body:
              request.method === "GET" || request.method === "HEAD"
                ? null
                : await request.arrayBuffer(),
            redirect: "manual",
          });
          const out = new Headers(response.headers);
          out.delete("content-encoding");
          out.delete("content-length");
          return new Response(await response.arrayBuffer(), {
            status: response.status,
            headers: out,
          });
        } catch {
          return new Response("core unreachable", { status: 502 });
        }
      }
      const file = Bun.file(join(SETTINGS_DIST, url.pathname));
      if (url.pathname !== "/" && (await file.exists())) {
        return new Response(file, {
          headers: url.pathname.endsWith(".wasm") ? { "content-type": "application/wasm" } : {},
        });
      }
      // Single-page app: every other path is the app (deep links, /invite, /s/<token>).
      return new Response(Bun.file(join(SETTINGS_DIST, "index.html")), {
        headers: { "content-type": "text/html" },
      });
    },
  });
  return { url: `http://127.0.0.1:${server.port}/`, stop: () => void server.stop(true) };
}

// Whether the hosted stack (API, collab, PowerSync) answers.
export async function coreIsUp(): Promise<boolean> {
  try {
    const response = await fetch(`${CORE_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}
