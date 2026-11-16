import { z } from "zod";

import { defineOperation, defineQuery } from "../define.ts";
import { HistoryEntry, HistorySession, Uuid, WorkspaceId } from "../entities.ts";

// A session is one run of work by an agent (a hosted credential's run, an MCP connection, a CLI
// run): every write records it, so an agent's changes can be reviewed and reverted together (plan §2, "history and revert scoped to an
// agent session").

export const historyListSessions = defineQuery({
  id: "history.listSessions",
  summary: "List agent sessions",
  description: "Lists sessions that changed a workspace, most recent first.",
  input: z.object({
    workspaceId: WorkspaceId.optional(),
    limit: z.number().int().min(1).max(200).default(50),
  }),
  output: z.object({ sessions: z.array(HistorySession) }),
  scopes: ["docs:read"],
  rest: { method: "GET", path: "/history/sessions" },
  mcp: { none: "list_activity shows each change with its session." },
  cli: { command: ["history", "sessions"] },
});

export const historyListBySession = defineQuery({
  id: "history.listBySession",
  summary: "List a session's changes",
  description: "Lists every operation a session applied, oldest first.",
  input: z.object({
    sessionId: z.string().min(1),
    limit: z.number().int().min(1).max(1000).default(200),
  }),
  output: z.object({ entries: z.array(HistoryEntry) }),
  scopes: ["docs:read"],
  rest: { method: "GET", path: "/history/sessions/{sessionId}" },
  mcp: { name: "list_session_changes", title: "List session changes" },
  cli: { command: ["history", "show"], args: ["sessionId"] },
});

export const historyUndoSession = defineOperation({
  id: "history.undoSession",
  summary: "Undo a session",
  description:
    "Reverts every change a session made, newest first, as one undoable step. Changes that later " +
    "edits by others touched are skipped and reported, as are changes that cannot be undone.",
  input: z.object({ sessionId: z.string().min(1) }),
  output: z.object({
    undoneIds: z.array(Uuid).describe("History entries that were reverted."),
    skipped: z.array(
      z.object({
        id: Uuid,
        operation: z.string(),
        reason: z.enum(["not_undoable", "conflict", "failed"]),
        message: z.string(),
      }),
    ),
  }),
  scopes: ["docs:write"],
  destructive: false,
  idempotent: true,
  undo: "inverse",
  composite: true,
  rest: { method: "POST", path: "/history/sessions/{sessionId}/undo" },
  mcp: { name: "undo_session", title: "Undo session", outputSchema: true },
  cli: { command: ["history", "undo"], args: ["sessionId"] },
});
