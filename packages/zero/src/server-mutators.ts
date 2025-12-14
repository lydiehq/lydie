import { defineMutators, defineMutator } from "@rocicorp/zero";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { Resource } from "sst";
import { mutators as sharedMutators } from "./mutators";
import { z } from "zod";
import { zql } from "./schema";

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

          // Queue async task to trigger embedding generation if content/title changed
          const shouldTriggerEmbedding =
            title !== undefined || jsonContent !== undefined;

          if (shouldTriggerEmbedding) {
            const doc = await tx.run(
              zql.documents.where("id", documentId).one()
            );

            if (doc) {
              asyncTasks.push(async () => {
                await triggerEmbeddingGeneration(
                  documentId,
                  doc.organization_id
                );
              });
            }
          }
        }
      ),
    },
  });
}
