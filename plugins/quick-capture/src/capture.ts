// A capture is the contract's `inbox.capture` (one undoable step): the same operation the web
// clipper and automations use through the API.
import { formatDate } from "@lydie/plugin-api";
import type { AppApi } from "@lydie/plugin-api";

// Per-device name of the inbox page (default "Inbox").
export const INBOX_KEY = "quick-capture:inbox";

export async function capture(app: AppApi, text: string, now = new Date()) {
  if (!text.trim()) return null;
  const inbox = app.storage.get<string>(INBOX_KEY)?.trim() || "Inbox";
  const result = await app.backend.ops.inbox.capture(
    {
      workspaceId: app.workspace.workspaceId,
      markdown: text,
      time: formatDate(now, "HH:mm"),
      inbox,
    },
    { scope: app.historyScope(), label: "Quick capture" },
  );
  return result.inboxId;
}
