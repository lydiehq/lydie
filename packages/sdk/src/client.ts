import { apiRoutes } from "./generated.ts";
import type { ApiOperationId, ApiOperations } from "./generated.ts";

export type ApiRequest = {
  method: string;
  // Under `/v1`, with the query string.
  path: string;
  body?: unknown;
};

// Sends one request and resolves with the parsed JSON body; rejects on an error status. The app
// supplies it (with the session's token, the `Lydie-Version` header and its error handling).
export type Transport = (request: ApiRequest) => Promise<unknown>;

export type ApiCaller = {
  call<K extends ApiOperationId>(
    id: K,
    input: ApiOperations[K]["input"],
  ): Promise<ApiOperations[K]["output"]>;
};

// Where an operation's input goes: path parameters into the path, the listed query parameters
// into the query string (GET and DELETE), the rest into the JSON body.
export function requestFor(id: ApiOperationId, input: Record<string, unknown>): ApiRequest {
  const route = apiRoutes[id];
  const rest: Record<string, unknown> = { ...input };
  const path = route.path.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = rest[name];
    if (value === undefined || value === null) throw new Error(`${id}: missing ${name}`);
    delete rest[name];
    return encodeURIComponent(typeof value === "string" ? value : JSON.stringify(value));
  });
  const query = new URLSearchParams();
  for (const name of route.query as readonly string[]) {
    const value = rest[name];
    delete rest[name];
    if (value === undefined || value === null) continue;
    query.set(name, typeof value === "string" ? value : JSON.stringify(value));
  }
  const search = query.size ? `?${query}` : "";
  const hasBody = route.method !== "GET" && route.method !== "DELETE";
  return {
    method: route.method,
    path: `/v1${path}${search}`,
    ...(hasBody ? { body: rest } : {}),
  };
}

export function createApiCaller(transport: Transport): ApiCaller {
  return {
    call: (id, input) =>
      transport(requestFor(id, (input ?? {}) as Record<string, unknown>)) as never,
  };
}
