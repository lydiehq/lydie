import { createId } from "@lydie/core/id";
import { db, collectionFieldsTable, collectionsTable, documentsTable } from "@lydie/database";
import { tool } from "ai";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

const fieldValuesSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]),
);

export const updateCollectionEntry = (_userId: string, organizationId: string) =>
  tool({
    description: `Update collection field values for a document entry.

This mutation is applied immediately.`,
    inputSchema: z.object({
      collectionId: z.string().describe("Collection ID"),
      documentId: z.string().describe("Document ID for the collection entry"),
      values: fieldValuesSchema.describe("Field values to set or update"),
    }),
    execute: async function* ({ collectionId, documentId, values }) {
      yield {
        state: "updating",
        message: "Updating collection entry...",
      };

      const [collection, document] = await Promise.all([
        db
          .select({ id: collectionsTable.id })
          .from(collectionsTable)
          .where(
            and(
              eq(collectionsTable.id, collectionId),
              eq(collectionsTable.organizationId, organizationId),
              isNull(collectionsTable.deletedAt),
            ),
          )
          .limit(1),
        db
          .select({ id: documentsTable.id, collectionId: documentsTable.collectionId })
          .from(documentsTable)
          .where(
            and(
              eq(documentsTable.id, documentId),
              eq(documentsTable.organizationId, organizationId),
              isNull(documentsTable.deletedAt),
            ),
          )
          .limit(1),
      ]);

      if (!collection[0]) {
        yield {
          state: "error",
          error: "Collection not found",
        };
        return;
      }

      const targetDocument = document[0];
      if (!targetDocument) {
        yield {
          state: "error",
          error: "Document not found",
        };
        return;
      }

      if (targetDocument.collectionId !== collectionId) {
        yield {
          state: "error",
          error: "Document is not an entry in this collection",
        };
        return;
      }

      const [existing] = await db
        .select({ id: collectionFieldsTable.id, values: collectionFieldsTable.values })
        .from(collectionFieldsTable)
        .where(
          and(
            eq(collectionFieldsTable.collectionId, collectionId),
            eq(collectionFieldsTable.documentId, documentId),
          ),
        )
        .limit(1);

      if (existing) {
        const nextValues = {
          ...((existing.values as Record<string, unknown>) ?? {}),
          ...values,
        };

        await db
          .update(collectionFieldsTable)
          .set({
            values: nextValues,
            updatedAt: new Date(),
          })
          .where(eq(collectionFieldsTable.id, existing.id));

        yield {
          state: "success",
          message: "Updated collection entry successfully.",
          entry: {
            documentId,
            collectionId,
            values: nextValues,
          },
        };
        return;
      }

      await db.insert(collectionFieldsTable).values({
        id: createId(),
        documentId,
        collectionId,
        values,
        orphanedValues: {},
      });

      yield {
        state: "success",
        message: "Updated collection entry successfully.",
        entry: {
          documentId,
          collectionId,
          values,
        },
      };
    },
  });
