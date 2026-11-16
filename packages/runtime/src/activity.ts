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
  const [draft] = await activityDrafts(tx, [{ event, hint }]);
  if (draft) await writeActivity(tx, [draft], newId);
}

// The drafts of some events, with the titles of their targets as they are now (after the
// handler): titles the events or hints do not carry are read in one round trip.
export async function activityDrafts(
  tx: DbTx,
  items: readonly { event: LydieEvent; hint: ActivityHint | undefined }[],
): Promise<ActivityDraft[]> {
  if (!tx.activity || items.length === 0) return [];
  const known = items.map(({ event, hint }) => hint?.title ?? knownTitle(event));
  const docIds = new Set<string>();
  const attachmentIds = new Set<string>();
  items.forEach(({ event }, i) => {
    if (known[i] !== undefined) return;
    (isAttachmentEvent(event) ? attachmentIds : docIds).add(activityTarget(event));
  });
  const titles = new Map<string, string>();
  if (docIds.size > 0) {
    const docs = tx.docs.getMany
      ? await tx.docs.getMany([...docIds])
      : await Promise.all([...docIds].map((id) => tx.docs.get(id)));
    for (const d of docs) if (d) titles.set(d.id, d.title);
  }
  for (const id of attachmentIds) {
    const filename = (await tx.attachments?.get(id))?.filename;
    if (filename !== undefined) titles.set(id, filename);
  }
  return items.map(({ event, hint }, i) => {
    const targetId = activityTarget(event);
    return {
      workspaceId: event.workspaceId,
      actor: event.actor,
      sessionId: event.sessionId ?? null,
      type: event.type,
      targetId,
      targetTitle: known[i] ?? titles.get(targetId) ?? null,
      data: activityData(event, hint),
      at: event.at,
    };
  });
}

// Coalesces drafts, in order, into the log: each one merges into the newest row with its key,
// which may be one an earlier draft wrote, exactly as writing them one at a time would. The reads
// and writes go in as few round trips as the port allows.
export async function writeActivity(
  tx: DbTx,
  drafts: readonly ActivityDraft[],
  newId: () => string,
): Promise<void> {
  const port = tx.activity;
  if (!port || drafts.length === 0) return;
  const keyed = drafts.map((draft) => ({ draft, key: activityKeyOf(draft) }));
  const distinct = new Map(keyed.map((k) => [keyString(k.key), k.key]));
  const current = new Map<string, Activity | null>();
  if (port.latestMany && distinct.size > 1) {
    for (const row of await port.latestMany([...distinct.values()])) {
      current.set(keyString({ ...row, actor: actorRef(row.actor) }), row);
    }
  } else {
    for (const [k, key] of distinct) current.set(k, await port.latest(key));
  }
  const inserts = new Map<string, Activity>();
  const updates = new Map<string, ActivityPatch>();
  for (const { draft, key } of keyed) {
    const k = keyString(key);
    const previous = current.get(k) ?? null;
    const decision = coalesceActivity(previous, draft, newId);
    if (decision.kind === "insert") {
      inserts.set(decision.row.id, decision.row);
      current.set(k, decision.row);
      continue;
    }
    const merged = { ...previous!, ...decision.patch };
    current.set(k, merged);
    // A row inserted by an earlier draft is inserted as it ends up.
    if (inserts.has(decision.id)) inserts.set(decision.id, merged);
    else updates.set(decision.id, decision.patch);
  }
  const rows = [...inserts.values()];
  if (port.insertMany && rows.length > 1) await port.insertMany(rows);
  else for (const row of rows) await port.insert(row);
  const patches = [...updates].map(([id, patch]) => ({ id, patch }));
  if (port.updateMany && patches.length > 1) await port.updateMany(patches);
  else for (const { id, patch } of patches) await port.update(id, patch);
}

const keyString = (key: ActivityKey) =>
  JSON.stringify([key.workspaceId, key.actor, key.sessionId, key.type, key.targetId]);

function isAttachmentEvent(event: LydieEvent): boolean {
  return (
    event.type === "attachment.deleted" ||
    event.type === "attachment.restored" ||
    event.type === "attachment.purged"
  );
}

// The title an event carries; undefined when it has to be read.
function knownTitle(event: LydieEvent): string | undefined {
  switch (event.type) {
    case "doc.created":
      return event.data.document.title;
    case "doc.renamed":
      return event.data.title;
    case "attachment.created":
      return event.data.attachment.filename;
    default:
      return undefined;
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
