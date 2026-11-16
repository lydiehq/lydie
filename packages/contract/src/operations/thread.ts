import { z } from "zod";

import { defineOperation, defineQuery } from "../define.ts";
import { Uuid } from "../entities.ts";
import { Thread, ThreadAnchor, ThreadBody, ThreadKind } from "../thread.ts";

export const threadCreate = defineOperation({
  id: "thread.create",
  summary: "Leave a note or a comment",
  description:
    "Starts a thread beside a document; the body is not changed and threads are never " +
    "published. A note is what the next reader should know about the text (why it says this, " +
    "what it was checked against); a comment needs an answer. `quote` attaches it to a passage " +
    "of the document; add `prefix` or `suffix` (the text just before or after) when the " +
    "passage occurs more than once. Without `quote` it is about the whole page.",
  input: z.object({
    documentId: Uuid,
    kind: ThreadKind.default("note"),
    body: ThreadBody.describe("Markdown."),
    quote: z.string().min(1).max(4000).optional(),
    prefix: z.string().max(200).optional(),
    suffix: z.string().max(200).optional(),
    exact: z
      .boolean()
      .optional()
      .describe("For editors: quote is the document's text already, store it as given."),
    id: Uuid.optional().describe("Client-minted id. Generated when omitted."),
  }),
  output: Thread,
  scopes: ["docs:write"],
  destructive: false,
  idempotent: false,
  undo: "inverse",
  emits: ["thread.created"],
  rest: { method: "POST", path: "/documents/{documentId}/threads" },
  mcp: { name: "create_thread", title: "Leave a note or comment" },
  cli: { command: ["thread", "add"], args: ["documentId", "body"] },
});

export const threadReply = defineOperation({
  id: "thread.reply",
  summary: "Reply to a thread",
  input: z.object({
    threadId: Uuid,
    body: ThreadBody.describe("Markdown."),
    id: Uuid.optional().describe("Client-minted id of the reply. Generated when omitted."),
  }),
  output: Thread,
  scopes: ["docs:write"],
  destructive: false,
  idempotent: false,
  undo: "inverse",
  emits: ["thread.replied"],
  rest: { method: "POST", path: "/threads/{threadId}/replies" },
  mcp: { name: "reply_to_thread", title: "Reply to a thread" },
  cli: { command: ["thread", "reply"], args: ["threadId", "body"] },
});

export const threadEdit = defineOperation({
  id: "thread.edit",
  summary: "Edit a thread or a reply",
  description: "Changes the text of a thread or of one reply. Only its author may.",
  input: z.object({ id: Uuid.describe("A thread or a reply."), body: ThreadBody }),
  output: Thread,
  scopes: ["docs:write"],
  destructive: false,
  idempotent: true,
  undo: "inverse",
  emits: ["thread.updated"],
  rest: { method: "PATCH", path: "/threads/{id}" },
  mcp: { none: "Agents add to a thread with reply_to_thread instead of rewriting it." },
  cli: { command: ["thread", "edit"], args: ["id", "body"] },
});

export const threadSetAnchor = defineOperation({
  id: "thread.setAnchor",
  summary: "Move a thread",
  description:
    "Attaches a thread to another passage, or to the page as a whole with anchor null. Editors " +
    "use it to keep a thread on its text while the text is edited.",
  input: z.object({ id: Uuid, anchor: ThreadAnchor.nullable() }),
  output: Thread,
  scopes: ["docs:write"],
  destructive: false,
  idempotent: true,
  undo: "inverse",
  emits: ["thread.updated"],
  rest: { method: "PUT", path: "/threads/{id}/anchor" },
  mcp: { none: "Notes are attached to another passage in the editor." },
  cli: { command: ["thread", "move"], args: ["id"] },
});

export const threadResolve = defineOperation({
  id: "thread.resolve",
  summary: "Resolve or reopen a thread",
  description:
    "Marks a thread as dealt with: an answered comment, a note that no longer applies. It is " +
    "kept, and resolved: false reopens it.",
  input: z.object({ id: Uuid, resolved: z.boolean().default(true) }),
  output: Thread,
  scopes: ["docs:write"],
  destructive: false,
  idempotent: true,
  undo: "inverse",
  emits: ["thread.resolved"],
  rest: { method: "POST", path: "/threads/{id}/resolve" },
  mcp: { name: "resolve_thread", title: "Resolve a thread" },
  cli: { command: ["thread", "resolve"], args: ["id"] },
});

export const threadDelete = defineOperation({
  id: "thread.delete",
  summary: "Delete a thread or a reply",
  description: "Deleting a thread hides its replies too. Undo with thread.restore.",
  input: z.object({ id: Uuid.describe("A thread or a reply.") }),
  output: z.object({ id: Uuid, threadId: Uuid }),
  scopes: ["docs:write"],
  destructive: true,
  idempotent: true,
  undo: "inverse",
  emits: ["thread.deleted"],
  rest: { method: "DELETE", path: "/threads/{id}" },
  mcp: { none: "resolve_thread closes a thread; undo_session removes an agent's own." },
  cli: { command: ["thread", "rm"], args: ["id"] },
});

export const threadRestore = defineOperation({
  id: "thread.restore",
  summary: "Restore a thread or a reply",
  input: z.object({ id: Uuid.describe("A thread or a reply.") }),
  output: z.object({ id: Uuid, threadId: Uuid }),
  scopes: ["docs:write"],
  destructive: false,
  idempotent: true,
  undo: "inverse",
  emits: ["thread.restored"],
  rest: { method: "POST", path: "/threads/{id}/restore" },
  mcp: { none: "Restoring is done in the app; undo_session reverts an agent's own changes." },
  cli: { command: ["thread", "restore"], args: ["id"] },
});

export const threadList = defineQuery({
  id: "thread.list",
  summary: "List a document's threads",
  description:
    "The notes and comments left beside a document, oldest first, each with its replies. Open " +
    "threads only unless `state` says otherwise.",
  input: z.object({
    documentId: Uuid,
    state: z.enum(["open", "resolved", "all"]).default("open"),
    kind: ThreadKind.optional(),
  }),
  output: z.object({ threads: z.array(Thread) }),
  scopes: ["docs:read"],
  rest: { method: "GET", path: "/documents/{documentId}/threads" },
  // Agents get a document's open threads from fetch_doc.
  mcp: { none: "fetch_doc returns a document's open threads." },
  cli: { command: ["thread", "ls"], args: ["documentId"] },
});
