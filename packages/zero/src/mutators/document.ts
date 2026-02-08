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

export const documentMutators = {
  publish: defineMutator(
    z.object({
      documentId: z.string(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { documentId, organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId);
      await verifyDocumentAccess(tx, documentId, organizationId);

      await tx.mutate.documents.update({
        id: documentId,
        published: true,
      });

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

      // Set published to false (publication history is preserved)
      await tx.mutate.documents.update({
        id: documentId,
        published: false,
      });
    },
  ),

  create: defineMutator(
    z.object({
      id: z.string(),
      organizationId: z.string(),
      title: z.string().optional(),
      parentId: z.string().optional(),
      integrationLinkId: z.string().optional(),
      content: z.string().optional(),
    }),
    async ({
      tx,
      ctx,
      args: { id, organizationId, title = "", parentId, integrationLinkId, content },
    }) => {
      hasOrganizationAccess(ctx, organizationId);

      let finalIntegrationLinkId = integrationLinkId;

      // If creating as a child page, verify parent document belongs to same organization
      if (parentId) {
        const parent = await getDocumentById(tx, parentId, organizationId);
        if (!parent) {
          throw notFoundError("Parent document", parentId);
        }

        // Inherit integration link from parent
        if (parent.integration_link_id) {
          finalIntegrationLinkId = parent.integration_link_id;
        }
      }

      // Get the lowest sort_order at this level to prepend new document at the top
      const siblings = await tx.run(
        zql.documents
          .where("organization_id", organizationId)
          .where("parent_id", parentId ? "=" : "IS", parentId || null)
          .where("deleted_at", "IS", null),
      );

      const minSortOrder =
        siblings.length > 0
          ? siblings.reduce(
              (min, doc) => Math.min(min, doc.sort_order ?? 0),
              siblings[0]?.sort_order ?? 0,
            )
          : 0;

      // Prepare content
      let yjsState;
      if (content) {
        try {
          const jsonContent = deserializeFromHTML(content);
          yjsState = convertJsonToYjs(jsonContent);
        } catch (contentError: any) {
          console.error("Failed to parse content:", contentError);
          // Create document with empty content if parsing fails
          const emptyContent = { type: "doc", content: [] };
          yjsState = convertJsonToYjs(emptyContent);
        }
      } else {
        // Create empty Yjs state for new document
        const emptyContent = { type: "doc", content: [] };
        yjsState = convertJsonToYjs(emptyContent);
      }

      await tx.mutate.documents.insert(
        withTimestamps({
          id,
          slug: id,
          title,
          yjs_state: yjsState,
          user_id: ctx.userId,
          organization_id: organizationId,
          integration_link_id: finalIntegrationLinkId || null,
          is_locked: false,
          published: false,
          is_favorited: false,
          parent_id: parentId || null,
          sort_order: minSortOrder - 1,
        }),
      );
    },
  ),
  update: defineMutator(
    z.object({
      documentId: z.string(),
      title: z.string().optional(),
      published: z.boolean().optional(),
      slug: z.string().optional(),
      customFields: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
      coverImage: z.string().nullable().optional(),
      organizationId: z.string(),
    }),
    async ({
      tx,
      ctx,
      args: { documentId, title, published, slug, customFields, coverImage, organizationId },
    }) => {
      hasOrganizationAccess(ctx, organizationId);

      // Verify document belongs to the organization
      const document = await verifyDocumentAccess(tx, documentId, organizationId);

      // Block title updates for locked pages
      if (document.is_locked && title !== undefined) {
        throw new Error("Cannot edit locked document. This page is managed by an integration.");
      }

      const updates: any = {
        id: documentId,
      };

      if (title !== undefined) updates.title = title;
      if (published !== undefined) updates.published = published;
      if (slug !== undefined) updates.slug = slug;
      if (customFields !== undefined) updates.custom_fields = customFields;
      if (coverImage !== undefined) updates.cover_image = coverImage;

      await tx.mutate.documents.update(withUpdatedTimestamp(updates));
    },
  ),

  rename: defineMutator(
    z.object({
      documentId: z.string(),
      title: z.string(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { documentId, title, organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId);

      // Verify document belongs to the organization
      const document = await verifyDocumentAccess(tx, documentId, organizationId);

      // Block rename for locked pages
      if (document.is_locked) {
        throw new Error("Cannot rename locked document. This page is managed by an integration.");
      }

      await tx.mutate.documents.update(
        withUpdatedTimestamp({
          id: documentId,
          title,
        }),
      );
    },
  ),

  moveToParent: defineMutator(
    z.object({
      documentId: z.string(),
      parentId: z.string().optional(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { documentId, parentId, organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId);

      // Verify document belongs to the organization
      await verifyDocumentAccess(tx, documentId, organizationId);

      // If moving to a parent document, verify parent belongs to same organization
      // and check for circular references
      if (parentId) {
        if (parentId === documentId) {
          throw new Error("Cannot move document into itself");
        }

        const parent = await getDocumentById(tx, parentId, organizationId);
        if (!parent) {
          throw notFoundError("Parent document", parentId);
        }

        // Check for circular reference - ensure parent is not a descendant of this document
        let currentParentId: string | null = parent.parent_id;
        while (currentParentId) {
          if (currentParentId === documentId) {
            throw new Error("Cannot move document into its own descendant");
          }
          const currentParent = await getDocumentById(tx, currentParentId, organizationId);
          if (!currentParent) break;
          currentParentId = currentParent.parent_id;
        }
      }

      await tx.mutate.documents.update(
        withUpdatedTimestamp({
          id: documentId,
          parent_id: parentId || null,
        }),
      );
    },
  ),

  reorder: defineMutator(
    z.object({
      documentIds: z.array(z.string()),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { documentIds, organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId);

      // Verify all documents belong to the organization
      const documents = await Promise.all(
        documentIds.map((id) => getDocumentById(tx, id, organizationId)),
      );

      // Check if any documents are missing
      for (let i = 0; i < documentIds.length; i++) {
        if (!documents[i]) {
          console.error(`Document not found: ${documentIds[i]}`);
          continue;
        }
      }

      // Update sort_order for each document based on array position
      await Promise.all(
        documentIds.map((id, index) =>
          tx.mutate.documents.update(
            withUpdatedTimestamp({
              id,
              sort_order: index,
            }),
          ),
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
    }),
    async ({
      tx,
      ctx,
      args: { documentId, targetParentId, targetIntegrationLinkId, organizationId },
    }) => {
      hasOrganizationAccess(ctx, organizationId);

      const updates: any = {
        id: documentId,
      };

      let parentIdQuery = targetParentId || null;
      let integrationLinkIdQuery = targetIntegrationLinkId || null;

      const siblings = await tx.run(
        zql.documents
          .where("organization_id", organizationId)
          .where("parent_id", parentIdQuery ? "=" : "IS", parentIdQuery)
          .where("integration_link_id", integrationLinkIdQuery ? "=" : "IS", integrationLinkIdQuery)
          .where("deleted_at", "IS", null),
      );

      const maxSortOrder = siblings.reduce((max, doc) => Math.max(max, doc.sort_order ?? 0), 0);
      updates.sort_order = maxSortOrder + 1;

      if (targetParentId !== undefined) updates.parent_id = targetParentId;
      if (targetIntegrationLinkId !== undefined)
        updates.integration_link_id = targetIntegrationLinkId;

      await tx.mutate.documents.update(withUpdatedTimestamp(updates));
    },
  ),

  delete: defineMutator(
    z.object({
      documentId: z.string(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { documentId, organizationId } }) => {
      isAuthenticated(ctx);

      const document = await getDocumentById(tx, documentId, organizationId, true);
      if (!document) {
        throw notFoundError("Document", documentId);
      }

      // Recursively find all child documents (including nested children)
      const childIds = await findAllChildDocuments(tx, documentId, organizationId);

      // Soft-delete by setting deleted_at
      const isIntegrationDocument = Boolean(document.integration_link_id && document.external_id);

      const now = Date.now();

      // If document is part of an integration, delete it completely from Lydie on delete
      if (isIntegrationDocument) {
        // For integration documents, hard delete all children first
        for (const childId of childIds) {
          await tx.mutate.documents.delete({
            id: childId,
          });
        }
        await tx.mutate.documents.delete({
          id: documentId,
        });
      } else {
        // For regular documents, soft-delete all children first
        for (const childId of childIds) {
          await tx.mutate.documents.update(
            withUpdatedTimestamp({
              id: childId,
              deleted_at: now,
            }),
          );
        }
        // Then soft-delete the parent
        await tx.mutate.documents.update(
          withUpdatedTimestamp({
            id: documentId,
            deleted_at: now,
          }),
        );
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
        withUpdatedTimestamp({
          id: documentId,
          is_favorited: isFavorited,
        }),
      );
    },
  ),

  restore: defineMutator(
    z.object({
      documentId: z.string(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { documentId, organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId);

      // Get the document (including deleted ones)
      const document = await getDocumentById(tx, documentId, organizationId, true);
      if (!document) {
        throw notFoundError("Document", documentId);
      }

      // Check if document is actually deleted
      if (!document.deleted_at) {
        throw new Error("Document is not in trash");
      }

      // Find all deleted child documents recursively
      const childIds = await findAllDeletedChildDocuments(tx, documentId, organizationId);

      // Restore all children first (clear deleted_at)
      for (const childId of childIds) {
        await tx.mutate.documents.update(
          withUpdatedTimestamp({
            id: childId,
            deleted_at: null,
          }),
        );
      }

      // Then restore the parent
      await tx.mutate.documents.update(
        withUpdatedTimestamp({
          id: documentId,
          deleted_at: null,
        }),
      );
    },
  ),
};
