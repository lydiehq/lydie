import { app, session, shell } from "electron";
import type { DownloadItem } from "electron";

import { checkExternalUrl } from "./ipc-validation.ts";
import type { OriginPolicy } from "./ipc-validation.ts";

// Production policy for the bundled renderer. connect-src allows https/wss for the hosted core;
// narrow it to the configured origins once those exist. 'wasm-unsafe-eval' is for SQLite/WASM.
export const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  // ProseMirror and react-aria set inline style attributes.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

// Vite's dev server needs inline scripts (React Refresh preamble) and its HMR websocket.
export const DEVELOPMENT_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' ws: http://localhost:* https: wss:",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

// Only clipboard writes from our own pages; everything else (camera, mic, geolocation,
// notifications, MIDI, HID, …) is denied until a feature needs it.
const ALLOWED_PERMISSIONS = new Set(["clipboard-sanitized-write"]);

export function openExternalSafely(url: string) {
  try {
    void shell.openExternal(checkExternalUrl(url).toString());
  } catch {
    // Not http(s)/mailto: drop it.
  }
}

export function hardenSessions(
  policy: OriginPolicy,
  devOrigins: readonly string[],
  // Whether a download is one the main process started for a window (main/downloads.ts).
  claimDownload: (item: DownloadItem, contentsId: number | null) => boolean,
) {
  const ses = session.defaultSession;

  ses.setPermissionRequestHandler((_contents, permission, callback, details) => {
    callback(ALLOWED_PERMISSIONS.has(permission) && policy.isTrustedUrl(details.requestingUrl));
  });
  ses.setPermissionCheckHandler((_contents, permission, requestingOrigin) => {
    return ALLOWED_PERMISSIONS.has(permission) && policy.isTrustedUrl(requestingOrigin);
  });
  ses.setDevicePermissionHandler(() => false);
  // Pages cannot download anything; only the main process's own `downloads:save` goes through.
  ses.on("will-download", (event, item, contents) => {
    if (!claimDownload(item, contents?.id ?? null)) event.preventDefault();
  });

  // The production protocol handler sets its own CSP; the dev servers get the relaxed one here.
  if (devOrigins.length) {
    ses.webRequest.onHeadersReceived((details, callback) => {
      const headers = details.responseHeaders ?? {};
      if (
        details.resourceType === "mainFrame" &&
        devOrigins.some((origin) => details.url.startsWith(origin))
      ) {
        headers["Content-Security-Policy"] = [DEVELOPMENT_CSP];
      }
      callback({ responseHeaders: headers });
    });
  }

  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-attach-webview", (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      openExternalSafely(url);
      return { action: "deny" };
    });
    const guard = (event: { preventDefault(): void }, url: string) => {
      if (policy.isTrustedUrl(url)) return;
      event.preventDefault();
      openExternalSafely(url);
    };
    contents.on("will-navigate", guard);
    contents.on("will-redirect", guard);
    contents.on("will-frame-navigate", (event) => {
      if (!event.isMainFrame && !policy.isTrustedUrl(event.url)) event.preventDefault();
    });
  });
}
