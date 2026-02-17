import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess } from "../auth";
import { zql } from "../schema";

export const collectionMutators = {
  create: defineMutator(
    z.object({
      organizationId: z.string(),
      name: z.string(),
      slug: z.string(),
      description: z.string().optional(),
      schema: z
        .array(
          z.object({
            field: z.string(),
            type: z.string(),
            required: z.boolean(),
            options: z.array(z.string()).optional(),
          }),
        )
        .default([]),
      config: z
        .object({
          showChildrenInSidebar: z.boolean().default(true),
          defaultView: z.enum(["documents", "table"]).default("documents"),
        })
        .default({}),
    }),
    async ({ args: { organizationId, name, slug, description, schema, config }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);

      const id = await zql.collections.insert({
        organization_id: organizationId,
        name,
        slug,
        description,
        schema,
        config,
      });

      return { id };
    },
  ),

  update: defineMutator(
    z.object({
      collectionId: z.string(),
      organizationId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      config: z
        .object({
          showChildrenInSidebar: z.boolean().optional(),
          defaultView: z.enum(["documents", "table"]).optional(),
        })
        .optional(),
    }),
    async ({ args: { collectionId, organizationId, name, description, config }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);

      await zql.collections
        .where("id", collectionId)
        .where("organization_id", organizationId)
        .update({
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(config !== undefined && { config }),
        });
    },
  ),

  updateSchema: defineMutator(
    z.object({
      collectionId: z.string(),
      organizationId: z.string(),
      schema: z.array(
        z.object({
          field: z.string(),
          type: z.string(),
          required: z.boolean(),
          options: z.array(z.string()).optional(),
        }),
      ),
    }),
    async ({ args: { collectionId, organizationId, schema }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);

      await zql.collections
        .where("id", collectionId)
        .where("organization_id", organizationId)
        .update({
          schema,
        });
    },
  ),

  delete: defineMutator(
    z.object({
      collectionId: z.string(),
      organizationId: z.string(),
    }),
    async ({ args: { collectionId, organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);

      // Soft delete by setting deleted_at
      await zql.collections
        .where("id", collectionId)
        .where("organization_id", organizationId)
        .update({
          deleted_at: Date.now(),
        });
    },
  ),

  addDocument: defineMutator(
    z.object({
      documentId: z.string(),
      collectionId: z.string(),
      organizationId: z.string(),
    }),
    async ({ args: { documentId, collectionId, organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);

      await zql.documents
        .where("id", documentId)
        .where("organization_id", organizationId)
        .update({
          collection_id: collectionId,
        });
    },
  ),

  removeDocument: defineMutator(
    z.object({
      documentId: z.string(),
      organizationId: z.string(),
    }),
    async ({ args: { documentId, organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);

      await zql.documents
        .where("id", documentId)
        .where("organization_id", organizationId)
        .update({
          collection_id: null,
        });
    },
  ),
};
