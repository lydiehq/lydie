// The web app's Content-Security-Policy, served by the dev and preview servers (vite.config.ts) and,
// with the same directives, by whatever hosts the build. It mirrors the desktop renderer's policy
// (apps/desktop/src/main/security.ts) except where the browser needs more: connect-src names the
// hosted core's origins instead of any https/wss, and frame-ancestors lets the marketing site frame
// the app.
export type CspOptions = {
  // Origins the page talks to besides its own: the hosted API and its sync (https and wss) and
  // collab (wss) services. Downloads and attachments are links on the API.
  connect: readonly string[];
  // Who may frame the app.
  frameAncestors: readonly string[];
  // Vite's dev server: React Refresh's inline preamble and the HMR websocket.
  dev?: boolean;
};

export function contentSecurityPolicy(options: CspOptions): string {
  const script = ["'self'", "'wasm-unsafe-eval'", ...(options.dev ? ["'unsafe-inline'"] : [])];
  const connect = ["'self'", ...options.connect, ...(options.dev ? ["ws:"] : [])];
  return [
    "default-src 'self'",
    // 'wasm-unsafe-eval' is for SQLite's WASM build.
    `script-src ${script.join(" ")}`,
    // ProseMirror and react-aria set inline style attributes.
    "style-src 'self' 'unsafe-inline'",
    // Images in documents may point anywhere on the web.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' blob: https:",
    `connect-src ${unique(connect).join(" ")}`,
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${options.frameAncestors.length ? options.frameAncestors.join(" ") : "'none'"}`,
  ].join("; ");
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
