import { defineQuery } from "@rocicorp/zero";
import { z } from "zod";

import { requireAdmin } from "../auth";
import { zql } from "../schema";

export const templateQueries = {
  all: defineQuery(z.object({}), ({ ctx }) => {
    requireAdmin(ctx);
    return zql.templates.orderBy("created_at", "desc");
  }),

  byId: defineQuery(
    z.object({
      templateId: z.string(),
    }),
    ({ ctx, args }) => {
      requireAdmin(ctx);
      return zql.templates.where("id", args.templateId).one();
    },
  ),

  byIdWithCategories: defineQuery(
    z.object({
      templateId: z.string(),
    }),
    ({ ctx, args }) => {
      requireAdmin(ctx);

      return zql.templates
        .where("id", args.templateId)
        .one()
        .related("categoryAssignments", (q) => q.related("category"));
    },
  ),
};
