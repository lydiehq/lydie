import { z } from "zod";

import { defineOperation, defineQuery } from "../define.ts";
import { TrashItem, Uuid, WorkspaceId } from "../entities.ts";

export const trashList = defineQuery({
  id: "trash.list",
  summary: "List the trash",
  description:
    "Lists what is in a workspace's trash, newest first. A document deleted with its subtree is " +
    "one item; restoring it restores the subtree.",
  input: z.object({
    workspaceId: WorkspaceId,
    limit: z.number().int().min(1).max(500).default(100),
  }),
  output: z.object({ items: z.array(TrashItem) }),
  scopes: ["docs:read"],
  rest: { method: "GET", path: "/workspaces/{workspaceId}/trash" },
  mcp: {
    none: "list_activity shows what was deleted and when; restore_doc brings a document back.",
  },
  cli: { command: ["trash", "ls"], args: ["workspaceId"] },
  ui: { commandPalette: { title: "Open trash", group: "Navigation" } },
});

export const trashEmpty = defineOperation({
  id: "trash.empty",
  summary: "Empty the trash",
  description: "Permanently deletes everything in a workspace's trash. Cannot be undone.",
  input: z.object({ workspaceId: WorkspaceId }),
  output: z.object({ purgedIds: z.array(Uuid) }),
  scopes: ["docs:write"],
  destructive: true,
  idempotent: true,
  undo: { none: "Emptying the trash deletes permanently." },
  emits: ["doc.purged", "attachment.purged"],
  rest: { method: "DELETE", path: "/workspaces/{workspaceId}/trash" },
  mcp: {
    none: "Permanent deletion is left to people: agents move things to the trash, which undo_session reverts.",
  },
  cli: { command: ["trash", "empty"], args: ["workspaceId"] },
  ui: { commandPalette: { title: "Empty trash", group: "Document", bindable: false } },
});
