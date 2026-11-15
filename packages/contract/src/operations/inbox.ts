import { z } from "zod";

import { defineOperation } from "../define.ts";
import { Uuid, WorkspaceId } from "../entities.ts";

// The inbox: a top-level page (named "Inbox" unless the caller names another) that quick capture,
// the web clipper and automations add to. Its own scope, inbox:write, lets a token add to it
// without reading or changing anything else.
export const inboxCapture = defineOperation({
  id: "inbox.capture",
  summary: "Add to the inbox",
  description:
    "Adds to the workspace's inbox, a top-level page named Inbox that is created when missing. " +
    "Without a title the text is appended to the inbox as a list item (prefixed with `time`, " +
    "e.g. 09:41, when given). With a title it becomes a page inside the inbox, with the text as " +
    "its body and `url` as its `source` property. Needs only the inbox:write scope, so a " +
    "capture-only token (a web clipper, an automation) cannot read or change anything else. " +
    "Returns ids only, never content.",
  input: z.object({
    workspaceId: WorkspaceId,
    markdown: z.string().trim().min(1).max(200_000),
    title: z.string().trim().min(1).max(255).optional(),
    url: z
      .url({ protocol: /^https?$/ })
      .max(4096)
      .optional(),
    time: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional()
      .describe("Local time of the capture (HH:mm), shown before an appended item."),
    inbox: z.string().trim().min(1).max(255).default("Inbox").describe("The inbox page's title."),
  }),
  output: z.object({
    inboxId: Uuid,
    // The page made for a titled capture, else the inbox itself.
    documentId: Uuid,
    created: z.boolean().describe("A titled capture made a page of its own."),
  }),
  scopes: ["inbox:write"],
  destructive: false,
  idempotent: false,
  undo: "inverse",
  composite: true,
  rest: { method: "POST", path: "/workspaces/{workspaceId}/inbox" },
  mcp: { name: "add_to_inbox", title: "Add to inbox", outputSchema: true },
  cli: { command: ["inbox", "add"], args: ["workspaceId", "markdown"] },
});
