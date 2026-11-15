import type { Operations, TrashItem } from "@lydie/contract";

import type { Handlers } from "../runtime.ts";
import { purgeAttachmentRow, purgeDocuments, unsupported } from "./doc.ts";

export const trashHandlers: Handlers<Operations> = {
  async "trash.list"(ctx, input) {
    if (!ctx.tx.docs.trashed) unsupported("The trash");
    const items: TrashItem[] = (await ctx.tx.docs.trashed(input.workspaceId)).map((d) => ({
      kind: "document",
      id: d.id,
      workspaceId: d.workspaceId,
      title: d.title,
      parentId: d.parentId,
      deletedAt: d.deletedAt!,
      deletedBy: d.updatedBy ?? null,
      descendantCount: d.descendantCount,
    }));
    for (const a of (await ctx.tx.attachments?.list(input.workspaceId, { includeDeleted: true })) ??
      []) {
      if (!a.deletedAt) continue;
      items.push({
        kind: "attachment",
        id: a.id,
        workspaceId: a.workspaceId,
        title: a.filename,
        parentId: a.documentId,
        deletedAt: a.deletedAt,
        deletedBy: a.updatedBy ?? null,
        descendantCount: 0,
      });
    }
    items.sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : a.deletedAt > b.deletedAt ? -1 : 0));
    return { items: items.slice(0, input.limit) };
  },

  async "trash.empty"(ctx, input) {
    if (!ctx.tx.docs.trashed) unsupported("The trash");
    const purgedIds: string[] = [];
    for (const root of await ctx.tx.docs.trashed(input.workspaceId)) {
      // A root may already be gone with an earlier one's subtree.
      if (!(await ctx.tx.docs.get(root.id))) continue;
      const { docIds, attachmentIds } = await purgeDocuments(ctx, root);
      purgedIds.push(...docIds, ...attachmentIds);
    }
    for (const a of (await ctx.tx.attachments?.list(input.workspaceId, { includeDeleted: true })) ??
      []) {
      if (!a.deletedAt) continue;
      await purgeAttachmentRow(ctx, a.id);
      purgedIds.push(a.id);
    }
    return { purgedIds };
  },
};
