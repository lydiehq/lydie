import { defineQuery } from "@rocicorp/zero"
import { z } from "zod"
import { isAuthenticated, hasOrganizationAccess } from "../auth"
import { zql } from "../schema"

export const agentQueries = {
  available: defineQuery(z.object({ organizationId: z.string() }), ({ args: { organizationId }, ctx }) => {
    hasOrganizationAccess(ctx, organizationId)
    isAuthenticated(ctx)

    // Return all default agents plus user's custom agents
    return zql.assistant_agents
      .where(({ cmp, or }) => or(cmp("is_default", true), cmp("user_id", ctx.userId)))
      .orderBy("created_at", "asc")
  }),

  byUser: defineQuery(z.object({ organizationId: z.string() }), ({ args: { organizationId }, ctx }) => {
    hasOrganizationAccess(ctx, organizationId)
    isAuthenticated(ctx)

    // Return only user's custom agents
    return zql.assistant_agents
      .where("user_id", ctx.userId)
      .where("organization_id", organizationId)
      .orderBy("created_at", "desc")
  }),

  byId: defineQuery(
    z.object({ agentId: z.string(), organizationId: z.string() }),
    ({ args: { agentId, organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId)
      isAuthenticated(ctx)

      return zql.assistant_agents
        .where("id", agentId)
        .where(({ cmp, or, and }) =>
          or(
            cmp("is_default", true),
            and(cmp("user_id", ctx.userId), cmp("organization_id", organizationId)),
          ),
        )
        .one()
    },
  ),
}
