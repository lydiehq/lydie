import { db, collectionFieldsTable, collectionsTable, documentsTable } from "@lydie/database";
import { tool } from "ai";
import { and, eq, ilike, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

export const readCollection = (_userId: string, organizationId: string) =>
  tool({
    description: `Read a collection by ID or name, including schema and optional entries.

Use this after reading a document that contains a collection view block so you can inspect the referenced collection by ID.`,
    inputSchema: z.object({
      collectionId: z.string().describe("Collection ID to read").optional(),
      collectionName: z
        .string()
        .describe("Collection name to search for when ID is not provided")
        .optional(),
      includeEntries: z
        .boolean()
        .describe("Include collection entry documents and field values")
        .default(true),
      limit: z
        .number()
        .describe("Maximum number of entries to return when includeEntries is true")
        .min(1)
        .max(100)
        .default(20),
    }),
    execute: async function* ({ collectionId, collectionName, includeEntries = true, limit = 20 }) {
      if (!collectionId && !collectionName) {
        yield {
          state: "error",
          error: "Either collectionId or collectionName must be provided",
        };
        return;
      }

      yield {
        state: "loading",
        message: collectionId
          ? "Loading collection..."
          : `Searching for collection "${collectionName}"...`,
      };

      const conditions = [
        eq(collectionsTable.organizationId, organizationId),
        isNull(collectionsTable.deletedAt),
      ];

      if (collectionId) {
        conditions.push(eq(collectionsTable.id, collectionId));
      } else if (collectionName) {
        conditions.push(ilike(collectionsTable.name, `%${collectionName}%`));
      }

      const [collection] = await db
        .select({
          id: collectionsTable.id,
          name: collectionsTable.name,
          handle: collectionsTable.handle,
          properties: collectionsTable.properties,
          createdAt: collectionsTable.createdAt,
          updatedAt: collectionsTable.updatedAt,
        })
        .from(collectionsTable)
        .where(and(...conditions))
        .limit(1);

      if (!collection) {
        yield {
          state: "error",
          error: collectionId
            ? `No collection found with ID "${collectionId}"`
            : `No collection found matching "${collectionName}"`,
        };
        return;
      }

      const result: any = {
        id: collection.id,
        name: collection.name,
        handle: collection.handle,
        properties: collection.properties,
        createdAt: collection.createdAt.toISOString(),
        updatedAt: collection.updatedAt.toISOString(),
      };

      if (includeEntries) {
        const entries = await db
          .select({
            id: documentsTable.id,
            title: documentsTable.title,
            slug: documentsTable.slug,
            createdAt: documentsTable.createdAt,
            updatedAt: documentsTable.updatedAt,
          })
          .from(documentsTable)
          .where(
            and(
              eq(documentsTable.organizationId, organizationId),
              eq(documentsTable.collectionId, collection.id),
              isNull(documentsTable.deletedAt),
            ),
          )
          .limit(limit);

        let fieldValuesByDocumentId = new Map<string, Record<string, unknown>>();

        if (entries.length > 0) {
          const values = await db
            .select({
              documentId: collectionFieldsTable.documentId,
              values: collectionFieldsTable.values,
            })
            .from(collectionFieldsTable)
            .where(
              and(
                eq(collectionFieldsTable.collectionId, collection.id),
                inArray(
                  collectionFieldsTable.documentId,
                  entries.map((entry) => entry.id),
                ),
              ),
            );

          fieldValuesByDocumentId = new Map(
            values.map((row) => [row.documentId, (row.values as Record<string, unknown>) ?? {}]),
          );
        }

        result.entries = entries.map((entry) => ({
          id: entry.id,
          title: entry.title,
          slug: entry.slug,
          fieldValues: fieldValuesByDocumentId.get(entry.id) ?? {},
          createdAt: entry.createdAt.toISOString(),
          updatedAt: entry.updatedAt.toISOString(),
        }));
        result.entryCount = entries.length;
      }

      yield {
        state: "success",
        message: `Loaded collection "${collection.name}" successfully.`,
        collection: result,
      };
    },
  });
