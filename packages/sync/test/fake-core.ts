// An in-memory stand-in for the core's HTTP API, as a `fetch` function, with failure injection.
// It implements the parts of the protocol @lydie/sync relies on: upload with
// per-entry results and dedupe by operation id, tokens, attachment uploads, Better Auth sign-in.
import { uuidFromBits } from "@lydie/contract";

import type { AppliedOperation, FetchLike } from "../src/types.ts";

export type Outcome = {
  status: "applied" | "rejected";
  warnings?: string[];
  error?: { code: string; message: string };
};

type Hook = (request: {
  method: string;
  path: string;
  body: unknown;
}) =>
  | Response
  | "network"
  | "drop-response"
  | undefined
  | Promise<Response | "network" | "drop-response" | undefined>;

export type FakeCore = {
  fetch: FetchLike;
  // Operation ids in the order the server first applied (or rejected) them.
  ledger: Map<string, Outcome & { entry: AppliedOperation }>;
  applied: AppliedOperation[];
  // Upload requests received (each one's operation ids).
  uploads: string[][];
  requests: Array<{ method: string; path: string }>;
  // Decides each new entry's outcome. Default: applied.
  decide: (entry: AppliedOperation) => Outcome;
  // Runs before the default handling of every request; return a Response to answer instead,
  // "network" to fail the fetch, "drop-response" to process it and then fail the fetch (a crash
  // or lost connection after the server committed).
  hook: Hook | null;
  // Valid bearer tokens -> user id.
  sessions: Map<string, string>;
  blobs: Map<string, Uint8Array>;
  // Documents prepareUpload accepts (others answer not_found); null accepts all.
  knownDocuments: Set<string> | null;
  tokenCount: { sync: number; collab: number };
};

