import { assembleThreads, describeQuote, findQuote, LydieError, sameAuthor } from "@lydie/contract";
import type { Operations, Thread, ThreadAnchor, ThreadRow } from "@lydie/contract";

import type { DbRead, ThreadsRead } from "../ports.ts";
import type { Handlers, MutationContext } from "../runtime.ts";
import { requireDoc, requireLive, unsupported } from "./doc.ts";

function threadsOf(tx: DbRead): ThreadsRead {
  return tx.threads ?? unsupported("Threads");
}

async function requireRow(tx: DbRead, id: string): Promise<ThreadRow> {
  const row = await threadsOf(tx).get(id);
  if (!row) throw new LydieError("not_found", `Thread ${id} not found`);
  return row;
}

async function requireLiveRow(tx: DbRead, id: string): Promise<ThreadRow> {
  const row = await requireRow(tx, id);
  if (row.deletedAt) {
    throw new LydieError("not_found", `Thread ${id} is deleted`, {
      hint: "Restore it with thread.restore first.",
    });
  }
  return row;
}

// A thread itself, not one of its replies.
async function requireThread(tx: DbRead, id: string): Promise<ThreadRow> {
  const row = await requireLiveRow(tx, id);
  if (row.parentId !== null) {
    throw new LydieError("invalid_input", `${id} is a reply`, {
      hint: `Use its thread instead: ${row.parentId}.`,
    });
  }
  return row;
}

// A document's open threads, for `doc.get`. Empty on a backend without threads.
export async function openThreads(tx: DbRead, documentId: string): Promise<Thread[]> {
  if (!tx.threads) return [];
  return assembleThreads(await tx.threads.list(documentId)).filter((t) => t.resolvedAt === null);
}

async function threadOf(tx: DbRead, root: ThreadRow): Promise<Thread> {
  const rows = await threadsOf(tx).list(root.documentId, { includeDeleted: true });
  const thread = assembleThreads(rows).find((t) => t.id === root.id);
  if (!thread) throw new LydieError("not_found", `Thread ${root.id} not found`);
  return thread;
}

// The anchor to store for a quote as a caller gave it: the passage as it stands in the document's
// text. The quote may be Markdown as an agent read it (`**bold** text`) or the text as shown.
async function anchorFor(
  ctx: MutationContext,
  documentId: string,
  selector: { quote: string; prefix?: string | undefined; suffix?: string | undefined },
): Promise<ThreadAnchor> {
  const body = await ctx.tx.bodies.get(documentId);
  const text = ctx.extract(body?.markdown ?? "").text;
  const plain = ctx.extract(selector.quote).text;
  const range =
    findQuote(text, selector) ?? (plain ? findQuote(text, { ...selector, quote: plain }) : null);
  if (!range) {
    throw new LydieError("invalid_input", "quote was not found in the document", {
      hint:
        "Nothing was written. Quote a passage exactly as it appears in the document (within " +
        "one paragraph is safest), or leave quote out to attach the thread to the page.",
    });
  }
  return describeQuote(text, range);
}

