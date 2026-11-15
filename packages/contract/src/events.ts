import { z } from "zod";

import {
  Actor,
  Attachment,
  Document,
  Properties,
  SortKey,
  Timestamp,
  Uuid,
  WorkspaceId,
} from "./entities.ts";
import { Thread } from "./thread.ts";

// Event payloads, keyed by event type. Operations declare which ones they emit (`emits`).
export const eventData = {
  "doc.created": z.object({ document: Document }),
  "doc.renamed": z.object({ id: Uuid, title: z.string(), previousTitle: z.string() }),
  "doc.moved": z.object({
    id: Uuid,
    parentId: Uuid.nullable(),
    sortKey: SortKey,
    previousParentId: Uuid.nullable(),
  }),
  "doc.deleted": z.object({ id: Uuid, deletedIds: z.array(Uuid) }),
  "doc.restored": z.object({ id: Uuid, restoredIds: z.array(Uuid) }),
  "doc.propertiesChanged": z.object({ id: Uuid, properties: Properties }),
  "doc.bodyUpdated": z.object({ id: Uuid, version: z.string() }),
  "doc.purged": z.object({ id: Uuid, purgedIds: z.array(Uuid) }),
  "attachment.created": z.object({ attachment: Attachment }),
  "attachment.deleted": z.object({ id: Uuid }),
  "attachment.restored": z.object({ id: Uuid }),
  "attachment.purged": z.object({ id: Uuid, sha256: z.string(), bytesRemoved: z.boolean() }),
  // A database's settings, schema or views changed (the file bridge rewrites its .base file).
  "database.changed": z.object({
    id: Uuid.describe("The database (document) id."),
    change: z.enum(["database", "properties", "views", "options"]),
  }),
  // `id` is always the thread; `messageId` is the thread or the reply that changed.
  "thread.created": z.object({ id: Uuid, documentId: Uuid, thread: Thread }),
  "thread.replied": z.object({ id: Uuid, documentId: Uuid, messageId: Uuid }),
  "thread.updated": z.object({ id: Uuid, documentId: Uuid, messageId: Uuid }),
  "thread.resolved": z.object({ id: Uuid, documentId: Uuid, resolved: z.boolean() }),
  "thread.deleted": z.object({ id: Uuid, documentId: Uuid, messageId: Uuid }),
  "thread.restored": z.object({ id: Uuid, documentId: Uuid, messageId: Uuid }),
} as const;

export type EventType = keyof typeof eventData;
export const EVENT_TYPES = Object.keys(eventData) as EventType[];

export type EventDataOf<T extends EventType> = z.infer<(typeof eventData)[T]>;

const envelope = {
  id: Uuid,
  workspaceId: WorkspaceId,
  at: Timestamp,
  actor: Actor,
  // The operation log entry that caused this event.
  operationId: Uuid,
  // The agent session (MCP connection, CLI run) that caused it, if any.
  sessionId: z.string().nullable().optional(),
};

function event<T extends EventType>(type: T) {
  return z.object({ ...envelope, type: z.literal(type), data: eventData[type] });
}

export const LydieEvent = z
  .discriminatedUnion("type", [
    event("doc.created"),
    event("doc.renamed"),
    event("doc.moved"),
    event("doc.deleted"),
    event("doc.restored"),
    event("doc.propertiesChanged"),
    event("doc.bodyUpdated"),
    event("doc.purged"),
    event("attachment.created"),
    event("attachment.deleted"),
    event("attachment.restored"),
    event("attachment.purged"),
    event("database.changed"),
    event("thread.created"),
    event("thread.replied"),
    event("thread.updated"),
    event("thread.resolved"),
    event("thread.deleted"),
    event("thread.restored"),
  ])
  .meta({ id: "Event" });
export type LydieEvent = z.infer<typeof LydieEvent>;
