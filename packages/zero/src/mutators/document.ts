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
      let parentDocument: Awaited<ReturnType<typeof getDocumentById>> | null = null;

      // If creating as a child page, verify parent document belongs to same organization
      if (parentId) {
        parentDocument = await getDocumentById(tx, parentId, organizationId);
        if (!parentDocument) {
          throw notFoundError("Parent document", parentId);
        }

        // Inherit integration link from parent
        if (parentDocument.integration_link_id) {
          finalIntegrationLinkId = parentDocument.integration_link_id;
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
              (min, doc) => {
                const sortOrder = (doc as { sort_order?: number }).sort_order ?? 0;
                return Math.min(min, sortOrder);
              },
              (siblings[0] as { sort_order?: number }).sort_order ?? 0,
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

      // Calculate path based on parent
      let path = id;
      let nearestCollectionId: string | null = null;

      if (parentDocument) {
        const parentPath = parentDocument.path || parentDocument.id;
        path = `${parentPath}/${id}`;
        nearestCollectionId = await getNearestCollectionForChild(tx, parentDocument);
      }

      await tx.mutate.documents.insert(
        withTimestamps({
          id,
          title,
          yjs_state: yjsState,
          user_id: ctx.userId,
          organization_id: organizationId,
          integration_link_id: finalIntegrationLinkId || null,
          is_locked: false,
          full_width: false,
          published: false,
          is_favorited: false,
          parent_id: parentId || null,
          sort_order: minSortOrder - 1,
          path,
          nearest_collection_id: nearestCollectionId,
          show_children_in_sidebar: true,
        }),
      );

      // If this document belongs to a collection, create field values row
      if (nearestCollectionId) {
        await ensureFieldValuesForNearestCollection(tx, id, nearestCollectionId);
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
    }),
    async ({
      tx,
      ctx,
      args: { documentId, title, published, customFields, coverImage, fullWidth, organizationId },
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
      if (customFields !== undefined) updates.custom_fields = customFields;
      if (coverImage !== undefined) updates.cover_image = coverImage;
      if (fullWidth !== undefined) updates.full_width = fullWidth;

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

      // Get new parent info for path and collection calculation
      let newPath = documentId;
      let newNearestCollectionId: string | null = null;

      if (parentId) {
        const parent = await getDocumentById(tx, parentId, organizationId);
        if (parent) {
          const parentPath = parent.path || parent.id;
          newPath = `${parentPath}/${documentId}`;
          newNearestCollectionId = await getNearestCollectionForChild(tx, parent);
        }
      }

      // Update document with new parent, path, and nearest_collection_id
      await tx.mutate.documents.update(
        withUpdatedTimestamp({
          id: documentId,
          parent_id: parentId || null,
          path: newPath,
          nearest_collection_id: newNearestCollectionId,
        }),
      );

      if (newNearestCollectionId) {
        await ensureFieldValuesForNearestCollection(tx, documentId, newNearestCollectionId);
      }

      // Update all descendants' paths and nearest_collection_id
      await updateDescendantPaths(tx, documentId, newPath, newNearestCollectionId, organizationId);
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

      const maxSortOrder = siblings.reduce((max, doc) => {
        const sortOrder = (doc as { sort_order?: number }).sort_order ?? 0;
        return Math.max(max, sortOrder);
      }, 0);
      updates.sort_order = maxSortOrder + 1;

      // Calculate new path and nearest_collection_id
      let newPath = documentId;
      let newNearestCollectionId: string | null = null;

      if (targetParentId) {
        const parent = await getDocumentById(tx, targetParentId, organizationId);
        if (parent) {
          const parentPath = parent.path || parent.id;
          newPath = `${parentPath}/${documentId}`;
          newNearestCollectionId = await getNearestCollectionForChild(tx, parent);
        }
      }

      updates.path = newPath;
      updates.nearest_collection_id = newNearestCollectionId;

      if (targetParentId !== undefined) updates.parent_id = targetParentId;
      if (targetIntegrationLinkId !== undefined)
        updates.integration_link_id = targetIntegrationLinkId;

      await tx.mutate.documents.update(withUpdatedTimestamp(updates));

      if (newNearestCollectionId) {
        await ensureFieldValuesForNearestCollection(tx, documentId, newNearestCollectionId);
      }

      // Update all descendants' paths and nearest_collection_id
      await updateDescendantPaths(tx, documentId, newPath, newNearestCollectionId, organizationId);
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

/**
 * Helper function to update all descendant paths and nearest_collection_id
 */
async function updateDescendantPaths(
  tx: any,
  parentId: string,
  parentPath: string,
  parentNearestCollectionId: string | null,
  organizationId: string,
): Promise<void> {
  const parentIsCollection = await isCollectionDocument(tx, parentId);
  const nearestForChildren = parentIsCollection ? parentId : parentNearestCollectionId;

  const children = await tx.run(
    zql.documents
      .where("parent_id", parentId)
      .where("organization_id", organizationId)
      .where("deleted_at", "IS", null),
  );

  for (const child of children) {
    const newPath = `${parentPath}/${child.id}`;
    const isChildCollection = await isCollectionDocument(tx, child.id);
    const childNearestCollectionId = nearestForChildren;
    const nearestForDescendants = isChildCollection ? child.id : childNearestCollectionId;

    await tx.mutate.documents.update(
      withUpdatedTimestamp({
        id: child.id,
        path: newPath,
        nearest_collection_id: childNearestCollectionId,
      }),
    );

    if (childNearestCollectionId) {
      await ensureFieldValuesForNearestCollection(tx, child.id, childNearestCollectionId);
    }

    // Recursively update this child's descendants
    await updateDescendantPaths(tx, child.id, newPath, nearestForDescendants, organizationId);
  }
}

async function isCollectionDocument(tx: any, documentId: string): Promise<boolean> {
  try {
    const schema = await tx.run(zql.collection_schemas.where("document_id", documentId).one());
    return Boolean(schema);
  } catch {
    return false;
  }
}

async function getNearestCollectionForChild(
  tx: any,
  parent: { id: string; nearest_collection_id: string | null },
): Promise<string | null> {
  const parentIsCollection = await isCollectionDocument(tx, parent.id);
  if (parentIsCollection) {
    return parent.id;
  }

  return parent.nearest_collection_id || null;
}

async function ensureFieldValuesForNearestCollection(
  tx: any,
  documentId: string,
  nearestCollectionId: string,
): Promise<void> {
  let collectionSchema = null;
  try {
    collectionSchema = await tx.run(
      zql.collection_schemas.where("document_id", nearestCollectionId).one(),
    );
  } catch {
    return;
  }

  if (!collectionSchema) {
    return;
  }

  let existingValues = null;
  try {
    existingValues = await tx.run(
      zql.document_field_values
        .where("document_id", documentId)
        .where("collection_schema_id", collectionSchema.id)
        .one(),
    );
  } catch {
    // Row does not exist yet
  }

  if (existingValues) {
    return;
  }

  const properties = collectionSchema.properties as Array<{ name: string }>;
  const nullValues: Record<string, null> = {};
  for (const prop of properties) {
    nullValues[prop.name] = null;
  }

  await tx.mutate.document_field_values.insert(
    withTimestamps({
      id: createId(),
      document_id: documentId,
      collection_schema_id: collectionSchema.id,
      values: nullValues,
      orphaned_values: {},
    }),
  );
}
