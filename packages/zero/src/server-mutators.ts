import { defineMutators, defineMutator } from "@rocicorp/zero";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { Resource } from "sst";
import { mutators as sharedMutators } from "./mutators";
import { z } from "zod";
import { zql } from "./schema";
import { db } from "@lydie/database";
import {
  GitHubExtension,
  type SyncExtension,
  type OAuthExtension,
} from "@lydie/extensions";

// Registry of available extensions for push operations
type Extension = SyncExtension & OAuthExtension;
const extensionRegistry = new Map<string, Extension>([
  ["github", new GitHubExtension()],
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

async function pushToExtension(
  documentId: string,
  extensionLinkId: string | null
) {
  if (!extensionLinkId) {
    return;
  }

  try {
    // Fetch the extension link with its connection
    const link = await db.query.extensionLinksTable.findFirst({
      where: { id: extensionLinkId },
      with: {
        connection: true,
      },
    });

    if (!link || !link.connection) {
      console.error(`[Push] Extension link not found: ${extensionLinkId}`);
      return;
    }

    if (!link.enabled || !link.connection.enabled) {
      console.log(
        `[Push] Extension link or connection is disabled, skipping push for ${documentId}`
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

    // Get extension from registry
    const extension = extensionRegistry.get(link.connection.extensionType);
    if (!extension) {
      console.error(
        `[Push] Unknown extension type: ${link.connection.extensionType}`
      );
      return;
    }

    // Merge connection config with link config (link config has repo-specific info)
    const mergedConfig = {
      ...(link.connection.config as Record<string, any>),
      ...(link.config as Record<string, any>),
    };

    console.log(
      `[Push] Pushing document ${documentId} to ${link.connection.extensionType} link: ${link.name}`
    );

    // Call extension's push method
    const result = await extension.push({
      document: {
        id: document.id,
        title: document.title,
        slug: document.slug,
        content: document.jsonContent,
        published: document.published,
        updatedAt: document.updatedAt,
        organizationId: document.organizationId,
      },
      connection: {
        id: link.connection.id,
        extensionType: link.connection.extensionType,
        organizationId: link.connection.organizationId,
        config: mergedConfig,
        enabled: link.connection.enabled,
        createdAt: link.connection.createdAt,
        updatedAt: link.connection.updatedAt,
      },
      commitMessage: `Update ${document.title} from Lydie`,
    });

    if (result.success) {
      console.log(
        `[Push] Successfully pushed document ${documentId}: ${result.message}`
      );
    } else {
      console.error(
        `[Push] Failed to push document ${documentId}: ${result.error}`
      );
    }
  } catch (error) {
    // Log but don't throw - push failure shouldn't block the mutation
    console.error(`[Push] Error pushing document ${documentId}:`, error);
  }
}

// Instead of defining server mutators as a constant,
// define them as a function of a list of async tasks.
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

          // Get the document to check for extension links and trigger async tasks
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

            // Queue async task to push to extension if document is published and has extension link
            // Always push when publishing, even if already published (enables re-publishing for sync)
            const isPublishing = published === true;
            const shouldPush = isPublishing && doc.extension_link_id;

            if (shouldPush) {
              asyncTasks.push(async () => {
                await pushToExtension(documentId, doc.extension_link_id);
              });
            }
          }
        }
      ),
    },
  });
}
