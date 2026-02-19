import { createId } from "@lydie/core/id";
import { slugify } from "@lydie/core/utils";
import { defineMutator } from "@rocicorp/zero";
import type { ReadonlyJSONValue } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess } from "../auth";
import { zql } from "../schema";
import { withTimestamps } from "../utils/timestamps";

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

const propertyDefinitionSchema = z.object({
  name: z.string(),
  type: z.enum(["text", "number", "date", "select", "multi-select", "boolean", "relation"]),
  required: z.boolean(),
  unique: z.boolean(),
  options: z.array(z.string()).optional(),
  derived: z
    .object({
      sourceField: z.string(),
      transform: z.enum(["slugify"]),
      editable: z.boolean(),
      warnOnChangeAfterPublish: z.boolean().optional(),
    })
    .optional(),
});

const propertiesSchema = z.array(propertyDefinitionSchema);

async function maybeOne<T>(query: Promise<T>): Promise<T | null> {
  try {
    return await query;
  } catch {
    return null;
  }
}

async function createUniqueHandle(tx: any, organizationId: string, input: string): Promise<string> {
  const base = slugify(input).trim() || `collection-${createId().slice(0, 4)}`;
  if (RESERVED_HANDLES.has(base)) {
    throw new Error("This handle is reserved.");
  }

  let handle = base;
  let counter = 2;
  while (true) {
    const existing = await tx.run(
      zql.collections.where("organization_id", organizationId).where("handle", handle).one(),
    );

    if (!existing) {
      return handle;
    }

    handle = `${base}-${counter}`;
    counter += 1;
  }
}

async function validateHandleForUpdate(
  tx: any,
  organizationId: string,
  collectionId: string,
  input: string,
): Promise<string> {
  const handle = slugify(input).trim();

  if (!handle) {
    throw new Error("Handle is required.");
  }

  if (RESERVED_HANDLES.has(handle)) {
    throw new Error("This handle is reserved.");
  }

  const existing = (await maybeOne(
    tx.run(zql.collections.where("organization_id", organizationId).where("handle", handle).one()),
  )) as { id: string } | null;

  if (existing && existing.id !== collectionId) {
    throw new Error("Handle is already in use.");
  }

  return handle;
}

export const collectionMutators = {
  create: defineMutator(
    z.object({
      collectionId: z.string().optional(),
      organizationId: z.string(),
      name: z.string().min(1),
      handle: z.string().optional(),
      properties: propertiesSchema.default([]),
    }),
    async ({ tx, ctx, args }) => {
      hasOrganizationAccess(ctx, args.organizationId);

      const handle = await createUniqueHandle(
        tx,
        args.organizationId,
        args.handle?.trim() || args.name,
      );

      await tx.mutate.collections.insert(
        withTimestamps({
          id: args.collectionId ?? createId(),
          organization_id: args.organizationId,
          name: args.name.trim(),
          handle,
          properties: args.properties as ReadonlyJSONValue,
        }),
      );
    },
  ),

  update: defineMutator(
    z.object({
      collectionId: z.string(),
      organizationId: z.string(),
      name: z.string().optional(),
      handle: z.string().optional(),
      properties: propertiesSchema.optional(),
    }),
    async ({ tx, ctx, args }) => {
      hasOrganizationAccess(ctx, args.organizationId);

      const existing = await tx.run(
        zql.collections
          .where("id", args.collectionId)
          .where("organization_id", args.organizationId)
          .one(),
      );

      if (!existing) {
        throw new Error("Collection not found");
      }

      const updates: any = { id: args.collectionId };

      if (args.name !== undefined) {
        updates.name = args.name.trim();
      }
      if (args.handle !== undefined) {
        updates.handle = await validateHandleForUpdate(
          tx,
          args.organizationId,
          args.collectionId,
          args.handle,
        );
      }
      if (args.properties !== undefined) {
        updates.properties = args.properties as ReadonlyJSONValue;
      }

      await tx.mutate.collections.update(updates);
    },
  ),

  updateFieldValues: defineMutator(
    z.object({
      documentId: z.string(),
      collectionId: z.string(),
      organizationId: z.string(),
      values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
    }),
    async ({ tx, ctx, args: { documentId, collectionId, organizationId, values } }) => {
      hasOrganizationAccess(ctx, organizationId);

      const [document, collection] = await Promise.all([
        maybeOne(
          tx.run(
            zql.documents
              .where("id", documentId)
              .where("organization_id", organizationId)
              .where("deleted_at", "IS", null)
              .one(),
          ),
        ),
        maybeOne(
          tx.run(
            zql.collections
              .where("id", collectionId)
              .where("organization_id", organizationId)
              .one(),
          ),
        ),
      ]);

      if (!document || !collection) {
        throw new Error("Invalid document or collection");
      }

      const existing = await maybeOne(
        tx.run(
          zql.collection_fields
            .where("document_id", documentId)
            .where("collection_id", collectionId)
            .one(),
        ),
      );

      if (existing) {
        await tx.mutate.collection_fields.update({
          id: existing.id,
          values: {
            ...(existing.values as Record<string, unknown>),
            ...(values as Record<string, unknown>),
          } as ReadonlyJSONValue,
        });
        return;
      }

      await tx.mutate.collection_fields.insert(
        withTimestamps({
          id: createId(),
          document_id: documentId,
          collection_id: collectionId,
          values: values as ReadonlyJSONValue,
          orphaned_values: {},
        }),
      );
    },
  ),

  delete: defineMutator(
    z.object({
      collectionId: z.string(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args }) => {
      hasOrganizationAccess(ctx, args.organizationId);

      const existing = await maybeOne(
        tx.run(
          zql.collections
            .where("id", args.collectionId)
            .where("organization_id", args.organizationId)
            .one(),
        ),
      );

      if (!existing) {
        throw new Error("Collection not found");
      }

      await tx.mutate.collections.update({
        id: args.collectionId,
        deleted_at: Date.now(),
      });
    },
  ),

  restore: defineMutator(
    z.object({
      collectionId: z.string(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args }) => {
      hasOrganizationAccess(ctx, args.organizationId);

      const existing = await maybeOne(
        tx.run(
          zql.collections
            .where("id", args.collectionId)
            .where("organization_id", args.organizationId)
            .one(),
        ),
      );

      if (!existing) {
        throw new Error("Collection not found");
      }

      await tx.mutate.collections.update({
        id: args.collectionId,
        deleted_at: null,
      });
    },
  ),
};
