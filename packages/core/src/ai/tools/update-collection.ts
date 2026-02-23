import { slugify } from "@lydie/core/utils";
import { db, collectionsTable } from "@lydie/database";
import { tool } from "ai";
import { and, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";

const propertyOptionSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  color: z.string().optional(),
  order: z.number(),
  archived: z.boolean().optional(),
  stage: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETE"]).optional(),
});

const propertyDefinitionSchema = z.object({
  name: z.string().min(1),
  type: z.enum([
    "text",
    "number",
    "date",
    "select",
    "multi-select",
    "status",
    "boolean",
    "relation",
  ]),
  required: z.boolean().default(false),
  unique: z.boolean().default(false),
  options: z.array(propertyOptionSchema).optional(),
  relation: z
    .object({
      targetCollectionId: z.string(),
    })
    .optional(),
  derived: z
    .object({
      sourceField: z.string(),
      transform: z.literal("slugify"),
      editable: z.boolean(),
      warnOnChangeAfterPublish: z.boolean().optional(),
    })
    .optional(),
});

export const updateCollection = (_userId: string, organizationId: string) =>
  tool({
    description: `Update an existing collection (name, handle, or schema properties).

This mutation is applied immediately.`,
    inputSchema: z.object({
      collectionId: z.string().describe("Collection ID to update"),
      name: z.string().optional().describe("New collection name"),
      handle: z.string().optional().describe("New collection handle"),
      properties: z.array(propertyDefinitionSchema).optional(),
    }),
    execute: async function* ({ collectionId, name, handle, properties }) {
      yield {
        state: "updating",
        message: "Updating collection...",
      };

      const [existing] = await db
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

      if (!existing) {
        yield {
          state: "error",
          error: "Collection not found",
        };
        return;
      }

      const updates: Partial<typeof collectionsTable.$inferInsert> = {};

      if (name !== undefined) {
        updates.name = name.trim();
      }

      if (handle !== undefined) {
        const normalizedHandle = slugify(handle).trim();
        if (!normalizedHandle) {
          yield {
            state: "error",
            error: "Handle cannot be empty",
          };
          return;
        }

        const [duplicate] = await db
          .select({ id: collectionsTable.id })
          .from(collectionsTable)
          .where(
            and(
              eq(collectionsTable.organizationId, organizationId),
              eq(collectionsTable.handle, normalizedHandle),
              ne(collectionsTable.id, collectionId),
              isNull(collectionsTable.deletedAt),
            ),
          )
          .limit(1);

        if (duplicate) {
          yield {
            state: "error",
            error: "Handle is already in use",
          };
          return;
        }

        updates.handle = normalizedHandle;
      }

      if (properties !== undefined) {
        updates.properties = properties;
      }

      const [updated] = await db
        .update(collectionsTable)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(collectionsTable.id, collectionId),
            eq(collectionsTable.organizationId, organizationId),
            isNull(collectionsTable.deletedAt),
          ),
        )
        .returning({
          id: collectionsTable.id,
          name: collectionsTable.name,
          handle: collectionsTable.handle,
          properties: collectionsTable.properties,
          updatedAt: collectionsTable.updatedAt,
        });

      yield {
        state: "success",
        message: `Updated collection "${updated?.name || collectionId}" successfully.`,
        collection: updated,
      };
    },
  });
