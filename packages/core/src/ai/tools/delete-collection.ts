import { collectionViewUsagesTable, db, collectionsTable } from "@lydie/database";
import { tool } from "ai";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

export const deleteCollection = (_userId: string, organizationId: string) =>
  tool({
    description: `Delete (soft-delete) a collection by ID.

This mutation is applied immediately.`,
    inputSchema: z.object({
      collectionId: z.string().describe("Collection ID to delete"),
    }),
    execute: async function* ({ collectionId }) {
      yield {
        state: "deleting",
        message: "Deleting collection...",
      };

      const [existing] = await db
        .select({ id: collectionsTable.id, name: collectionsTable.name })
        .from(collectionsTable)
        .where(
          and(
            eq(collectionsTable.id, collectionId),
            eq(collectionsTable.organizationId, organizationId),
            isNull(collectionsTable.deletedAt),
          ),
        )
        .limit(1);

      if (!existing) {
        yield {
          state: "error",
          error: "Collection not found",
        };
        return;
      }

      const activeUsages = await db
        .select({ id: collectionViewUsagesTable.id })
        .from(collectionViewUsagesTable)
        .where(
          and(
            eq(collectionViewUsagesTable.organizationId, organizationId),
            eq(collectionViewUsagesTable.collectionId, collectionId),
          ),
        );

      if (activeUsages.length > 0) {
        yield {
          state: "error",
          error: `Collection is referenced by ${activeUsages.length} view block${activeUsages.length === 1 ? "" : "s"}`,
        };
        return;
      }

      await db
        .update(collectionsTable)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(collectionsTable.id, collectionId),
            eq(collectionsTable.organizationId, organizationId),
            isNull(collectionsTable.deletedAt),
          ),
        );

      yield {
        state: "success",
        message: `Deleted collection "${existing.name}" successfully.`,
        collectionId,
      };
    },
  });
