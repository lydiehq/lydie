import { z } from "zod";
import { defineMutator } from "@rocicorp/zero";
import { mutators as sharedMutators } from "../../mutators";
import { db } from "@lydie/database";
import {
  documentsTable,
  documentEmbeddingsTable,
  documentTitleEmbeddingsTable,
} from "@lydie/database/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { createId } from "@lydie/core/id";
import { demoContentEmbeddings } from "../../demo-content-embeddings";
import { MutatorContext } from "../../server-mutators";

export const createOrganizationMutation = ({ asyncTasks }: MutatorContext) =>
  defineMutator(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      logo: z.string().optional(),
      metadata: z.string().optional(),
      importDemoContent: z.boolean().optional(),
    }),
    async ({
      tx,
      ctx,
      args: { id, name, slug, logo, metadata, importDemoContent },
    }) => {
      // Call the shared mutator first to create the organization and demo content
      await sharedMutators.organization.create.fn({
        tx,
        ctx,
        args: { id, name, slug, logo, metadata, importDemoContent },
      });

      // If demo content was imported, insert pre-computed embeddings after transaction
      if (importDemoContent !== false) {
        asyncTasks.push(async () => {
          try {
            // Find all demo content documents (marked with isOnboarding in custom_fields)
            const demoDocuments = await db
              .select({
                id: documentsTable.id,
                title: documentsTable.title,
              })
              .from(documentsTable)
              .where(
                and(
                  eq(documentsTable.organizationId, id),
                  isNull(documentsTable.deletedAt),
                  sql`${documentsTable.customFields}->>'isOnboarding' = 'true'`
                )
              );

            // Insert pre-computed embeddings for each demo document
            for (const doc of demoDocuments) {
              const embeddings = demoContentEmbeddings[doc.title];

              if (embeddings) {
                // Insert content embeddings
                if (embeddings.contentEmbeddings.length > 0) {
                  await db.insert(documentEmbeddingsTable).values(
                    embeddings.contentEmbeddings.map((e) => ({
                      id: createId(),
                      content: e.content,
                      embedding: e.embedding,
                      documentId: doc.id,
                      chunkIndex: e.chunkIndex,
                      heading: e.heading,
                      headingLevel: e.headingLevel,
                      headerBreadcrumb: e.headerBreadcrumb,
                    }))
                  );
                }

                // Insert title embedding
                await db.insert(documentTitleEmbeddingsTable).values({
                  id: createId(),
                  documentId: doc.id,
                  title: doc.title,
                  embedding: embeddings.titleEmbedding,
                });

                // Update document index status to indexed
                await db
                  .update(documentsTable)
                  .set({
                    indexStatus: "indexed",
                    updatedAt: new Date(),
                  })
                  .where(eq(documentsTable.id, doc.id));
              } else {
                console.warn(
                  `No pre-computed embeddings found for demo document: ${doc.title}`
                );
              }
            }
          } catch (error) {
            console.error(
              `Failed to insert pre-computed embeddings for demo content in organization ${id}:`,
              error
            );
          }
        });
      }
    }
  );
