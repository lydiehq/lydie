import { createId } from "@lydie/core/id";
import { slugify } from "@lydie/core/utils";
import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";

import { requireAdmin } from "../auth";
import { zql } from "../schema";

export const templateCategoryMutators = {
  create: defineMutator(
    z.object({
      name: z.string(),
    }),
    async ({ tx, ctx, args }) => {
      requireAdmin(ctx);

      const categoryId = createId();
      const slug = `${slugify(args.name)}-${createId().slice(0, 6)}`;

      await tx.mutate.template_categories.insert({
        id: categoryId,
        name: args.name,
        slug,
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      return categoryId;
    },
  ),

  update: defineMutator(
    z.object({
      categoryId: z.string(),
      name: z.string(),
    }),
    async ({ tx, ctx, args }) => {
      requireAdmin(ctx);

      const category = await tx.run(zql.template_categories.where("id", args.categoryId).one());

      if (!category) {
        throw new Error("Category not found");
      }

      const slug = `${slugify(args.name)}-${createId().slice(0, 6)}`;

      await tx.mutate.template_categories.update({
        id: args.categoryId,
        name: args.name,
        slug,
        updated_at: Date.now(),
      });
    },
  ),

  delete: defineMutator(
    z.object({
      categoryId: z.string(),
    }),
    async ({ tx, ctx, args }) => {
      requireAdmin(ctx);

      const category = await tx.run(zql.template_categories.where("id", args.categoryId).one());

      if (!category) {
        throw new Error("Category not found");
      }

      // Delete all category assignments for this category
      const assignments = await tx.run(
        zql.template_category_assignments.where("category_id", args.categoryId),
      );

      for (const assignment of assignments) {
        await tx.mutate.template_category_assignments.delete({
          id: assignment.id,
        });
      }

      // Delete the category
      await tx.mutate.template_categories.delete({
        id: args.categoryId,
      });
    },
  ),
};
