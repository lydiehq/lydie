import { isLydieError, LydieError } from "@lydie/contract";
import type { Operations } from "@lydie/contract";

import { touchesOverlap } from "../history.ts";
import type { HistoryRead } from "../ports.ts";
import type { Handlers } from "../runtime.ts";
import { unsupported } from "./doc.ts";

type Skipped = {
  id: string;
  operation: string;
  reason: "not_undoable" | "conflict" | "failed";
  message: string;
};

function historyOf(tx: { history?: HistoryRead | undefined }): HistoryRead {
  return tx.history ?? unsupported("The history journal");
}

export const historyHandlers: Handlers<Operations> = {
  async "history.listSessions"(ctx, input) {
    const sessions = await historyOf(ctx.tx).sessions({
      limit: input.limit,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    });
    return { sessions };
  },

  async "history.listBySession"(ctx, input) {
    const rows = await historyOf(ctx.tx).list({
      sessionId: input.sessionId,
      includeUndone: true,
      limit: input.limit,
    });
    return { entries: rows.map(({ touches: _t, scope: _s, ...entry }) => entry) };
  },

  // Undoes a session's changes newest first. A change is skipped when someone outside the session
  // later changed the same thing (or it depends on a skipped change), so their edits are never
  // overwritten. Each change is undone in a savepoint, so a failing one is skipped cleanly.
  async "history.undoSession"(ctx, input) {
    const history = ctx.tx.history ?? unsupported("The history journal");
    const own = await history.list({ sessionId: input.sessionId });
    if (own.length === 0) return { undoneIds: [], skipped: [] };
    const later = await history.list({ afterId: lowerBound(own[0]!.id) });
    const savepoint = ctx.tx.savepoint?.bind(ctx.tx) ?? unsupported("Savepoints");

    const undoneIds: string[] = [];
    const skipped: Skipped[] = [];
    const blocked: string[] = [];
    const skip = (entry: (typeof own)[number], reason: Skipped["reason"], message: string) => {
      skipped.push({ id: entry.id, operation: entry.operation, reason, message });
      blocked.push(...entry.touches);
    };
    for (const entry of [...own].reverse()) {
      if (!entry.inverse) {
        skip(entry, "not_undoable", `${entry.operation} cannot be undone`);
        continue;
      }
      // Undoing a create trashes the document with whatever is under it now: its live descendants
      // count as touched, so a child someone else added later blocks it (LYD-171).
      const touches = [...entry.touches];
      for (const step of entry.inverse) {
        const id = (step.input as { id?: unknown } | null)?.id;
        if (step.op !== "doc.delete" || typeof id !== "string") continue;
        for (const d of await ctx.tx.docs.descendants(id))
          if (!d.deletedAt) touches.push(`${d.id}|*`);
      }
      const newer = later.find(
        (l) =>
          l.id > entry.id &&
          l.sessionId !== input.sessionId &&
          l.groupId !== ctx.groupId &&
          touchesOverlap(l.touches, touches),
      );
      if (newer || touchesOverlap(blocked, touches)) {
        skip(
          entry,
          "conflict",
          newer
            ? `Changed again later by ${newer.actor.type} ${newer.actor.id} (${newer.operation})`
            : "Depends on a change that was skipped",
        );
        continue;
      }
      try {
        await savepoint(async () => {
          for (const step of entry.inverse!) {
            await ctx.exec(step.op, step.input, step.rewrite ? { rewrite: step.rewrite } : {});
          }
        });
      } catch (error) {
        if (!isLydieError(error) || error.code === "internal") throw error;
        skip(entry, "failed", error.message);
        continue;
      }
      await history.markUndone([entry.id], ctx.now);
      undoneIds.push(entry.id);
    }
    return { undoneIds, skipped };
  },
};

// The largest string below an id, so `afterId` includes the id itself.
function lowerBound(id: string): string {
  if (!id) throw new LydieError("internal", "Empty history id");
  return id.slice(0, -1) + String.fromCharCode(id.charCodeAt(id.length - 1) - 1) + "~";
}
