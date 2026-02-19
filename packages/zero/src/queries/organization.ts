import { defineQuery } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess, hasOrganizationAccessBySlug, isAuthenticated } from "../auth";
import { zql } from "../schema";

export const organizationQueries = {
  byUser: defineQuery(z.object({}), ({ ctx }) => {
    isAuthenticated(ctx);
    return zql.members
      .where("user_id", ctx.userId)
      .related("organization")
      .orderBy("created_at", "desc");
  }),

  byId: defineQuery(
    z.object({ organizationId: z.string() }),
    ({ args: { organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.organizations.where("id", organizationId).one();
    },
  ),

  bySlug: defineQuery(
    z.object({ organizationSlug: z.string() }),
    ({ args: { organizationSlug }, ctx }) => {
      hasOrganizationAccessBySlug(ctx, organizationSlug);
      return zql.organizations.where("slug", organizationSlug).one();
    },
  ),

  billing: defineQuery(
    z.object({ organizationSlug: z.string() }),
    ({ args: { organizationSlug }, ctx }) => {
      hasOrganizationAccessBySlug(ctx, organizationSlug);
      return zql.organizations.where("slug", organizationSlug).one();
    },
  ),

  documents: defineQuery(
    z.object({ organizationSlug: z.string() }),
    ({ args: { organizationSlug }, ctx }) => {
      hasOrganizationAccessBySlug(ctx, organizationSlug);
      return zql.organizations
        .where("slug", organizationSlug)
        .one()
        .related("documents", (q) =>
          q
            .where("deleted_at", "IS", null)
            .orderBy("sort_order", "asc")
            .orderBy("created_at", "desc")
            .related("collection"),
        );
    },
  ),

  searchDocuments: defineQuery(
    z.object({
      organizationId: z.string(),
      searchTerm: z.string(),
    }),
    ({ args: { organizationId, searchTerm }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);

      const searchPattern = searchTerm.trim() ? `%${searchTerm.trim()}%` : "%";

      // If search term is empty, return all items (limited)
      // Exclude deleted items
      if (!searchTerm.trim()) {
        return zql.organizations
          .where("id", organizationId)
          .one()
          .related("documents", (q) =>
            q.where("deleted_at", "IS", null).orderBy("created_at", "desc").limit(20),
          );
      }

      // Search documents by title
      // Exclude deleted items
      return zql.organizations
        .where("id", organizationId)
        .one()
        .related("documents", (q) =>
          q
            .where("deleted_at", "IS", null)
            .where("title", "ILIKE", searchPattern)
            .orderBy("updated_at", "desc")
            .limit(10),
        );
    },
  ),
  documentTree: defineQuery(
    z.object({ organizationSlug: z.string() }),
    ({ args: { organizationSlug }, ctx }) => {
      hasOrganizationAccessBySlug(ctx, organizationSlug);
      return zql.organizations
        .where("slug", organizationSlug)
        .one()
        .related("documents", (q) =>
          q
            .where("deleted_at", "IS", null)
            .orderBy("sort_order", "asc")
            .orderBy("created_at", "desc")
            .related("collection"),
        )
        .related("integrationConnections", (q) =>
          q.orderBy("created_at", "desc").related("links", (links) => links),
        );
    },
  ),
};
