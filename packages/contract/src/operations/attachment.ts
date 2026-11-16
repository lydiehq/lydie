import { z } from "zod";

import { defineOperation, defineQuery } from "../define.ts";
import { Attachment, Uuid, WorkspaceId } from "../entities.ts";

export const attachmentCreate = defineOperation({
  id: "attachment.create",
  summary: "Add an attachment",
  description:
    "Records an attachment whose bytes are already stored under their SHA-256 (the Blob port " +
    "locally, an upload URL when hosted). Several attachments may share the same bytes.",
  input: z.object({
    workspaceId: WorkspaceId,
    id: Uuid.optional().describe("Client-minted id. Generated when omitted."),
    documentId: Uuid.nullable().default(null),
    filename: z.string().trim().min(1).max(255),
    contentType: z.string().min(1).max(255),
    size: z.number().int().min(0),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  output: Attachment,
  scopes: ["docs:write"],
  destructive: false,
  idempotent: false,
  undo: "inverse",
  emits: ["attachment.created"],
  rest: { method: "POST", path: "/attachments" },
  mcp: { name: "create_attachment", title: "Add attachment" },
  cli: { command: ["attachment", "add"], args: ["workspaceId", "filename"] },
});

export const attachmentDelete = defineOperation({
  id: "attachment.delete",
  summary: "Delete an attachment",
  description: "Moves an attachment to the trash, where it can be restored.",
  input: z.object({ id: Uuid }),
  output: Attachment,
  scopes: ["docs:write"],
  destructive: true,
  idempotent: true,
  undo: "inverse",
  emits: ["attachment.deleted"],
  rest: { method: "DELETE", path: "/attachments/{id}" },
  mcp: { name: "delete_attachment", title: "Delete attachment" },
  cli: { command: ["attachment", "rm"], args: ["id"] },
});

export const attachmentRestore = defineOperation({
  id: "attachment.restore",
  summary: "Restore an attachment",
  input: z.object({ id: Uuid }),
  output: Attachment,
  scopes: ["docs:write"],
  destructive: false,
  idempotent: true,
  undo: "inverse",
  emits: ["attachment.restored"],
  rest: { method: "POST", path: "/attachments/{id}/restore" },
  mcp: { none: "Restoring is done in the app; undo_session reverts an agent's own changes." },
  cli: { command: ["attachment", "restore"], args: ["id"] },
});

export const attachmentPurge = defineOperation({
  id: "attachment.purge",
  summary: "Permanently delete an attachment",
  description:
    "Permanently deletes an attachment in the trash. Its bytes are removed when no other " +
    "attachment uses them. Cannot be undone.",
  input: z.object({ id: Uuid }),
  output: z.object({ purgedIds: z.array(Uuid) }),
  scopes: ["docs:write"],
  destructive: true,
  idempotent: true,
  undo: { none: "Purged attachments are gone." },
  emits: ["attachment.purged"],
  rest: { method: "POST", path: "/attachments/{id}/purge" },
  mcp: {
    none: "Permanent deletion is left to people: agents move things to the trash, which undo_session reverts.",
  },
  cli: { command: ["attachment", "purge"], args: ["id"] },
});

export const attachmentGet = defineQuery({
  id: "attachment.get",
  summary: "Get an attachment",
  input: z.object({ id: Uuid }),
  output: Attachment,
  scopes: ["docs:read"],
  rest: { method: "GET", path: "/attachments/{id}" },
  mcp: { name: "get_attachment", title: "Get attachment" },
  cli: { command: ["attachment", "get"], args: ["id"] },
});

export const attachmentList = defineQuery({
  id: "attachment.list",
  summary: "List attachments",
  description: "Lists a workspace's attachments, or one document's, newest first.",
  input: z.object({
    workspaceId: WorkspaceId,
    documentId: Uuid.optional(),
    includeDeleted: z.boolean().default(false),
  }),
  output: z.object({ attachments: z.array(Attachment) }),
  scopes: ["docs:read"],
  rest: { method: "GET", path: "/workspaces/{workspaceId}/attachments" },
  mcp: { name: "list_attachments", title: "List attachments" },
  cli: { command: ["attachment", "ls"], args: ["workspaceId"] },
});
