// The OAuth consent step of the hosted MCP server: an app (Claude, Cursor, …) asks to act for the
// signed-in person in one of their workspaces. The server keeps the pending request; this page
// shows it and sends the decision, then follows the redirect back to the app.

import type { ApiCaller, ApiOperations } from "@lydie/sdk";

export type ConsentRequest = ApiOperations["oauth.getRequest"]["output"];
export type Decision = Omit<ApiOperations["oauth.decide"]["input"], "id">;
// The hosted operations; rejects with the API error (`status` on it).
export type ConsentApi = Pick<ApiCaller, "call">;

export type LoadResult =
  | { status: "ok"; request: ConsentRequest }
  | { status: "gone" }
  | { status: "error"; message: string };

export async function loadRequest(api: ConsentApi, id: string): Promise<LoadResult> {
  try {
    return { status: "ok", request: await api.call("oauth.getRequest", { id }) };
  } catch (error) {
    const e = error as { status?: number; message?: string };
    if (e.status === 404 || e.status === 410) return { status: "gone" };
    return { status: "error", message: e.message ?? String(error) };
  }
}

export async function decide(api: ConsentApi, id: string, decision: Decision): Promise<string> {
  return (await api.call("oauth.decide", { id, ...decision })).redirectTo;
}

const SCOPES: Record<string, string> = {
  "docs:read": "Read the pages you can see",
  "docs:write": "Create, change and delete pages for you",
  "inbox:write": "Add to your inbox",
  mcp: "Use Lydie's tools for agents",
  "mcp:tools": "Use Lydie's tools for agents",
  profile: "See your name",
  email: "See your email address",
  openid: "Know who you are",
  offline_access: "Stay connected until you remove it",
};

// A scope in plain words (unknown ones as they are).
export function describeScope(scope: string): string {
  return SCOPES[scope] ?? scope;
}

// Only http(s) logos; anything else is not shown.
export function safeLogo(uri: string | null | undefined): string | null {
  if (!uri) return null;
  try {
    const url = new URL(uri);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
