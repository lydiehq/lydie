// Starting and stopping a vault's MCP server (the desktop app's toggle), the bearer token, and the
// stdio mode.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import type { McpControl, McpStatus, Vault } from "@lydie/bridge-fs";
import type { McpWorkspaceRef } from "@lydie/contract";
import type { Runtime } from "@lydie/runtime";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { startHttpMcp } from "./http.ts";
import type { HttpMcpServer } from "./http.ts";
import { createMcpServer } from "./server.ts";

// The token lives in the user's data directory, not in the vault: `.lydie/` is meant to be synced
// (iCloud, Dropbox, git) and a secret should not travel with it.
export function tokenPathFor(folder: string, dataDir: string): string {
  const hash = createHash("sha256").update(realpathSync(folder)).digest("hex").slice(0, 24);
  return join(dataDir, "mcp", `${hash}.token`);
}

export async function loadOrCreateToken(path: string): Promise<string> {
  try {
    const token = (await readFile(path, "utf8")).trim();
    if (token.length >= 32) return token;
  } catch {
    // Created below.
  }
  const token = randomBytes(32).toString("base64url");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${token}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
  return token;
}

export type McpControlOptions = {
  dataDir: string;
  port?: number;
  allowedOrigins?: readonly string[];
};

// Off until `setEnabled(true)`.
export function createMcpControl(
  vault: Vault,
  options: McpControlOptions,
): McpControl & { close(): Promise<void>; token(): Promise<string> } {
  const tokenPath = tokenPathFor(vault.folder, options.dataDir);
  const listeners = new Set<(status: McpStatus) => void>();
  let server: HttpMcpServer | null = null;
  let status: McpStatus = { running: false, url: null, tokenPath, error: null };
  let busy: Promise<unknown> = Promise.resolve();
  const set = (next: McpStatus) => {
    status = next;
    for (const listener of listeners) listener(status);
    return status;
  };
  const stop = async () => {
    await server?.close();
    server = null;
  };
  return {
    status: () => status,
    setEnabled(enabled) {
      const run = busy.then(async () => {
        if (enabled === status.running) return status;
        if (!enabled) {
          await stop();
          return set({ running: false, url: null, tokenPath, error: null });
        }
        try {
          server = await startHttpMcp({
            runtime: vault.runtime,
            workspace: vaultWorkspace(vault),
            token: await loadOrCreateToken(tokenPath),
            ...(options.port !== undefined ? { port: options.port } : {}),
            ...(options.allowedOrigins ? { allowedOrigins: options.allowedOrigins } : {}),
          });
          return set({ running: true, url: server.url, tokenPath, error: null });
        } catch (error) {
          return set({ running: false, url: null, tokenPath, error: (error as Error).message });
        }
      });
      busy = run;
      return run;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    token: () => loadOrCreateToken(tokenPath),
    async close() {
      await busy;
      await stop();
      listeners.clear();
    },
  };
}

// The workspace a vault's MCP server serves: its id, named after the folder.
export function vaultWorkspace(vault: Pick<Vault, "folder" | "workspaceId">): McpWorkspaceRef {
  return { id: vault.workspaceId, name: basename(vault.folder) };
}

// MCP over stdin/stdout (one session) until the client disconnects.
export async function runStdio(
  runtime: Runtime,
  sessionId: string = randomUUID(),
  options: { workspace?: McpWorkspaceRef } = {},
): Promise<void> {
  const server = createMcpServer(runtime, {
    sessionId,
    ...(options.workspace ? { workspace: options.workspace } : {}),
  });
  const transport = new StdioServerTransport();
  const closed = new Promise<void>((resolve) => {
    transport.onclose = () => resolve();
  });
  await server.connect(transport);
  await closed;
}
