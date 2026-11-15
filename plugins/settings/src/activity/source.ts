import type { Activity, AppApi, HistorySession } from "@lydie/plugin-api";

import type { ActivityQuery } from "./filters.ts";

// Where the activity log is read. A synced window's replica only knows what this device wrote, so
// the workspace's log comes from the hosted API (`account.callContract`, as workspace.export
// does); folder and browser workspaces run the same operations on the window's runtime.

export type ActivityPage = { items: Activity[]; nextCursor: string | null };

export type ActivitySource = {
  hosted: boolean;
  list(query: ActivityQuery & { cursor?: string }): Promise<ActivityPage>;
  sessions(workspaceId: string): Promise<HistorySession[]>;
  undoSession(sessionId: string): Promise<{
    undoneIds: string[];
    skipped: { id: string; operation: string; reason: SkipReason; message: string }[];
  }>;
};

export type SkipReason = "not_undoable" | "conflict" | "failed";

export function activitySource(app: AppApi): ActivitySource {
  const account = app.services?.account;
  const remote = app.workspace.mode === "synced" ? account?.callContract?.bind(account) : undefined;
  if (remote) {
    return {
      hosted: true,
      list: (query) => remote("activity.list", query),
      sessions: async (workspaceId) =>
        (await remote("history.listSessions", { workspaceId, limit: 200 })).sessions,
      undoSession: (sessionId) => remote("history.undoSession", { sessionId }),
    };
  }
  return {
    hosted: false,
    list: (query) => app.backend.execute("activity.list", query),
    sessions: async (workspaceId) =>
      (await app.backend.execute("history.listSessions", { workspaceId, limit: 200 })).sessions,
    undoSession: (sessionId) =>
      app.backend.execute("history.undoSession", { sessionId }, { scope: app.historyScope() }),
  };
}

// The server (an older core) or this window does not answer the operation at all.
export function isUnavailable(error: unknown): boolean {
  const { code, status } = (error ?? {}) as { code?: unknown; status?: unknown };
  return (
    code === "unknown_operation" ||
    code === "internal" ||
    code === "not_implemented" ||
    (code === undefined && (status === 404 || status === 405 || status === 501))
  );
}
