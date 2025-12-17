import { defineMutators, defineMutator } from "@rocicorp/zero";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { Resource } from "sst";
import { mutators as sharedMutators } from "./mutators";
import { z } from "zod";
import { zql } from "./schema";
import { db } from "@lydie/database";
import { sql } from "drizzle-orm";
import {
  GitHubIntegration,
  ShopifyIntegration,
  WordpressIntegration,
  type BaseIntegration,
} from "@lydie/integrations";
import { logIntegrationActivity } from "@lydie/integrations/activity-log";

const integrationRegistry = new Map<string, BaseIntegration>([
  ["github", new GitHubIntegration()],
  ["shopify", new ShopifyIntegration()],
  ["wordpress", new WordpressIntegration()],
]);

const sqs = new SQSClient();

async function triggerEmbeddingGeneration(
  documentId: string,
  organizationId: string
) {
  // Currently doesn't work in dev as we're not able to link the SQS queue to
  // the dev process.
  if (Resource.App.stage !== "production") return;
  try {
    const queuedAt = Date.now();

    await sqs.send(
      new SendMessageCommand({
        // @ts-ignore
        QueueUrl: Resource.EmbeddingQueue.url,
        MessageBody: JSON.stringify({
          documentId,
          organizationId,
          queuedAt,
        }),
        DelaySeconds: 60, // 5 minutes
      })
    );

    console.log(
      `Queued embedding generation for document ${documentId} (5-minute delay)`
    );
  } catch (error) {
    // Log but don't throw - embedding generation failure shouldn't block the mutation
    console.error("Failed to queue embedding generation:", error);
  }
}

// TODO: should be moved to core or backend
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

    if (!link.enabled || !link.connection.enabled) {
      console.log(
        `[Push] Integration link or connection is disabled, skipping push for ${documentId}`
      );
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
        enabled: link.connection.enabled,
        createdAt: link.connection.createdAt,
        updatedAt: link.connection.updatedAt,
      },
      commitMessage: `Update ${document.title} from Lydie`,
    });

    if (result.success) {
      await logIntegrationActivity(link.connection.id, "push", "success");
      console.log(
        `[Push] Successfully pushed document ${documentId}: ${result.message}`
      );
    } else {
      await logIntegrationActivity(link.connection.id, "push", "error");
      console.error(
        `[Push] Failed to push document ${documentId}: ${result.error}`
      );
    }
  } catch (error) {
    // Log but don't throw - push failure shouldn't block the mutation
    console.error(`[Push] Error pushing document ${documentId}:`, error);
  }
}

export function createServerMutators(asyncTasks: Array<() => Promise<void>>) {
  return defineMutators(sharedMutators, {
    document: {
      // Override the shared mutator definition with same name.
      update: defineMutator(
        z.object({
          documentId: z.string(),
          title: z.string().optional(),
          jsonContent: z.any().optional(),
          published: z.boolean().optional(),
          slug: z.string().optional(),
          indexStatus: z.string().optional(),
        }),
        async ({
          tx,
          ctx,
          args: {
            documentId,
            title,
            jsonContent,
            published,
            slug,
            indexStatus,
          },
        }) => {
          // Run the shared mutator first
          await sharedMutators.document.update.fn({
            tx,
            ctx,
            args: {
              documentId,
              title,
              jsonContent,
              published,
              slug,
              indexStatus,
            },
          });

          // Get the document to check for integration links and trigger async tasks
          const doc = await tx.run(zql.documents.where("id", documentId).one());

          if (doc) {
            // Queue async task to trigger embedding generation if content/title changed
            const shouldTriggerEmbedding =
              title !== undefined || jsonContent !== undefined;

            if (shouldTriggerEmbedding) {
              asyncTasks.push(async () => {
                await triggerEmbeddingGeneration(
                  documentId,
                  doc.organization_id
                );
              });
            }

            // Queue async task to push to integration if document is published and has integration link
            // Always push when publishing, even if already published (enables re-publishing for sync)
            const isPublishing = published === true;
            const shouldPush = isPublishing && doc.integration_link_id;

            if (shouldPush) {
              asyncTasks.push(async () => {
                await pushToIntegration(documentId, doc.integration_link_id);
              });
            }
          }
        }
      ),
    },
  });
}
