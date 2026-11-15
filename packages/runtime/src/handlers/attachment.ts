import { LydieError } from "@lydie/contract";
import type { Attachment, Operations } from "@lydie/contract";

import type { AttachmentsRead, DbRead } from "../ports.ts";
import type { Handlers } from "../runtime.ts";
import { purgeAttachmentRow, requireLive, unsupported } from "./doc.ts";

function attachmentsOf(tx: DbRead): AttachmentsRead {
  return tx.attachments ?? unsupported("Attachments");
}

async function requireAttachment(tx: DbRead, id: string): Promise<Attachment> {
  const row = await attachmentsOf(tx).get(id);
  if (!row) throw new LydieError("not_found", `Attachment ${id} not found`);
  return row;
}

export const attachmentHandlers: Handlers<Operations> = {
  async "attachment.create"(ctx, input) {
    const attachments = ctx.tx.attachments ?? unsupported("Attachments");
    const id = input.id ?? ctx.ids.uuid();
    if (await attachments.get(id)) {
      throw new LydieError("conflict", `Attachment ${id} already exists`);
    }
    if (input.documentId) {
      const doc = await requireLive(ctx.tx, input.documentId);
      if (doc.workspaceId !== input.workspaceId) {
        throw new LydieError("invalid_input", `Document ${doc.id} is in another workspace`);
      }
    }
    const row: Attachment = {
      id,
      workspaceId: input.workspaceId,
      documentId: input.documentId,
      filename: input.filename,
      contentType: input.contentType,
      size: input.size,
      sha256: input.sha256,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      deletedAt: null,
      createdBy: ctx.actorRef,
      updatedBy: ctx.actorRef,
    };
    await attachments.insert(row);
    ctx.pin({ id });
    ctx.inverse("attachment.delete", { id });
    ctx.emit("attachment.created", row.workspaceId, { attachment: row });
    return row;
  },

  async "attachment.delete"(ctx, input) {
    const row = await requireAttachment(ctx.tx, input.id);
    if (row.deletedAt) return row;
    const patch = { deletedAt: ctx.now, updatedAt: ctx.now, updatedBy: ctx.actorRef };
    await ctx.tx.attachments!.update(row.id, patch);
    ctx.inverse("attachment.restore", { id: row.id });
    ctx.emit("attachment.deleted", row.workspaceId, { id: row.id });
    return { ...row, ...patch };
  },

  async "attachment.restore"(ctx, input) {
    const row = await requireAttachment(ctx.tx, input.id);
    if (!row.deletedAt) return row;
    const patch = { deletedAt: null, updatedAt: ctx.now, updatedBy: ctx.actorRef };
    await ctx.tx.attachments!.update(row.id, patch);
    ctx.inverse("attachment.delete", { id: row.id });
    ctx.emit("attachment.restored", row.workspaceId, { id: row.id });
    return { ...row, ...patch };
  },

  async "attachment.purge"(ctx, input) {
    const row = await attachmentsOf(ctx.tx).get(input.id);
    if (!row) return { purgedIds: [] };
    if (!row.deletedAt) {
      throw new LydieError("invalid_input", `Attachment ${row.id} is not in the trash`, {
        hint: "Delete it with attachment.delete first.",
      });
    }
    await purgeAttachmentRow(ctx, row.id);
    return { purgedIds: [row.id] };
  },

  async "attachment.get"(ctx, input) {
    return requireAttachment(ctx.tx, input.id);
  },

  async "attachment.list"(ctx, input) {
    const attachments = await attachmentsOf(ctx.tx).list(input.workspaceId, {
      includeDeleted: input.includeDeleted,
      ...(input.documentId ? { documentId: input.documentId } : {}),
    });
    return { attachments };
  },
};
