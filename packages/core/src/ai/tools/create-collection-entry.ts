import { createId } from "@lydie/core/id";
import { slugify } from "@lydie/core/utils";
import { db, collectionFieldsTable, collectionsTable, documentsTable } from "@lydie/database";
import { tool } from "ai";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { convertJsonToYjs } from "../../yjs-to-json";

const fieldValuesSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]))
  .default({});

export const createCollectionEntry = (userId: string, organizationId: string) =>
  tool({
    description: `Create a new document entry in a collection.

This mutation is applied immediately.`,
    inputSchema: z.object({
      collectionId: z.string().describe("Collection ID"),
      title: z.string().describe("Entry title").default(""),
      values: fieldValuesSchema.describe("Initial collection field values"),
    }),
    execute: async function* ({ collectionId, title, values }) {
      yield {
        state: "creating",
        message: "Creating collection entry...",
      };

      const [collection] = await db
        .select({ id: collectionsTable.id })
        .from(collectionsTable)
        .where(
          and(
            eq(collectionsTable.id, collectionId),
            eq(collectionsTable.organizationId, organizationId),
            isNull(collectionsTable.deletedAt),
          ),
        )
        .limit(1);

      if (!collection) {
        yield {
          state: "error",
          error: "Collection not found",
        };
        return;
      }

      const documentId = createId();
      const safeTitle = title.trim();
      const slugBase = safeTitle || "untitled";
      const slug = `${slugify(slugBase)}-${createId().slice(0, 6)}`;
      const yjsState = convertJsonToYjs({ type: "doc", content: [] });

      await db.insert(documentsTable).values({
        id: documentId,
        title: safeTitle,
        slug,
        userId,
        organizationId,
        collectionId,
        yjsState,
        published: false,
      });

      await db.insert(collectionFieldsTable).values({
        id: createId(),
        documentId,
        collectionId,
        values,
        orphanedValues: {},
      });

      yield {
        state: "success",
        message: "Created collection entry successfully.",
        entry: {
          documentId,
          collectionId,
          title: safeTitle,
          values,
        },
      };
    },
  });
