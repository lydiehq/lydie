import { actorRef, isWorkspaceActivityType, LydieError } from "@lydie/contract";
import type { Activity, ActivityData, ActivityType, LydieEvent } from "@lydie/contract";

import type { ActivityKey, ActivityPatch, DbTx } from "./ports.ts";

// The activity log: one row per change people would want to see, coalesced as it is written. The
// decision (insert or merge into the newest matching row) is made here, so every backend that
// implements the `activity` port behaves the same.

// A change merges into the newest row with the same workspace, actor, session, type, target and
// subject (`activitySubjectOf`) when that row's last change is less than this long ago.
export const ACTIVITY_WINDOW_MS = 10 * 60_000;
// Property keys kept on one doc.propertiesChanged row.
export const ACTIVITY_KEYS_LIMIT = 50;

// What a handler knows that the event does not say: a purged thing's title (it is gone when the
// log is written) and which property keys changed (events carry the whole new properties).
// `quiet`: the event is part of a change the log records once elsewhere (the rows a schema rewrite
// touches, LYD-410: the database's own `database.changed` row says it); `apply` skips it.
export type ActivityHint = { title?: string | null; keys?: readonly string[]; quiet?: boolean };

// One event, as the log sees it, before coalescing.
export type ActivityDraft = Omit<Activity, "id" | "count" | "firstAt" | "lastAt"> & { at: string };

export type ActivityDecision =
  | { kind: "insert"; row: Activity }
  | { kind: "update"; id: string; patch: ActivityPatch };

export function activityTarget(event: LydieEvent): string {
  switch (event.type) {
    case "doc.created":
      return event.data.document.id;
    case "attachment.created":
      return event.data.attachment.id;
    // A thread is activity on its document.
    case "thread.created":
    case "thread.replied":
    case "thread.updated":
    case "thread.resolved":
    case "thread.deleted":
    case "thread.restored":
      return event.data.documentId;
    default:
      return event.data.id;
  }
}

export function activityData(event: LydieEvent, hint: ActivityHint = {}): ActivityData {
  switch (event.type) {
    case "doc.created":
      return { parentId: event.data.document.parentId };
    case "doc.renamed":
      return { previousTitle: event.data.previousTitle, title: event.data.title };
    case "doc.moved":
      return { previousParentId: event.data.previousParentId, parentId: event.data.parentId };
    case "doc.deleted":
      return { count: event.data.deletedIds.length };
    case "doc.restored":
      return { count: event.data.restoredIds.length };
    case "doc.purged":
      return { count: event.data.purgedIds.length };
    case "doc.propertiesChanged":
      return { keys: capKeys(hint.keys ?? []) };
    case "attachment.created":
      return { parentId: event.data.attachment.documentId };
    case "database.changed":
      return { change: event.data.change };
    default:
      return {};
  }
}

export function mergeActivityData(
  type: ActivityType,
  previous: ActivityData,
  next: ActivityData,
): ActivityData {
  // Workspace changes (renames, role and level changes) keep what it was before the first one.
  if (isWorkspaceActivityType(type)) {
    return {
      ...next,
      ...firstOf(previous, next, "previousName"),
      ...firstOf(previous, next, "previousRole"),
      ...firstOf(previous, next, "previousLevel"),
      ...firstOf(previous, next, "previousVisibility"),
    };
  }
  switch (type) {
    case "doc.renamed":
      return { ...next, previousTitle: previous.previousTitle ?? next.previousTitle };
    case "doc.moved":
      return {
        ...next,
        previousParentId:
          previous.previousParentId !== undefined
            ? previous.previousParentId
            : next.previousParentId,
      };
    case "doc.propertiesChanged":
      return { keys: capKeys([...(previous.keys ?? []), ...(next.keys ?? [])]) };
    default:
      return next;
  }
}

export function activityKeyOf(draft: ActivityDraft): ActivityKey {
  return {
    workspaceId: draft.workspaceId,
    actor: actorRef(draft.actor),
    sessionId: draft.sessionId,
    type: draft.type,
    targetId: draft.targetId,
  };
}

