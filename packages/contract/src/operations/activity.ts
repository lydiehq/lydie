import { z } from "zod";

import { Activity, ActivityType } from "../activity.ts";
import { defineQuery } from "../define.ts";
import { ActorRef, Uuid, WorkspaceId } from "../entities.ts";

export const activityList = defineQuery({
  id: "activity.list",
  summary: "List workspace activity",
  description:
    "Lists what happened in a workspace, most recent first: documents created, renamed, moved, " +
    "edited, deleted; files added; database changes; on a hosted workspace also members, " +
    "teamspaces, sharing, API tokens and publishing. Repeated changes to the same thing by the " +
    "same actor within a few minutes are one item with a count. Page with `cursor`.",
  input: z.object({
    workspaceId: WorkspaceId,
    limit: z.number().int().min(1).max(200).default(50),
    cursor: z
      .string()
      .min(1)
      .optional()
      .describe("nextCursor of the previous page. Pass the same filters."),
    actors: z.array(ActorRef).min(1).max(100).optional().describe("Only these actors."),
    types: z.array(ActivityType).min(1).optional().describe("Only these kinds of change."),
    targetId: Uuid.optional().describe("Only changes to this document, file or database."),
    sessionId: z.string().min(1).optional().describe("Only this agent session."),
    search: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .describe(
        "Only items whose title (or the name of the person, teamspace or token they are " +
          "about) contains this (case-insensitive).",
      ),
  }),
  output: z.object({
    items: z.array(Activity),
    nextCursor: z
      .string()
      .nullable()
      .describe("Pass as `cursor` for the next page; null at the end."),
  }),
  scopes: ["docs:read"],
  // POST: `actors` and `types` are lists, and query parameters are primitives (database.query).
  rest: { method: "POST", path: "/workspaces/{workspaceId}/activity/query" },
  mcp: { name: "list_activity", title: "List workspace activity", expose: "fine" },
  cli: { command: ["activity", "list"], args: ["workspaceId"] },
});
