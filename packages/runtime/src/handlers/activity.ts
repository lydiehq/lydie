import type { Operations } from "@lydie/contract";

import { decodeActivityCursor, encodeActivityCursor } from "../activity.ts";
import type { Handlers } from "../runtime.ts";
import { unsupported } from "./doc.ts";

export const activityHandlers: Handlers<Operations> = {
  async "activity.list"(ctx, input) {
    const port = ctx.tx.activity ?? unsupported("The activity log");
    // One more than asked, to know whether there is a next page.
    const rows = await port.list({
      workspaceId: input.workspaceId,
      limit: input.limit + 1,
      ...(input.cursor ? { after: decodeActivityCursor(input.cursor) } : {}),
      ...(input.actors ? { actors: input.actors } : {}),
      ...(input.types ? { types: input.types } : {}),
      ...(input.targetId ? { targetId: input.targetId } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.search ? { search: input.search } : {}),
    });
    const items = rows.slice(0, input.limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor: rows.length > input.limit && last ? encodeActivityCursor(last) : null,
    };
  },
};
