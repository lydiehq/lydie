import { z } from "zod"
import { defineMutator } from "@rocicorp/zero"
import { mutators as sharedMutators } from "../../mutators"
import { db } from "@lydie/database"
import { processDocumentTitleEmbedding } from "@lydie/core/embedding/title-processing"
import { MutatorContext } from "../../server-mutators"

export const updateDocumentMutation = ({ asyncTasks }: MutatorContext) =>
  defineMutator(
    z.object({
      documentId: z.string(),
      title: z.string().optional(),
      slug: z.string().optional(),
      indexStatus: z.string().optional(),
      customFields: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { documentId, title, slug, indexStatus, customFields, organizationId } }) => {
      await sharedMutators.document.update.fn({
        tx,
        ctx,
        args: {
          documentId,
          organizationId,
          title,
          slug,
          indexStatus,
          customFields,
        },
      })

      // If title was updated, trigger async title embedding generation
      // Skip if title is empty or too short (minimum 3 chars for meaningful embeddings)
      if (title !== undefined && title.trim().length >= 3) {
        asyncTasks.push(async () => {
          await processDocumentTitleEmbedding(
            {
              documentId,
              title: title.trim(),
            },
            db,
          )
        })
      }
    },
  )
