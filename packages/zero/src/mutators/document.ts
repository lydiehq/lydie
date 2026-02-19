import { createId } from "@lydie/core/id";
import { deserializeFromHTML } from "@lydie/core/serialization/html";
import { convertJsonToYjs } from "@lydie/core/yjs-to-json";
import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess, isAuthenticated } from "../auth";
import { zql } from "../schema";
import {
  findAllChildDocuments,
  findAllDeletedChildDocuments,
  getDocumentById,
  verifyDocumentAccess,
} from "../utils/documents";
import { notFoundError } from "../utils/errors";
import { withTimestamps, withUpdatedTimestamp } from "../utils/timestamps";

async function maybeOne<T>(query: Promise<T>): Promise<T | null> {
  try {
    return await query;
  } catch {
    return null;
  }
}

async function ensureCollectionFieldRow(tx: any, documentId: string, collectionId: string) {
  const existing = await maybeOne(
    tx.run(
      zql.collection_fields
        .where("document_id", documentId)
        .where("collection_id", collectionId)
        .one(),
    ),
  );

  if (existing) {
    return;
  }

  await tx.mutate.collection_fields.insert(
    withTimestamps({
      id: createId(),
      document_id: documentId,
      collection_id: collectionId,
      values: {},
      orphaned_values: {},
    }),
  );
}

