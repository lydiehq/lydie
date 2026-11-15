import { z } from "zod";

import { ActorRef, parseActorRef, Timestamp, Uuid, WorkspaceId } from "./entities.ts";

// Threads: what people and agents say about a document without putting it in the body. A note is
// context that stays (why the text says this, what it was checked against); a comment expects an
// answer. Both are anchored to the page or to a quoted passage, and neither is ever published.

export const ThreadKind = z.enum(["note", "comment"]).meta({
  id: "ThreadKind",
  description:
    "note: context for the next reader, kept quietly beside the text. comment: expects an answer.",
});
export type ThreadKind = z.infer<typeof ThreadKind>;

export const ThreadBody = z.string().trim().min(1).max(20_000);

// Where in the document a thread belongs: the passage itself and the text around it, never a
// position (see `findQuote`). All three are the document's text as a reader sees it.
export const ThreadAnchor = z
  .object({
    quote: z.string().min(1).max(4000),
    prefix: z.string().max(200).default(""),
    suffix: z.string().max(200).default(""),
  })
  .meta({ id: "ThreadAnchor" });
export type ThreadAnchor = z.infer<typeof ThreadAnchor>;

export const ThreadReply = z
  .object({
    id: Uuid,
    body: z.string().describe("Markdown."),
    createdAt: Timestamp,
    updatedAt: Timestamp,
    createdBy: ActorRef.nullable(),
  })
  .meta({ id: "ThreadReply" });
export type ThreadReply = z.infer<typeof ThreadReply>;

export const Thread = z
  .object({
    id: Uuid,
    workspaceId: WorkspaceId,
    documentId: Uuid,
    kind: ThreadKind,
    anchor: ThreadAnchor.nullable().describe("null: about the page as a whole."),
    body: z.string().describe("Markdown."),
    replies: z.array(ThreadReply).describe("Oldest first."),
    resolvedAt: Timestamp.nullable(),
    resolvedBy: ActorRef.nullable(),
    sessionId: z
      .string()
      .nullable()
      .describe("The agent session (MCP connection, CLI run) that started it, if any."),
    createdAt: Timestamp,
    updatedAt: Timestamp,
    deletedAt: Timestamp.nullable(),
    createdBy: ActorRef.nullable(),
    updatedBy: ActorRef.nullable(),
  })
  .meta({ id: "Thread" });
export type Thread = z.infer<typeof Thread>;

// How threads are stored: one row per thread and per reply (`parentId` set). `kind` and `anchor`
// belong to the thread.
export type ThreadRow = {
  id: string;
  workspaceId: string;
  documentId: string;
  parentId: string | null;
  kind: ThreadKind | null;
  anchor: ThreadAnchor | null;
  body: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
};

// The threads in a document's rows, each with its live replies, in the rows' order (oldest first).
export function assembleThreads(rows: readonly ThreadRow[]): Thread[] {
  const threads = new Map<string, Thread>();
  for (const row of rows) {
    if (row.parentId !== null) continue;
    threads.set(row.id, {
      id: row.id,
      workspaceId: row.workspaceId,
      documentId: row.documentId,
      kind: row.kind ?? "comment",
      anchor: row.anchor,
      body: row.body,
      replies: [],
      resolvedAt: row.resolvedAt,
      resolvedBy: row.resolvedBy,
      sessionId: row.sessionId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    });
  }
  for (const row of rows) {
    if (row.parentId === null || row.deletedAt) continue;
    threads.get(row.parentId)?.replies.push({
      id: row.id,
      body: row.body,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy,
    });
  }
  return [...threads.values()];
}

// Whether two actor refs are the same author. An agent writes for a person, so the two count as
// one: the person can edit what their agent wrote, and the agent what its person wrote.
export function sameAuthor(
  a: ActorRef | null | undefined,
  b: ActorRef | null | undefined,
): boolean {
  if (!a || !b) return false;
  return personOf(a) === personOf(b);
}

function personOf(ref: ActorRef): string {
  const actor = parseActorRef(ref);
  return actor.type === "agent" ? actor.onBehalfOf : ref;
}
