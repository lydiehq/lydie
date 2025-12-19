import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "../../schema";
import { hasOrganizationAccess } from "../../auth";
import { db } from "@lydie/database";
import { sql } from "drizzle-orm";
import { logIntegrationActivity } from "@lydie/core/integrations";
import { mutators as sharedMutators } from "../../mutators";

import { integrationRegistry } from "@lydie/integrations";

export const publishDocumentMutation = (
  asyncTasks: Array<() => Promise<void>>
) =>
  defineMutator(
    z.object({
      documentId: z.string(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { documentId, organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId);
      await sharedMutators.document.publish.fn({
        tx,
        ctx,
        args: { documentId, organizationId },
      });

      const doc = await tx.run(
        zql.documents
          .where("id", documentId)
          .where("organization_id", organizationId)
          .one()
      );

      if (!doc) {
        throw new Error(`Document not found: ${documentId}`);
      }

      // TODO: document versioning here

      const shouldPush = doc.integration_link_id;

      if (shouldPush) {
        asyncTasks.push(async () => {
          await pushToIntegration(documentId, doc.integration_link_id);
        });
      }
    }
  );

async function pushToIntegration(
  documentId: string,
  integrationLinkId: string | null
) {
  if (!integrationLinkId) {
    return;
  }

  try {
    // Fetch the integration link with its connection
    const link = await db.query.integrationLinksTable.findFirst({
      where: { id: integrationLinkId },
      with: {
        connection: true,
      },
    });

    if (!link || !link.connection) {
      console.error(`[Push] Integration link not found: ${integrationLinkId}`);
      return;
    }

    // Get the document
    const document = await db.query.documentsTable.findFirst({
      where: { id: documentId },
    });

    if (!document) {
      console.error(`[Push] Document not found: ${documentId}`);
      return;
    }

    // Only push if document is published
    if (!document.published) {
      console.log(
        `[Push] Document ${documentId} is not published, skipping push`
      );
      return;
    }

    // Get folder path if document has a folderId
    let folderPath: string | null | undefined = undefined;
    if (document.folderId) {
      try {
        // Query folder path using recursive CTE
        const folderPathQuery = await db.execute(
          sql`WITH RECURSIVE folder_paths AS (
            SELECT id, name, parent_id, '/' || name || '/' as path, 1 as level
            FROM folders 
            WHERE parent_id IS NULL AND deleted_at IS NULL
            UNION ALL
            SELECT f.id, f.name, f.parent_id, fp.path || f.name || '/' as path, fp.level + 1 as level
            FROM folders f
            INNER JOIN folder_paths fp ON f.parent_id = fp.id
            WHERE f.deleted_at IS NULL
          )
          SELECT RTRIM(path, '/') as path
          FROM folder_paths
          WHERE id = ${document.folderId}
          LIMIT 1`
        );
        const pathResult = folderPathQuery[0] as { path?: string } | undefined;
        if (pathResult?.path) {
          // Remove leading slash and convert to folder path format (e.g., "docs/guides")
          folderPath = pathResult.path.replace(/^\/+|\/+$/g, "") || null;
        }
      } catch (error) {
        console.error(
          `[Push] Failed to get folder path for document ${documentId}:`,
          error
        );

        // Continue without folder path
      }
    }

    // Get integration from registry
    const integration = integrationRegistry.get(
      link.connection.integrationType
    );
    if (!integration) {
      console.error(
        `[Push] Unknown integration type: ${link.connection.integrationType}`
      );
      return;
    }

    // Merge connection config with link config (link config has repo-specific info)
    const mergedConfig = {
      ...(link.connection.config as Record<string, any>),
      ...(link.config as Record<string, any>),
    };

    console.log(
      `[Push] Pushing document ${documentId} to ${link.connection.integrationType} link: ${link.name}`
    );

    // Call integration's push method
    const result = await integration.push({
      document: {
        id: document.id,
        title: document.title,
        slug: document.slug,
        content: document.jsonContent,
        published: document.published,
        updatedAt: document.updatedAt,
        organizationId: document.organizationId,
        folderId: document.folderId,
        folderPath: folderPath,
      },
      connection: {
        id: link.connection.id,
        integrationType: link.connection.integrationType,
        organizationId: link.connection.organizationId,
        config: mergedConfig,
        createdAt: link.connection.createdAt,
        updatedAt: link.connection.updatedAt,
      },
      commitMessage: `Update ${document.title} from Lydie`,
    });

    if (result.success) {
      await logIntegrationActivity(
        link.connection.id,
        "push",
        "success",
        link.connection.integrationType
      );
      console.log(
        `[Push] Successfully pushed document ${documentId}: ${result.message}`
      );
    } else {
      await logIntegrationActivity(
        link.connection.id,
        "push",
        "error",
        link.connection.integrationType
      );
      console.error(
        `[Push] Failed to push document ${documentId}: ${result.error}`
      );
    }
  } catch (error) {
    // Log but don't throw - push failure shouldn't block the mutation
    console.error(`[Push] Error pushing document ${documentId}:`, error);
  }
}
