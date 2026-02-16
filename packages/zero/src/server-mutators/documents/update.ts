import { processDocumentTitleEmbedding } from "@lydie/core/embedding/title-processing";
import { propagateSlugChange } from "@lydie/core/links";
import { db } from "@lydie/database";
import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";

import { mutators as sharedMutators } from "../../mutators/index";
import { MutatorContext } from "../../server-mutators";

export const updateDocumentMutation = ({ asyncTasks }: MutatorContext) =>
  defineMutator(
    z.object({
      documentId: z.string(),
      title: z.string().optional(),
      slug: z.string().optional(),
      customFields: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
      organizationId: z.string(),
      coverImage: z.string().nullable().optional(),
    }),
    async ({ tx, ctx, args }) => {
      await sharedMutators.document.update.fn({ tx, ctx, args });

      const { documentId, title, slug } = args;

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
          );
        });
      }

      // If slug was updated, propagate the change to all documents that link to this one
      // This updates the href attributes in link marks to reflect the new slug
      if (slug !== undefined) {
        asyncTasks.push(async () => {
          try {
            const result = await propagateSlugChange(documentId, slug, db);
            if (result.updatedCount > 0) {
              console.info(
                `Updated ${result.updatedCount} documents with links to ${documentId} (slug changed to ${slug})`,
              );
            }
            if (result.errors.length > 0) {
              console.error(`Errors during slug propagation for ${documentId}:`, result.errors);
            }
          } catch (error) {
            console.error(`Failed to propagate slug change for document ${documentId}:`, error);
          }
        });
      }
    },
  );
