import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { Resource } from "sst";
import { z } from "zod";
import { zql } from "../../schema";
import { defineMutator } from "@rocicorp/zero";
import { mutators as sharedMutators } from "../../mutators";

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

export const updateDocumentMutation = (
  asyncTasks: Array<() => Promise<void>>
) =>
  defineMutator(
    z.object({
      documentId: z.string(),
      title: z.string().optional(),
      slug: z.string().optional(),
      indexStatus: z.string().optional(),
      organizationId: z.string(),
    }),
    async ({
      tx,
      ctx,
      args: {
        documentId,
        title,
        slug,
        indexStatus,
        organizationId,
      },
    }) => {
      // Run the shared mutator first
      await sharedMutators.document.update.fn({
        tx,
        ctx,
        args: {
          documentId,
          organizationId,
          title,
          slug,
          indexStatus,
        },
      });

      // Get the document to check for integration links and trigger async tasks
      const doc = await tx.run(zql.documents.where("id", documentId).one());

      if (doc) {
        // Queue async task to trigger embedding generation if title changed
        // Content changes are handled by Yjs sync
        if (title !== undefined) {
          asyncTasks.push(async () => {
            await triggerEmbeddingGeneration(documentId, doc.organization_id);
          });
        }
      }
    }
  );
