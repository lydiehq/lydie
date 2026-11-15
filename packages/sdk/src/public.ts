// The unauthenticated read of a public share link (`/v1/public/shares/{token}`). Not an operation,
// so it is not in the OpenAPI document; the shape is restated here.

export type PublicShareTreeEntry = {
  id: string;
  parentId: string | null;
  title: string;
  sortKey: string;
  // 0 for the shared page.
  depth: number;
};

export type PublicShare = {
  link: { includeSubpages: boolean; rootId: string; expiresAt: string | null };
  document: { id: string; title: string; updatedAt?: string };
  // `html` is rendered by the server and safe to insert as is.
  body: { markdown: string; html: string; version: string; yjsState: string | null };
  tree: PublicShareTreeEntry[];
};

export type PublicShareResult =
  | { status: "ok"; share: PublicShare }
  | { status: "password-required"; wrongPassword: boolean }
  | { status: "rate-limited" }
  | { status: "not-found" }
  | { status: "error"; message: string };

export async function fetchPublicShare(options: {
  baseUrl: string;
  token: string;
  documentId?: string | null;
  password?: string | null;
  fetch?: typeof fetch;
}): Promise<PublicShareResult> {
  const doFetch = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/+$/, "");
  const path = `/v1/public/shares/${encodeURIComponent(options.token)}${
    options.documentId ? `/documents/${encodeURIComponent(options.documentId)}` : ""
  }`;
  let response: Response;
  try {
    response = await doFetch(`${base}${path}`, {
      headers: options.password ? { "Lydie-Share-Password": options.password } : {},
    });
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : String(error) };
  }
  if (response.ok) return { status: "ok", share: (await response.json()) as PublicShare };
  if (response.status === 404) return { status: "not-found" };
  if (response.status === 429) return { status: "rate-limited" };
  if (response.status === 401) {
    return { status: "password-required", wrongPassword: Boolean(options.password) };
  }
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return { status: "error", message: body?.error?.message ?? `HTTP ${response.status}` };
}
