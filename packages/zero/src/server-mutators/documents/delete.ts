import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "../../schema";
import { hasOrganizationAccess } from "../../auth";
import { db } from "@lydie/database";
import { logIntegrationActivity } from "@lydie/core/integrations";
import { mutators as sharedMutators } from "../../mutators";

import { integrationRegistry } from "@lydie/integrations";

export const deleteDocumentMutation = (
  asyncTasks: Array<() => Promise<void>>
) =>
  defineMutator(
    z.object({
      documentId: z.string(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { documentId, organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId);

      // Get document before deletion to check for integration link
      const doc = await tx.run(
        zql.documents
          .where("id", documentId)
          .where("organization_id", organizationId)
          .one()
      );

      if (!doc) {
        throw new Error(`Document not found: ${documentId}`);
      }

      await sharedMutators.document.delete.fn({
        tx,
        ctx,
        args: { documentId, organizationId },
      });

      const isIntegrationDocument = Boolean(
        doc.integration_link_id && doc.external_id
      );

      if (isIntegrationDocument) {
        asyncTasks.push(async () => {
          await deleteFromIntegration(
            documentId,
            doc.external_id!,
            doc.integration_link_id!
          );
        });
      }
    }
  );

async function deleteFromIntegration(
  documentId: string,
  externalId: string,
  integrationLinkId: string
) {
  try {
    // Fetch the integration link with its connection
    const link = await db.query.integrationLinksTable.findFirst({
      where: { id: integrationLinkId },
      with: {
        connection: true,
      },
    });

    if (!link || !link.connection) {
      console.error(
        `[Delete] Integration link not found: ${integrationLinkId}`
      );
      return;
    }

    // Get integration from registry
    const integration = integrationRegistry.get(
      link.connection.integrationType
    );
    if (!integration) {
      console.error(
        `[Delete] Unknown integration type: ${link.connection.integrationType}`
      );
      return;
    }

    // Merge connection config with link config (link config has repo-specific info)
    const mergedConfig = {
      ...(link.connection.config as Record<string, any>),
      ...(link.config as Record<string, any>),
    };

    console.log(
      `[Delete] Deleting document ${documentId} (${externalId}) from ${link.connection.integrationType} link: ${link.name}`
    );

    // Call integration's delete method
    const result = await integration.delete({
      documentId,
      externalId,
      connection: {
        id: link.connection.id,
        integrationType: link.connection.integrationType,
        organizationId: link.connection.organizationId,
        config: mergedConfig,
        createdAt: link.connection.createdAt,
        updatedAt: link.connection.updatedAt,
      },
      commitMessage: `Delete ${externalId} from Lydie`,
    });

    if (result.success) {
      await logIntegrationActivity(
        link.connection.id,
        "delete",
        "success",
        link.connection.integrationType
      );
      console.log(
        `[Delete] Successfully deleted document ${documentId}: ${result.message}`
      );
    } else {
      await logIntegrationActivity(
        link.connection.id,
        "delete",
        "error",
        link.connection.integrationType
      );
      console.error(
        `[Delete] Failed to delete document ${documentId}: ${result.error}`
      );
    }
  } catch (error) {
    // Log but don't throw - delete failure shouldn't block the mutation
    console.error(`[Delete] Error deleting document ${documentId}:`, error);
  }
}
