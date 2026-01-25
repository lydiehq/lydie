import { defineQuery } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess } from "../auth";
import { zql } from "../schema";

export const documentQueries = {
  byUpdated: defineQuery(
    z.object({ organizationId: z.string() }),
    ({ args: { organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.documents
        .where("organization_id", organizationId)
        .where("deleted_at", "IS", null)
        .orderBy("updated_at", "desc");
    },
  ),

  byId: defineQuery(
    z.object({ organizationId: z.string(), documentId: z.string() }),
    ({ args: { organizationId, documentId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);

      return zql.documents
        .where("id", documentId)
        .where("organization_id", organizationId)
        .where("deleted_at", "IS", null)
        .one()
        .related("parent")
        .related("children", (q) =>
          q
            .where("deleted_at", "IS", null)
            .orderBy("sort_order", "asc")
            .orderBy("created_at", "asc"),
        )
        .related("organization");
    },
  ),

  search: defineQuery(
    z.object({
      organizationId: z.string(),
      searchTerm: z.string(),
    }),
    ({ args: { organizationId, searchTerm }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);

      if (!searchTerm.trim()) {
        return zql.documents
          .where("organization_id", organizationId)
          .where("deleted_at", "IS", null)
          .orderBy("created_at", "desc")
          .limit(5);
      }

      return zql.documents
        .where("organization_id", organizationId)
        .where("deleted_at", "IS", null)
        .where("title", "ILIKE", `%${searchTerm}%`)
        .orderBy("created_at", "desc")
        .limit(20);
    },
  ),
};
