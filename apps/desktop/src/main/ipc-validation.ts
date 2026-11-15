// The Electron-free half of IPC handling, unit-tested on its own.
import { PlatformError } from "@lydie/platform";
import type { z } from "zod";

import { invokeContract } from "../shared/ipc-contract.ts";
import type { InvokeChannel } from "../shared/ipc-contract.ts";

export type ParsedInput<C extends InvokeChannel> = z.output<(typeof invokeContract)[C]["input"]>;

export function parseInput<C extends InvokeChannel>(channel: C, raw: unknown): ParsedInput<C> {
  const schema = invokeContract[channel]?.input;
  if (!schema) throw new PlatformError("invalid-argument", `Unknown channel: ${String(channel)}`);
  const result = schema.safeParse(raw ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? issue.path.join(".") : "input";
    throw new PlatformError(
      "invalid-argument",
      `${channel}: ${where}: ${issue?.message ?? "invalid"}`,
    );
  }
  return result.data as ParsedInput<C>;
}

// Origins whose pages may call into the main process. In production these are the app scheme's
// hosts; in development also the Vite dev servers.
export function createOriginPolicy(origins: readonly string[]) {
  // Compared as "protocol//host[:port]": URL#origin is "null" for custom schemes such as ours.
  const key = (url: URL) => (url.host ? `${url.protocol}//${url.host}` : null);
  const allowed = new Set(origins.map((origin) => key(new URL(origin))));
  allowed.delete(null);
  return {
    isTrustedUrl(url: string | undefined | null): boolean {
      if (!url || !URL.canParse(url)) return false;
      return allowed.has(key(new URL(url)));
    },
  };
}

export type OriginPolicy = ReturnType<typeof createOriginPolicy>;

export type SenderInfo = {
  // The frame that sent the message; null once it navigated away or was destroyed.
  frameUrl: string | null;
  isMainFrame: boolean;
  // Whether the sending WebContents belongs to a window this app created.
  knownWindow: boolean;
};

// IPC is accepted only from the top frame of one of our windows showing one of our pages. Iframes
// (e.g. embedded previews) and pages navigated elsewhere get nothing.
export function checkSender(sender: SenderInfo, policy: OriginPolicy): void {
  if (!sender.knownWindow) throw new PlatformError("permission-denied", "Unknown window");
  if (!sender.isMainFrame) throw new PlatformError("permission-denied", "IPC from a subframe");
  if (!policy.isTrustedUrl(sender.frameUrl)) {
    throw new PlatformError("permission-denied", `IPC from an untrusted page: ${sender.frameUrl}`);
  }
}

// What `downloads:save` may fetch: the hosted API's signed export link and a backup's content,
// nothing else (any other URL would make the main process a download-anything tool for the page).
const DOWNLOAD_PATHS = [
  /^\/v1\/workspaces\/[\w-]{1,64}\/export\.zip$/,
  /^\/v1\/backups\/[\w-]{1,64}\/content$/,
];

export function checkDownloadUrl(url: string, apiUrl: string): URL {
  if (!URL.canParse(url)) throw new PlatformError("invalid-argument", "Not a URL");
  const parsed = new URL(url);
  if (
    parsed.origin !== new URL(apiUrl).origin ||
    parsed.username ||
    parsed.password ||
    !DOWNLOAD_PATHS.some((path) => path.test(parsed.pathname))
  ) {
    throw new PlatformError(
      "permission-denied",
      "Only Lydie exports and backups can be downloaded",
    );
  }
  return parsed;
}

const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export function checkExternalUrl(url: string): URL {
  if (!URL.canParse(url)) throw new PlatformError("invalid-argument", "Not a URL");
  const parsed = new URL(url);
  if (!EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
    throw new PlatformError("invalid-argument", `Refusing to open ${parsed.protocol} URLs`);
  }
  return parsed;
}
