import { createId } from "@lydie/core/id";
import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess } from "../auth";
import { zql } from "../schema";
import { verifyDocumentAccess } from "../utils/documents";
import { withTimestamps } from "../utils/timestamps";

export const documentVersionMutators = {
  create: defineMutator(
    z.object({
      documentId: z.string(),
      organizationId: z.string(),
      title: z.string(),
      yjsState: z.string(),
      changeDescription: z.string().optional(),
    }),
    async ({
      tx,
      ctx,
      args: { documentId, organizationId, title, yjsState, changeDescription },
    }) => {
      hasOrganizationAccess(ctx, organizationId);
      await verifyDocumentAccess(tx, documentId, organizationId);

      const existingVersions = await tx.run(
        zql.document_versions
          .where("document_id", documentId)
          .orderBy("version_number", "desc")
          .limit(1),
      );

      const nextVersionNumber = existingVersions.length > 0 
        ? (existingVersions[0]?.version_number ?? 0) + 1 
        : 1;

      await tx.mutate.document_versions.insert(
        withTimestamps({
          id: createId(),
          document_id: documentId,
          user_id: ctx.userId,
          title,
          yjs_state: yjsState,
          version_number: nextVersionNumber,
          change_description: changeDescription || null,
        }),
      );
    },
  ),

  delete: defineMutator(
    z.object({
      versionId: z.string(),
      documentId: z.string(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { versionId, documentId, organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId);
      await verifyDocumentAccess(tx, documentId, organizationId);

      // Verify the version belongs to this document
      const version = await tx.run(
        zql.document_versions
          .where("id", versionId)
          .where("document_id", documentId)
          .one(),
      );

      if (!version) {
        throw new Error("Version not found");
      }

      await tx.mutate.document_versions.delete({
        id: versionId,
      });
    },
  ),

  restore: defineMutator(
    z.object({
      versionId: z.string(),
      documentId: z.string(),
      organizationId: z.string(),
      changeDescription: z.string().optional(),
    }),
    async ({
      tx,
      ctx,
      args: { versionId, documentId, organizationId, changeDescription },
    }) => {
      hasOrganizationAccess(ctx, organizationId);
      await verifyDocumentAccess(tx, documentId, organizationId);

      const version = await tx.run(
        zql.document_versions
          .where("id", versionId)
          .where("document_id", documentId)
          .one(),
      );

      if (!version) {
        throw new Error("Version not found");
      }

      // Get current document state before restoring (to save as a backup version)
      const currentDocument = await tx.run(
        zql.documents.where("id", documentId).one(),
      );

      if (!currentDocument) {
        throw new Error("Document not found");
      }

      // Create a backup version of current state (if there are unsaved changes)
      const existingVersions = await tx.run(
        zql.document_versions
          .where("document_id", documentId)
          .orderBy("version_number", "desc")
          .limit(1),
      );

      const nextVersionNumber = existingVersions.length > 0 
        ? (existingVersions[0]?.version_number ?? 0) + 1 
        : 1;

      if (currentDocument.yjs_state) {
        await tx.mutate.document_versions.insert(
          withTimestamps({
            id: createId(),
            document_id: documentId,
            user_id: ctx.userId,
            title: currentDocument.title,
            yjs_state: currentDocument.yjs_state,
            version_number: nextVersionNumber,
            change_description: "Auto-saved before restore",
          }),
        );
      }

      await tx.mutate.documents.update({
        id: documentId,
        title: version.title,
        yjs_state: version.yjs_state,
        updated_at: Date.now(),
      });

      const finalVersionNumber = nextVersionNumber + 1;
      await tx.mutate.document_versions.insert(
        withTimestamps({
          id: createId(),
          document_id: documentId,
          user_id: ctx.userId,
          title: version.title,
          yjs_state: version.yjs_state,
          version_number: finalVersionNumber,
          change_description: changeDescription || `Restored to version ${version.version_number}`,
        }),
      );
    },
  ),
};