export const documentMutators = {
  publish: defineMutator(
    z.object({
      documentId: z.string(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { documentId, organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId);
      await verifyDocumentAccess(tx, documentId, organizationId);

      await tx.mutate.documents.update({ id: documentId, published: true });
      await tx.mutate.document_publications.insert(
        withTimestamps({
          id: createId(),
          document_id: documentId,
          organization_id: organizationId,
        }),
      );
    },
  ),

  unpublish: defineMutator(
    z.object({
      documentId: z.string(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { documentId, organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId);
      await verifyDocumentAccess(tx, documentId, organizationId);

      await tx.mutate.documents.update({ id: documentId, published: false });
    },
  ),

  create: defineMutator(
    z.object({
      id: z.string(),
      organizationId: z.string(),
      title: z.string().optional(),
      parentId: z.string().optional(),
      collectionId: z.string().optional(),
      integrationLinkId: z.string().optional(),
      content: z.string().optional(),
    }),
    async ({ tx, ctx, args }) => {
      hasOrganizationAccess(ctx, args.organizationId);

      let finalIntegrationLinkId = args.integrationLinkId;

      if (args.parentId) {
        const parentDocument = await getDocumentById(tx, args.parentId, args.organizationId);
        if (!parentDocument) {
          throw notFoundError("Parent document", args.parentId);
        }
        if (parentDocument.integration_link_id) {
          finalIntegrationLinkId = parentDocument.integration_link_id;
        }
      }

      const siblings = await tx.run(
        zql.documents
          .where("organization_id", args.organizationId)
          .where("parent_id", args.parentId ? "=" : "IS", args.parentId || null)
          .where("deleted_at", "IS", null),
      );

      const minSortOrder =
        siblings.length > 0
          ? siblings.reduce(
              (min, doc) => {
                const sortOrder = (doc as { sort_order?: number }).sort_order ?? 0;
                return Math.min(min, sortOrder);
              },
              (siblings[0] as { sort_order?: number }).sort_order ?? 0,
            )
          : 0;

      let yjsState;
      if (args.content) {
        try {
          yjsState = convertJsonToYjs(deserializeFromHTML(args.content));
        } catch {
          yjsState = convertJsonToYjs({ type: "doc", content: [] });
        }
      } else {
        yjsState = convertJsonToYjs({ type: "doc", content: [] });
      }

      await tx.mutate.documents.insert(
        withTimestamps({
          id: args.id,
          title: args.title || "",
          yjs_state: yjsState,
          user_id: ctx.userId,
          organization_id: args.organizationId,
          integration_link_id: finalIntegrationLinkId || null,
          full_width: false,
          published: false,
          is_favorited: false,
          parent_id: args.parentId || null,
          sort_order: minSortOrder - 1,
          collection_id: args.collectionId || null,
        }),
      );

      if (args.collectionId) {
        await ensureCollectionFieldRow(tx, args.id, args.collectionId);
      }
    },
  ),

  update: defineMutator(
    z.object({
      documentId: z.string(),
      title: z.string().optional(),
      published: z.boolean().optional(),
      customFields: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
      coverImage: z.string().nullable().optional(),
      fullWidth: z.boolean().optional(),
      organizationId: z.string(),
      collectionId: z.string().nullable().optional(),
    }),
    async ({ tx, ctx, args }) => {
      hasOrganizationAccess(ctx, args.organizationId);
      await verifyDocumentAccess(tx, args.documentId, args.organizationId);

      const updates: any = { id: args.documentId };
      if (args.title !== undefined) updates.title = args.title;
      if (args.published !== undefined) updates.published = args.published;
      if (args.customFields !== undefined) updates.custom_fields = args.customFields;
      if (args.coverImage !== undefined) updates.cover_image = args.coverImage;
      if (args.fullWidth !== undefined) updates.full_width = args.fullWidth;
      if (args.collectionId !== undefined) updates.collection_id = args.collectionId;

      await tx.mutate.documents.update(withUpdatedTimestamp(updates));

      if (args.collectionId) {
        await ensureCollectionFieldRow(tx, args.documentId, args.collectionId);
      }
    },
  ),

  rename: defineMutator(
    z.object({ documentId: z.string(), title: z.string(), organizationId: z.string() }),
    async ({ tx, ctx, args: { documentId, title, organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId);
      await verifyDocumentAccess(tx, documentId, organizationId);

      await tx.mutate.documents.update(withUpdatedTimestamp({ id: documentId, title }));
    },
  ),

  moveToParent: defineMutator(
    z.object({
      documentId: z.string(),
      parentId: z.string().optional(),
      organizationId: z.string(),
      collectionId: z.string().nullable().optional(),
    }),
    async ({ tx, ctx, args }) => {
      hasOrganizationAccess(ctx, args.organizationId);
      await verifyDocumentAccess(tx, args.documentId, args.organizationId);

      if (args.parentId) {
        if (args.parentId === args.documentId) {
          throw new Error("Cannot move document into itself");
        }

        const parent = await getDocumentById(tx, args.parentId, args.organizationId);
        if (!parent) {
          throw notFoundError("Parent document", args.parentId);
        }

        let currentParentId: string | null = parent.parent_id;
        while (currentParentId) {
          if (currentParentId === args.documentId) {
            throw new Error("Cannot move document into its own descendant");
          }
          const currentParent = await getDocumentById(tx, currentParentId, args.organizationId);
          if (!currentParent) break;
          currentParentId = currentParent.parent_id;
        }
      }

      const updates: any = {
        id: args.documentId,
        parent_id: args.parentId || null,
      };
      if (args.collectionId !== undefined) {
        updates.collection_id = args.collectionId;
      }

      await tx.mutate.documents.update(withUpdatedTimestamp(updates));

      if (args.collectionId) {
        await ensureCollectionFieldRow(tx, args.documentId, args.collectionId);
      }
    },
  ),

  reorder: defineMutator(
    z.object({
      documentIds: z.array(z.string()),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { documentIds, organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId);

      await Promise.all(
        documentIds.map((id, index) =>
          tx.mutate.documents.update(withUpdatedTimestamp({ id, sort_order: index })),
        ),
      );
    },
  ),

  move: defineMutator(
    z.object({
      documentId: z.string(),
      targetParentId: z.string().optional().nullable(),
      targetIntegrationLinkId: z.string().optional().nullable(),
      organizationId: z.string(),
      collectionId: z.string().nullable().optional(),
    }),
    async ({ tx, ctx, args }) => {
      hasOrganizationAccess(ctx, args.organizationId);

      const siblings = await tx.run(
        zql.documents
          .where("organization_id", args.organizationId)
          .where("parent_id", args.targetParentId ? "=" : "IS", args.targetParentId || null)
          .where(
            "integration_link_id",
            args.targetIntegrationLinkId ? "=" : "IS",
            args.targetIntegrationLinkId || null,
          )
          .where("deleted_at", "IS", null),
      );

      const maxSortOrder = siblings.reduce((max, doc) => {
        const sortOrder = (doc as { sort_order?: number }).sort_order ?? 0;
        return Math.max(max, sortOrder);
      }, 0);

      const updates: any = {
        id: args.documentId,
        sort_order: maxSortOrder + 1,
      };

      if (args.targetParentId !== undefined) updates.parent_id = args.targetParentId;
      if (args.targetIntegrationLinkId !== undefined) {
        updates.integration_link_id = args.targetIntegrationLinkId;
      }
      if (args.collectionId !== undefined) {
        updates.collection_id = args.collectionId;
      }

      await tx.mutate.documents.update(withUpdatedTimestamp(updates));

      if (args.collectionId) {
        await ensureCollectionFieldRow(tx, args.documentId, args.collectionId);
      }
    },
  ),

  delete: defineMutator(
    z.object({ documentId: z.string(), organizationId: z.string() }),
    async ({ tx, ctx, args: { documentId, organizationId } }) => {
      isAuthenticated(ctx);
      const document = await getDocumentById(tx, documentId, organizationId, true);
      if (!document) {
        throw notFoundError("Document", documentId);
      }
      await deleteDocumentTree(tx, document, organizationId);
    },
  ),

  bulkDelete: defineMutator(
    z.object({ documentIds: z.array(z.string()).min(1), organizationId: z.string() }),
    async ({ tx, ctx, args: { documentIds, organizationId } }) => {
      isAuthenticated(ctx);

      const selectedIdSet = new Set(documentIds);
      const selectedDocuments = await Promise.all(
        documentIds.map((documentId) => getDocumentById(tx, documentId, organizationId, true)),
      );

      const validDocuments = selectedDocuments.filter(
        (document): document is NonNullable<(typeof selectedDocuments)[number]> =>
          Boolean(document),
      );
      if (validDocuments.length !== documentIds.length) {
        throw notFoundError("Document", "one or more selected IDs");
      }

      const rootDocuments = validDocuments.filter(
        (document) => !document.parent_id || !selectedIdSet.has(document.parent_id),
      );

      for (const document of rootDocuments) {
        await deleteDocumentTree(tx, document, organizationId);
      }
    },
  ),

  toggleFavorite: defineMutator(
    z.object({
      documentId: z.string(),
      organizationId: z.string(),
      isFavorited: z.boolean(),
    }),
    async ({ tx, ctx, args: { documentId, organizationId, isFavorited } }) => {
      hasOrganizationAccess(ctx, organizationId);
      await verifyDocumentAccess(tx, documentId, organizationId);

      await tx.mutate.documents.update(
        withUpdatedTimestamp({ id: documentId, is_favorited: isFavorited }),
      );
    },
  ),

  restore: defineMutator(
    z.object({ documentId: z.string(), organizationId: z.string() }),
    async ({ tx, ctx, args: { documentId, organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId);

      const document = await getDocumentById(tx, documentId, organizationId, true);
      if (!document) {
        throw notFoundError("Document", documentId);
      }
      if (!document.deleted_at) {
        throw new Error("Document is not in trash");
      }

      const childIds = await findAllDeletedChildDocuments(tx, documentId, organizationId);

      for (const childId of childIds) {
        await tx.mutate.documents.update(withUpdatedTimestamp({ id: childId, deleted_at: null }));
      }

      await tx.mutate.documents.update(
        withUpdatedTimestamp({ id: documentId, deleted_at: null }),
      );
    },
  ),
};

async function deleteDocumentTree(
  tx: any,
  document: {
    id: string;
    integration_link_id: string | null;
    external_id: string | null;
  },
  organizationId: string,
): Promise<void> {
  const childIds = await findAllChildDocuments(tx, document.id, organizationId);
  const isIntegrationDocument = Boolean(document.integration_link_id && document.external_id);
  const now = Date.now();

  if (isIntegrationDocument) {
    for (const childId of childIds) {
      await tx.mutate.documents.delete({ id: childId });
    }

    await tx.mutate.documents.delete({ id: document.id });
    return;
  }

  for (const childId of childIds) {
    await tx.mutate.documents.update(withUpdatedTimestamp({ id: childId, deleted_at: now }));
  }

  await tx.mutate.documents.update(withUpdatedTimestamp({ id: document.id, deleted_at: now }));
}
