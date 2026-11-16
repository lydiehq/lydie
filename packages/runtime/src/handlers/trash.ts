import type { Operations, TrashItem } from "@lydie/contract";

import type { Handlers } from "../runtime.ts";
import { purgeAttachmentRow, purgeDocuments, unsupported } from "./doc.ts";

export const trashHandlers: Handlers<Operations> = {
  async "trash.list"(ctx, input) {
    if (!ctx.tx.docs.trashed) unsupported("The trash");
    // The newest `limit` items are at most that many documents, newest first.
    const trashed = await ctx.tx.docs.trashed(input.workspaceId, { limit: input.limit });
    const items: TrashItem[] = trashed.map((d) => ({
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
    const purged = new Set<string>();
    // Listed once: each root takes the attachments of its subtree, the trashed rest go last.
    const attachments =
      (await ctx.tx.attachments?.list(input.workspaceId, { includeDeleted: true })) ?? [];
    for (const root of await ctx.tx.docs.trashed(input.workspaceId)) {
      // A root may already be gone with an earlier one's subtree.
      if (purged.has(root.id)) continue;
      const left = attachments.filter((a) => !purged.has(a.id));
      const { docIds, attachmentIds } = await purgeDocuments(ctx, root, left);
      for (const id of [...docIds, ...attachmentIds]) purged.add(id);
      purgedIds.push(...docIds, ...attachmentIds);
    }
    for (const a of attachments) {
      if (!a.deletedAt || purged.has(a.id)) continue;
      await purgeAttachmentRow(ctx, a.id);
      purgedIds.push(a.id);
    }
    return { purgedIds };
  },
};
