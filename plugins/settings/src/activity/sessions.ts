import type { Activity, Actor, HistorySession } from "@lydie/plugin-api";

// An agent's session (one run of work: an MCP or API run, a CLI run) reads as one entry: consecutive rows of the
// list with the same session and agent fold into "Claude Code made 14 changes in 6 pages".

export type SessionEntry = {
  kind: "session";
  sessionId: string;
  actor: Extract<Actor, { type: "agent" }>;
  items: Activity[];
  // Changes the rows stand for (rows are coalesced) and the distinct things changed. Activity
  // counts, not what Undo acts on (undoableSessions).
  changes: number;
  pages: number;
  firstAt: string;
  lastAt: string;
};

export type ActivityEntry = { kind: "item"; item: Activity } | SessionEntry;

const sameAgent = (a: Actor, b: Actor) =>
  a.type === "agent" &&
  b.type === "agent" &&
  a.app === b.app &&
  a.id === b.id &&
  a.onBehalfOf === b.onBehalfOf;

export function collapseSessions(items: readonly Activity[]): ActivityEntry[] {
  const out: ActivityEntry[] = [];
  let run: Activity[] = [];
  const flush = () => {
    if (run.length === 1) out.push({ kind: "item", item: run[0]! });
    else if (run.length > 1) out.push(sessionOf(run));
    run = [];
  };
  for (const item of items) {
    const head = run[0];
    if (head && item.sessionId === head.sessionId && sameAgent(item.actor, head.actor)) {
      run.push(item);
      continue;
    }
    flush();
    if (item.sessionId !== null && item.actor.type === "agent") run.push(item);
    else out.push({ kind: "item", item });
  }
  flush();
  return out;
}

function sessionOf(items: Activity[]): SessionEntry {
  const first = items[0]!;
  let firstAt = first.firstAt;
  let lastAt = first.lastAt;
  for (const item of items) {
    if (item.firstAt < firstAt) firstAt = item.firstAt;
    if (item.lastAt > lastAt) lastAt = item.lastAt;
  }
  return {
    kind: "session",
    sessionId: first.sessionId!,
    actor: first.actor as SessionEntry["actor"],
    items,
    changes: items.reduce((sum, item) => sum + item.count, 0),
    pages: new Set(
      items
        .filter((i) => i.targetId !== null && !i.type.startsWith("attachment."))
        .map((i) => i.targetId),
    ).size,
    firstAt,
    lastAt,
  };
}

export const entryTime = (entry: ActivityEntry) =>
  entry.kind === "item" ? entry.item.lastAt : entry.lastAt;

// Sessions `me` may undo, with the journal entries `history.undoSession` would act on: one per
// operation, so not the summary's activity count (a page created with a body is one entry, two
// rows), and the whole session, also the parts the list has not loaded.
export function undoableSessions(
  sessions: readonly HistorySession[],
  me: string,
): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  for (const s of sessions) {
    const left = s.count - s.undoneCount;
    if (s.actor.type === "agent" && s.actor.onBehalfOf === me && left > 0) {
      out.set(s.sessionId, left);
    }
  }
  return out;
}
