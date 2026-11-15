import type { Operations } from "@lydie/contract";

import type { Handlers } from "../runtime.ts";
import { activityHandlers } from "./activity.ts";
import { attachmentHandlers } from "./attachment.ts";
import { databaseHandlers } from "./database.ts";
import { docHandlers } from "./doc.ts";
import { historyHandlers } from "./history.ts";
import { inboxHandlers } from "./inbox.ts";
import { threadHandlers } from "./thread.ts";
import { trashHandlers } from "./trash.ts";
import { workspaceHandlers } from "./workspace.ts";

// Handlers for every operation in @lydie/contract's registry.
export const coreHandlers: Handlers<Operations> = {
  ...docHandlers,
  ...trashHandlers,
  ...attachmentHandlers,
  ...threadHandlers,
  ...historyHandlers,
  ...activityHandlers,
  ...databaseHandlers,
  ...workspaceHandlers,
  ...inboxHandlers,
};