export const threadHandlers: Handlers<Operations> = {
  async "thread.create"(ctx, input) {
    const threads = ctx.tx.threads ?? unsupported("Threads");
    const id = input.id ?? ctx.ids.uuid();
    if (await threads.get(id)) throw new LydieError("conflict", `Thread ${id} already exists`);
    const doc = await requireLive(ctx.tx, input.documentId);
    const selector = input.quote
      ? { quote: input.quote, prefix: input.prefix ?? "", suffix: input.suffix ?? "" }
      : null;
    const anchor = selector && !input.exact ? await anchorFor(ctx, doc.id, selector) : selector;
    const row: ThreadRow = {
      id,
      workspaceId: doc.workspaceId,
      documentId: doc.id,
      parentId: null,
      kind: input.kind,
      anchor,
      body: input.body,
      resolvedAt: null,
      resolvedBy: null,
      sessionId: ctx.sessionId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      deletedAt: null,
      createdBy: ctx.actorRef,
      updatedBy: ctx.actorRef,
    };
    await threads.insert(row);
    // The anchor is pinned so a replay stores the same one, whatever the body is by then.
    ctx.pin(anchor ? { id, ...anchor, exact: true } : { id });
    ctx.inverse("thread.delete", { id });
    const thread = assembleThreads([row])[0]!;
    ctx.emit("thread.created", row.workspaceId, { id, documentId: doc.id, thread });
    return thread;
  },

  async "thread.reply"(ctx, input) {
    const threads = ctx.tx.threads ?? unsupported("Threads");
    const id = input.id ?? ctx.ids.uuid();
    if (await threads.get(id)) throw new LydieError("conflict", `Thread ${id} already exists`);
    const root = await requireThread(ctx.tx, input.threadId);
    await requireLive(ctx.tx, root.documentId);
    await threads.insert({
      id,
      workspaceId: root.workspaceId,
      documentId: root.documentId,
      parentId: root.id,
      kind: null,
      anchor: null,
      body: input.body,
      resolvedAt: null,
      resolvedBy: null,
      sessionId: ctx.sessionId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      deletedAt: null,
      createdBy: ctx.actorRef,
      updatedBy: ctx.actorRef,
    });
    ctx.pin({ id });
    ctx.inverse("thread.delete", { id });
    ctx.emit("thread.replied", root.workspaceId, {
      id: root.id,
      documentId: root.documentId,
      messageId: id,
    });
    return threadOf(ctx.tx, root);
  },

  async "thread.edit"(ctx, input) {
    const row = await requireLiveRow(ctx.tx, input.id);
    const root = row.parentId ? await requireRow(ctx.tx, row.parentId) : row;
    if (!sameAuthor(row.createdBy, ctx.actorRef)) {
      throw new LydieError("forbidden", "Only its author can edit this");
    }
    if (row.body !== input.body) {
      await ctx.tx.threads!.update(row.id, {
        body: input.body,
        updatedAt: ctx.now,
        updatedBy: ctx.actorRef,
      });
      ctx.inverse("thread.edit", { id: row.id, body: row.body });
      ctx.emit("thread.updated", row.workspaceId, {
        id: root.id,
        documentId: row.documentId,
        messageId: row.id,
      });
    }
    return threadOf(ctx.tx, root);
  },

  async "thread.setAnchor"(ctx, input) {
    const row = await requireThread(ctx.tx, input.id);
    if (JSON.stringify(row.anchor) !== JSON.stringify(input.anchor)) {
      await ctx.tx.threads!.update(row.id, { anchor: input.anchor, updatedAt: ctx.now });
      ctx.inverse("thread.setAnchor", { id: row.id, anchor: row.anchor });
      ctx.emit("thread.updated", row.workspaceId, {
        id: row.id,
        documentId: row.documentId,
        messageId: row.id,
      });
    }
    return threadOf(ctx.tx, row);
  },

  async "thread.resolve"(ctx, input) {
    const row = await requireThread(ctx.tx, input.id);
    if ((row.resolvedAt !== null) !== input.resolved) {
      await ctx.tx.threads!.update(row.id, {
        resolvedAt: input.resolved ? ctx.now : null,
        resolvedBy: input.resolved ? ctx.actorRef : null,
        updatedAt: ctx.now,
        updatedBy: ctx.actorRef,
      });
      ctx.inverse("thread.resolve", { id: row.id, resolved: !input.resolved });
      ctx.emit("thread.resolved", row.workspaceId, {
        id: row.id,
        documentId: row.documentId,
        resolved: input.resolved,
      });
    }
    return threadOf(ctx.tx, row);
  },

  async "thread.delete"(ctx, input) {
    const row = await requireRow(ctx.tx, input.id);
    const threadId = row.parentId ?? row.id;
    if (!row.deletedAt) {
      await ctx.tx.threads!.update(row.id, {
        deletedAt: ctx.now,
        updatedAt: ctx.now,
        updatedBy: ctx.actorRef,
      });
      ctx.inverse("thread.restore", { id: row.id });
      ctx.emit("thread.deleted", row.workspaceId, {
        id: threadId,
        documentId: row.documentId,
        messageId: row.id,
      });
    }
    return { id: row.id, threadId };
  },

  async "thread.restore"(ctx, input) {
    const row = await requireRow(ctx.tx, input.id);
    const threadId = row.parentId ?? row.id;
    if (row.deletedAt) {
      await ctx.tx.threads!.update(row.id, {
        deletedAt: null,
        updatedAt: ctx.now,
        updatedBy: ctx.actorRef,
      });
      ctx.inverse("thread.delete", { id: row.id });
      ctx.emit("thread.restored", row.workspaceId, {
        id: threadId,
        documentId: row.documentId,
        messageId: row.id,
      });
    }
    return { id: row.id, threadId };
  },

  async "thread.list"(ctx, input) {
    const threads = threadsOf(ctx.tx);
    await requireDoc(ctx.tx, input.documentId);
    const all = assembleThreads(await threads.list(input.documentId));
    return {
      threads: all.filter(
        (t) =>
          (input.state === "all" || (t.resolvedAt === null) === (input.state === "open")) &&
          (!input.kind || t.kind === input.kind),
      ),
    };
  },
};
