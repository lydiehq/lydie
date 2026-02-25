import { createId } from "@lydie/core/id";
import { slugify } from "@lydie/core/utils";
import { db, collectionsTable } from "@lydie/database";
import { tool } from "ai";
import { and, eq, isNull } from "drizzle-orm";
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
      many: z.boolean().optional(),
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

const RESERVED_HANDLES = new Set([
  "api",
  "v1",
  "settings",
  "admin",
  "auth",
  "public",
  "static",
  "assets",
  "collections",
  "documents",
  "users",
  "organizations",
  "webhooks",
  "integrations",
]);

async function createUniqueHandle(organizationId: string, input: string): Promise<string> {
  const base = slugify(input).trim() || `collection-${createId().slice(0, 4)}`;
  const normalizedBase = RESERVED_HANDLES.has(base) ? `${base}-collection` : base;

  let handle = normalizedBase;
  let counter = 2;

  while (true) {
    const [existing] = await db
      .select({ id: collectionsTable.id })
      .from(collectionsTable)
      .where(
        and(
          eq(collectionsTable.organizationId, organizationId),
          eq(collectionsTable.handle, handle),
          isNull(collectionsTable.deletedAt),
        ),
      )
      .limit(1);

    if (!existing) {
      return handle;
    }

    handle = `${normalizedBase}-${counter}`;
    counter += 1;
  }
}

export const createCollection = (_userId: string, organizationId: string) =>
  tool({
    description: `Create a new collection with schema fields.

This mutation is applied immediately.`,
    inputSchema: z.object({
      name: z.string().min(1).describe("Collection name"),
      handle: z
        .string()
        .optional()
        .describe("Optional URL handle. If omitted, one is generated from the name."),
      properties: z.array(propertyDefinitionSchema).default([]),
    }),
    execute: async function* ({ name, handle, properties }) {
      yield {
        state: "creating",
        message: `Creating collection "${name}"...`,
      };

      const collectionId = createId();
      const finalHandle = await createUniqueHandle(organizationId, handle?.trim() || name);

      await db.insert(collectionsTable).values({
        id: collectionId,
        organizationId,
        name: name.trim(),
        handle: finalHandle,
        properties,
      });

      yield {
        state: "success",
        message: `Created collection "${name}" successfully.`,
        collection: {
          id: collectionId,
          name: name.trim(),
          handle: finalHandle,
          properties,
        },
      };
    },
  });
