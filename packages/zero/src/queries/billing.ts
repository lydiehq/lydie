import { defineQuery } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess } from "../auth";
import { zql } from "../schema";

export const billingQueries = {
  // Get workspace billing by organization ID
  byOrganizationId: defineQuery(
    z.object({ organizationId: z.string() }),
    ({ args: { organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.workspace_billing
        .where("organization_id", organizationId)
        .one()
        .related("organization")
        .related("billingOwner");
    },
  ),

  // Get current user's credits for a workspace
  userCredits: defineQuery(
    z.object({ organizationId: z.string() }),
    ({ args: { organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.user_workspace_credits
        .where("organization_id", organizationId)
        .where("user_id", ctx.userId)
        .one()
        .related("user")
        .related("organization");
    },
  ),

  // Get all members' credits for a workspace (admin view)
  // Includes both active and former members - filter by removed_at in UI
  allMembersCredits: defineQuery(
    z.object({ organizationId: z.string() }),
    ({ args: { organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.user_workspace_credits
        .where("organization_id", organizationId)
        .related("user")
        .related("organization");
    },
  ),

  // Get member count and seat information for billing
  seatInfo: defineQuery(
    z.object({ organizationId: z.string() }),
    ({ args: { organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      // Return organization with member count
      return zql.organizations.where("id", organizationId).one().related("members");
    },
  ),
};
