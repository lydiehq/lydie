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

type PropertyDefinition = {
  name: string;
  type: "text" | "number" | "date" | "select" | "multi-select" | "boolean" | "relation";
  required: boolean;
  unique: boolean;
  options?: string[];
  derived?: {
    sourceField: string;
    transform: "slugify";
    editable: boolean;
    warnOnChangeAfterPublish?: boolean;
  };
};

async function createUniqueHandle(
  tx: any,
  organizationId: string,
  input: string,
): Promise<string> {
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

export const collectionMutators = {
  create: defineMutator(
    z.object({
      organizationId: z.string(),
      name: z.string().min(1),
      handle: z.string().optional(),
      properties: z
        .array(
          z.object({
            name: z.string(),
            type: z.enum([
              "text",
              "number",
              "date",
              "select",
              "multi-select",
              "boolean",
              "relation",
            ]),
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
          }),
        )
        .default([]),
      showEntriesInSidebar: z.boolean().optional(),
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
          id: createId(),
          organization_id: args.organizationId,
          name: args.name.trim(),
          handle,
          properties: args.properties as ReadonlyJSONValue,
          show_entries_in_sidebar: args.showEntriesInSidebar ?? false,
        }),
      );
    },
  ),

  update: defineMutator(
    z.object({
      collectionId: z.string(),
      organizationId: z.string(),
      name: z.string().optional(),
      properties: z.array(z.custom<PropertyDefinition>()).optional(),
      showEntriesInSidebar: z.boolean().optional(),
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
      if (args.properties !== undefined) {
        updates.properties = args.properties as ReadonlyJSONValue;
      }
      if (args.showEntriesInSidebar !== undefined) {
        updates.show_entries_in_sidebar = args.showEntriesInSidebar;
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

      let existing = null;
      try {
        existing = await tx.run(
          zql.collection_fields
            .where("document_id", documentId)
            .where("collection_id", collectionId)
            .one(),
        );
      } catch {
        existing = null;
      }

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
};