// Insert a new row, or merge into `previous` (the newest row with the draft's key) when it is
// recent enough.
export function coalesceActivity(
  previous: Activity | null,
  draft: ActivityDraft,
  newId: () => string,
): ActivityDecision {
  const { at, ...fields } = draft;
  if (previous && sameKey(previous, draft)) {
    const age = Date.parse(at) - Date.parse(previous.lastAt);
    if (age < ACTIVITY_WINDOW_MS) {
      return {
        kind: "update",
        id: previous.id,
        patch: {
          count: previous.count + 1,
          lastAt: at > previous.lastAt ? at : previous.lastAt,
          targetTitle: draft.targetTitle ?? previous.targetTitle,
          data: mergeActivityData(draft.type, previous.data, draft.data),
        },
      };
    }
  }
  return { kind: "insert", row: { id: newId(), ...fields, count: 1, firstAt: at, lastAt: at } };
}

// Writes one event to the log inside the operation's transaction. Without the port it does nothing.
export async function recordActivity(
  tx: DbTx,
  event: LydieEvent,
  hint: ActivityHint | undefined,
  newId: () => string,
): Promise<void> {
  const port = tx.activity;
  if (!port) return;
  const targetId = activityTarget(event);
  const draft: ActivityDraft = {
    workspaceId: event.workspaceId,
    actor: event.actor,
    sessionId: event.sessionId ?? null,
    type: event.type,
    targetId,
    targetTitle: hint?.title ?? (await titleOf(tx, event, targetId)),
    data: activityData(event, hint),
    at: event.at,
  };
  const decision = coalesceActivity(await port.latest(activityKeyOf(draft)), draft, newId);
  if (decision.kind === "insert") await port.insert(decision.row);
  else await port.update(decision.id, decision.patch);
}

async function titleOf(tx: DbTx, event: LydieEvent, targetId: string): Promise<string | null> {
  switch (event.type) {
    case "doc.created":
      return event.data.document.title;
    case "doc.renamed":
      return event.data.title;
    case "attachment.created":
      return event.data.attachment.filename;
    case "attachment.deleted":
    case "attachment.restored":
    case "attachment.purged":
      return (await tx.attachments?.get(targetId))?.filename ?? null;
    default:
      return (await tx.docs.get(targetId))?.title ?? null;
  }
}

function sameKey(row: Activity, draft: ActivityDraft): boolean {
  return (
    row.workspaceId === draft.workspaceId &&
    actorRef(row.actor) === actorRef(draft.actor) &&
    row.sessionId === draft.sessionId &&
    row.type === draft.type &&
    row.targetId === draft.targetId &&
    sameSubject(row.data, draft.data)
  );
}

// Rows about different people, teamspaces or tokens never merge, even with the same target (two
// people given access to one page). Backends whose rows have subjects filter on it in `latest`.
export function activitySubjectOf(data: ActivityData): {
  kind: string | null;
  id: string | null;
  teamspaceId: string | null;
} {
  return {
    kind: data.subject?.kind ?? null,
    id: data.subject?.id ?? null,
    teamspaceId: data.teamspace?.id ?? null,
  };
}

function sameSubject(a: ActivityData, b: ActivityData): boolean {
  const x = activitySubjectOf(a);
  const y = activitySubjectOf(b);
  return x.kind === y.kind && x.id === y.id && x.teamspaceId === y.teamspaceId;
}

function firstOf<
  K extends "previousName" | "previousRole" | "previousLevel" | "previousVisibility",
>(
  previous: ActivityData,
  next: ActivityData,
  key: K,
): Pick<ActivityData, K> | Record<string, never> {
  const value = previous[key] ?? next[key];
  return value === undefined ? {} : ({ [key]: value } as Pick<ActivityData, K>);
}

function capKeys(keys: readonly string[]): string[] {
  return [...new Set(keys)].slice(0, ACTIVITY_KEYS_LIMIT);
}

// Cursors are opaque to callers: the (lastAt, id) of the previous page's last row.
export function encodeActivityCursor(row: { lastAt: string; id: string }): string {
  return btoa(JSON.stringify([row.lastAt, row.id]))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function decodeActivityCursor(cursor: string): { lastAt: string; id: string } {
  try {
    const value: unknown = JSON.parse(atob(cursor.replaceAll("-", "+").replaceAll("_", "/")));
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === "string" &&
      typeof value[1] === "string"
    ) {
      return { lastAt: value[0], id: value[1] };
    }
  } catch {
    // Reported below.
  }
  throw new LydieError("invalid_input", "Invalid activity cursor", {
    hint: "Pass the nextCursor of the previous page unchanged.",
  });
}
