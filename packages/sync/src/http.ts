import type { ErrorBody, FetchLike } from "./types.ts";

// Why a request failed, which decides what the caller does next:
// network / server (5xx, 429): retry with backoff; auth (401): the session is gone, sign in again;
// client (other 4xx): the request itself is wrong, retrying will not help.
export type ApiErrorKind = "network" | "server" | "auth" | "client";

export class ApiError extends Error {
  override readonly name = "ApiError";
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status: number | null = null,
    readonly body: ErrorBody | null = null,
  ) {
    super(message);
  }

  get code(): string {
    return this.body?.code ?? this.kind;
  }

  get retryable(): boolean {
    return this.kind === "network" || this.kind === "server";
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;

export type ApiClientOptions = {
  // e.g. "https://api.lydie.co" or "http://localhost:4100" (no trailing slash needed).
  baseUrl: string;
  // The session's bearer token; null when signed out (requests then go without it).
  token: () => string | null;
  fetch?: FetchLike;
  // Sent as `Lydie-Version`.
  version?: string;
  // Called on every 401 from an authenticated request.
  onUnauthorized?: () => void;
};

export type RequestOptions = {
  body?: unknown;
  signal?: AbortSignal;
  // Default true: send the bearer token.
  auth?: boolean;
  // A 401 here refuses the request itself (a wrong two-step code), not the session: do not mark
  // the session expired.
  keepSessionOn401?: boolean;
  headers?: Record<string, string>;
};

export type ApiClient = {
  readonly baseUrl: string;
  request<T>(method: string, path: string, options?: RequestOptions): Promise<T>;
  get<T>(path: string, options?: Omit<RequestOptions, "body">): Promise<T>;
  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "body">): Promise<T>;
  // The raw response of a successful request (headers needed, e.g. `set-auth-token`).
  send(
    method: string,
    path: string,
    options?: RequestOptions,
  ): Promise<{ response: Response; data: unknown }>;
  fetch: FetchLike;
};

export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));

  async function send(method: string, path: string, req: RequestOptions = {}) {
    const auth = req.auth ?? true;
    const token = auth ? options.token() : null;
    const headers: Record<string, string> = { ...req.headers };
    if (token) headers.authorization = `Bearer ${token}`;
    if (options.version) headers["lydie-version"] = options.version;
    if (req.body !== undefined) headers["content-type"] = "application/json";
    let response: Response;
    try {
      response = await doFetch(path.startsWith("http") ? path : `${baseUrl}${path}`, {
        method,
        headers,
        ...(req.body !== undefined ? { body: JSON.stringify(req.body) } : {}),
        ...(req.signal ? { signal: req.signal } : {}),
      });
    } catch (error) {
      if (req.signal?.aborted) throw error;
      throw new ApiError("network", `${method} ${path}: ${messageOf(error)}`);
    }
    const text = await response.text().catch(() => "");
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (response.ok) return { response, data };
    const body = errorBody(data);
    const message = `${method} ${path} -> ${response.status}${body ? `: ${body.message}` : ""}`;
    if (response.status === 401) {
      if (auth && !req.keepSessionOn401) options.onUnauthorized?.();
      throw new ApiError("auth", message, 401, body);
    }
    const kind = response.status >= 500 || response.status === 429 ? "server" : "client";
    throw new ApiError(kind, message, response.status, body);
  }

  const request = async <T>(method: string, path: string, req?: RequestOptions) =>
    (await send(method, path, req)).data as T;

  return {
    baseUrl,
    send,
    request,
    get: (path, req) => request("GET", path, req),
    post: (path, body, req) => request("POST", path, { ...req, body: body ?? {} }),
    fetch: doFetch,
  };
}

function errorBody(data: unknown): ErrorBody | null {
  if (data && typeof data === "object" && "error" in data) {
    const error = (data as { error: unknown }).error;
    if (error && typeof error === "object" && "message" in error) return error as ErrorBody;
  }
  // Better Auth's endpoints (/auth/...) answer `{ code, message }` without the envelope.
  const flat = data as { code?: unknown; message?: unknown } | null;
  if (typeof flat?.code === "string" && typeof flat.message === "string") {
    return { code: flat.code, message: flat.message };
  }
  return null;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
