import { defineQuery } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess, hasOrganizationAccessBySlug } from "../auth";
import { zql } from "../schema";

export const assistantQueries = {
  conversations: defineQuery(
    z.object({ organizationId: z.string() }),
    ({ args: { organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.assistant_conversations
        .where("organization_id", organizationId)
        .where("user_id", ctx.userId)
        .related("messages", (q) => q.orderBy("created_at", "asc"))
        .orderBy("created_at", "desc");
    },
  ),

  conversationsByUser: defineQuery(
    z.object({ organizationSlug: z.string() }),
    ({ args: { organizationSlug }, ctx }) => {
      hasOrganizationAccessBySlug(ctx, organizationSlug);

      // Get organization ID from context
      const organization = ctx.organizations?.find((org) => org.slug === organizationSlug);
      if (!organization) {
        throw new Error("Organization not found");
      }

      return zql.assistant_conversations
        .where("user_id", ctx.userId)
        .where("organization_id", organization.id)
        .related("messages", (q) => q.orderBy("created_at", "asc").limit(1))
        .orderBy("updated_at", "desc");
    },
  ),

  byId: defineQuery(
    z.object({ organizationId: z.string(), conversationId: z.string() }),
    ({ args: { organizationId, conversationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return (
        zql.assistant_conversations
          .where("id", conversationId)
          // .where("organization_id", organizationId)
          .where("user_id", ctx.userId)
          .one()
          .related("messages", (q) => q.orderBy("created_at", "asc"))
      );
    },
  ),
};
