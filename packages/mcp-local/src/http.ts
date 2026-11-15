// Streamable HTTP on 127.0.0.1: a bearer token on every request, an Origin check (403 for an
// Origin that is not allowed, as the MCP spec requires against DNS rebinding) and a Host check.
// Each MCP session gets its own server instance and session id.
import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import type { McpWorkspaceRef } from "@lydie/contract";
import type { Runtime } from "@lydie/runtime";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { createMcpServer } from "./server.ts";

export type HttpMcpOptions = {
  runtime: Runtime;
  token: string;
  // 0 picks a free port.
  port?: number;
  // Browser origins allowed to call (e.g. an MCP inspector). Requests without Origin are allowed.
  allowedOrigins?: readonly string[];
  onBehalfOf?: string;
  // The vault's workspace (tools default to it).
  workspace?: McpWorkspaceRef;
};

export type HttpMcpServer = {
  readonly url: string;
  readonly port: number;
  // Open MCP sessions (session id → agent session id used in history).
  sessions(): string[];
  close(): Promise<void>;
};

const MAX_BODY = 8 * 1024 * 1024;

function sameToken(header: string | undefined, token: string): boolean {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? "");
  if (!match) return false;
  const a = Buffer.from(match[1]!.trim());
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

function reply(
  res: ServerResponse,
  status: number,
  message: string,
  headers: Record<string, string> = {},
) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error("Request body too large");
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? (JSON.parse(text) as unknown) : undefined;
}

export async function startHttpMcp(options: HttpMcpOptions): Promise<HttpMcpServer> {
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: Server }>();
  const origins = new Set(options.allowedOrigins ?? []);
  let port = 0;

  const http = createServer((req, res) => {
    void handle(req, res).catch((error: unknown) => {
      if (!res.headersSent)
        reply(res, 500, error instanceof Error ? error.message : "Internal error");
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/mcp") return reply(res, 404, "Not found");
    const host = req.headers.host ?? "";
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
      return reply(res, 403, "Invalid Host header");
    }
    const origin = req.headers.origin;
    if (origin !== undefined && !origins.has(origin)) return reply(res, 403, "Origin not allowed");
    if (!sameToken(req.headers.authorization, options.token)) {
      return reply(res, 401, "Missing or invalid bearer token", {
        "WWW-Authenticate": 'Bearer realm="lydie"',
      });
    }

    const body = req.method === "POST" ? await readBody(req) : undefined;
    const sid = req.headers["mcp-session-id"];
    const existing = typeof sid === "string" ? sessions.get(sid) : undefined;
    if (existing) return existing.transport.handleRequest(req, res, body);
    if (sid !== undefined) return reply(res, 404, "Unknown session");
    if (req.method !== "POST" || !isInitializeRequest(body)) {
      return reply(res, 400, "Start a session with an initialize request");
    }

    let sessionId = "";
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessionId = id;
        sessions.set(id, { transport, server });
      },
    });
    const server = createMcpServer(options.runtime, {
      get sessionId() {
        return sessionId;
      },
      ...(options.onBehalfOf ? { onBehalfOf: options.onBehalfOf } : {}),
      ...(options.workspace ? { workspace: options.workspace } : {}),
    });
    transport.onclose = () => {
      if (sessionId) sessions.delete(sessionId);
    };
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  }

  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(options.port ?? 0, "127.0.0.1", () => {
      http.off("error", reject);
      resolve();
    });
  });
  port = (http.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}/mcp`,
    port,
    sessions: () => [...sessions.keys()],
    async close() {
      for (const { server } of sessions.values()) await server.close().catch(() => {});
      sessions.clear();
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
