import { defineQuery } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess, isAuthenticated } from "../auth";
import { zql } from "../schema";

export const agentQueries = {
  byUser: defineQuery(
    z.object({ organizationId: z.string() }),
    ({ args: { organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      isAuthenticated(ctx);

      // Return only user's custom agents (default agents are now in code)
      return zql.assistant_agents
        .where("user_id", ctx.userId)
        .where("organization_id", organizationId)
        .orderBy("created_at", "desc");
    },
  ),

  byId: defineQuery(
    z.object({ agentId: z.string(), organizationId: z.string() }),
    ({ args: { agentId, organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      isAuthenticated(ctx);

      // Only return custom agents from DB (default agents are in code)
      return zql.assistant_agents
        .where("id", agentId)
        .where("user_id", ctx.userId)
        .where("organization_id", organizationId)
        .one();
    },
  ),
};
