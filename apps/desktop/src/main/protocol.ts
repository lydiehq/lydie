// Serves the built renderer from disk over lydie-app:// instead of file://, so pages get a real
// origin, a CSP header and no access to the rest of the filesystem.
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import { protocol } from "electron";

import { APP_SCHEME } from "../shared/bootstrap.ts";
import { resolveAsset } from "./asset-path.ts";
import { PRODUCTION_CSP } from "./security.ts";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

// Must run before the app is ready.
export function registerAppScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        codeCache: true,
      },
    },
  ]);
}

export function handleAppScheme(roots: Record<string, string>) {
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    const root = roots[url.host];
    if (!root) return new Response("Not found", { status: 404 });
    const file = await resolveAsset(root, url.pathname);
    if (!file) return new Response("Not found", { status: 404 });
    // Read directly rather than net.fetch(file://): the grantFileProtocolExtraPrivileges fuse is
    // off, and nothing here needs streaming or range requests.
    const body = await readFile(file);
    const headers = new Headers({
      "Content-Type": MIME_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    if (file.endsWith(".html")) {
      headers.set("Content-Security-Policy", PRODUCTION_CSP);
      headers.set("Cache-Control", "no-cache");
    }
    return new Response(body, { status: 200, headers });
  });
}