export function createFakeCore(baseUrl = "http://core.test"): FakeCore {
  const core: FakeCore = {
    fetch: null as unknown as FetchLike,
    ledger: new Map(),
    applied: [],
    uploads: [],
    requests: [],
    decide: () => ({ status: "applied" }),
    hook: null,
    sessions: new Map([["token-1", "user-1"]]),
    blobs: new Map(),
    knownDocuments: null,
    tokenCount: { sync: 0, collab: 0 },
  };

  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  const error = (status: number, code: string, message: string) =>
    json(status, { error: { code, message } });

  async function handle(method: string, url: URL, init: RequestInit | undefined) {
    const path = url.pathname;
    const raw = init?.body;
    const body =
      typeof raw === "string"
        ? (JSON.parse(raw) as unknown)
        : raw instanceof Uint8Array
          ? raw
          : null;
    const auth = new Headers(init?.headers).get("authorization")?.replace(/^Bearer /, "");
    const userId = auth ? core.sessions.get(auth) : undefined;

    if (path === "/auth/sign-in/email" || path === "/auth/sign-up/email") {
      const { email, password } = body as { email: string; password: string };
      if (password !== "password1234") return error(401, "INVALID_EMAIL_OR_PASSWORD", "Invalid");
      const token = `token-${email}`;
      core.sessions.set(token, `user-${email}`);
      return json(
        200,
        { token, user: { id: `user-${email}`, email, name: email.split("@")[0], image: null } },
        { "set-auth-token": token },
      );
    }
    if (path === "/auth/one-time-token/verify") {
      const { token } = body as { token: string };
      if (token !== "one-time-ada") return error(400, "BAD_REQUEST", "Invalid token");
      core.sessions.set("token-google-ada", "user-google-ada");
      return json(200, {
        session: { token: "token-google-ada" },
        user: { id: "user-google-ada", email: "ada@gmail.test", name: "Ada", image: null },
      });
    }
    if (path === "/auth/get-session") {
      if (!userId) return json(200, null);
      return json(200, {
        session: {},
        user: { id: userId, email: `${userId}@x`, name: "N", image: null },
      });
    }
    if (path === "/auth/sign-out") {
      if (auth) core.sessions.delete(auth);
      return json(200, { success: true });
    }
    if (path.startsWith("/v1/blobs/")) {
      core.blobs.set(path.split("/").pop()!, body as Uint8Array);
      return new Response(null, { status: 204 });
    }

    if (!userId) return error(401, "unauthenticated", "Sign in");

    if (path === "/v1/sync/token") {
      core.tokenCount.sync++;
      return json(200, {
        endpoint: "http://127.0.0.1:9",
        token: `ps-${core.tokenCount.sync}`,
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
      });
    }
    if (path === "/v1/collab/token") {
      core.tokenCount.collab++;
      return json(200, {
        url: "ws://127.0.0.1:9",
        token: `collab-${core.tokenCount.collab}`,
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
      });
    }
    if (path === "/v1/sync/upload") {
      const { operations } = body as { operations: AppliedOperation[] };
      core.uploads.push(operations.map((o) => o.id));
      const results = operations.map((entry) => {
        const previous = core.ledger.get(entry.id);
        if (previous) {
          return {
            id: entry.id,
            operation: entry.operation,
            status: previous.status,
            duplicate: true,
            ...(previous.error ? { error: previous.error } : {}),
          };
        }
        const outcome = core.decide(entry);
        core.ledger.set(entry.id, { ...outcome, entry });
        if (outcome.status === "applied") core.applied.push(entry);
        return { id: entry.id, operation: entry.operation, ...outcome };
      });
      return json(200, { results });
    }
    if (path === "/v1/workspaces") return json(200, { workspaces: [] });
    if (path === "/v1/attachments/uploads") {
      const input = body as { documentId: string | null; sha256: string; contentType: string };
      if (core.knownDocuments && input.documentId && !core.knownDocuments.has(input.documentId)) {
        return error(404, "not_found", "No such document");
      }
      if (input.contentType === "application/x-msdownload") {
        return error(400, "invalid_input", "Files of this type cannot be attached");
      }
      if (core.blobs.has(input.sha256)) return json(200, { upload: null, maxBytes: 1 });
      return json(200, {
        upload: {
          method: "PUT",
          url: `${baseUrl}/v1/blobs/sha256/${input.sha256}?sig=x`,
          headers: { "content-type": input.contentType },
          expiresAt: new Date(Date.now() + 900_000).toISOString(),
        },
        maxBytes: 1,
      });
    }
    const download = /^\/v1\/attachments\/([^/]+)\/download-url$/.exec(path);
    if (download) {
      return json(200, {
        url: `${baseUrl}/v1/attachments/${download[1]}/content?sig=${Math.random()}`,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      });
    }
    return error(404, "not_found", `No route ${method} ${path}`);
  }

  core.fetch = async (input, init) => {
    const url = new URL(input);
    const method = init?.method ?? "GET";
    core.requests.push({ method, path: url.pathname });
    const raw = init?.body;
    const parsed = typeof raw === "string" ? (JSON.parse(raw) as unknown) : null;
    const hooked = await core.hook?.({ method, path: url.pathname, body: parsed });
    if (hooked === "network") throw new TypeError("fetch failed: connection refused");
    if (hooked instanceof Response) return hooked;
    const response = await handle(method, url, init);
    if (hooked === "drop-response") throw new TypeError("fetch failed: connection reset");
    return response;
  };
  return core;
}

let counter = 0;

// Increasing ids (the operation log is ordered by id).
export function testUuid(): string {
  counter++;
  return uuidFromBits((BigInt(Date.now()) << 80n) | (7n << 76n) | BigInt(counter));
}

export function makeOp(
  operation: string,
  input: Record<string, unknown>,
  userId = "user-1",
): AppliedOperation {
  return {
    id: testUuid(),
    operation,
    input,
    actor: { type: "user", id: userId },
    sessionId: null,
    workspaceId: typeof input.workspaceId === "string" ? input.workspaceId : "ws-1",
    createdAt: new Date().toISOString(),
    version: "2026-11-12",
  };
}

// An in-memory operation log (the store's `oplog` shape).
export function memoryOplog(entries: AppliedOperation[] = []) {
  const log = [...entries];
  return {
    entries: log,
    async list({ limit }: { limit?: number } = {}) {
      const sorted = [...log].sort((a, b) => (a.id < b.id ? -1 : 1));
      return limit === undefined || limit < 0 ? sorted : sorted.slice(0, limit);
    },
    async remove(ids: readonly string[]) {
      const gone = new Set(ids);
      for (let i = log.length - 1; i >= 0; i--) if (gone.has(log[i]!.id)) log.splice(i, 1);
    },
  };
}
