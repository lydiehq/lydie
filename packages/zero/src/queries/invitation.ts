import { defineQuery } from "@rocicorp/zero"
import { z } from "zod"
import { isAuthenticated, hasOrganizationAccess } from "../auth"
import { zql } from "../schema"

export const invitationQueries = {
  byOrganization: defineQuery(
    z.object({ organizationId: z.string() }),
    ({ args: { organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId)
      return zql.invitations
        .where("organization_id", organizationId)
        .where("status", "pending")
        .related("inviter")
        .orderBy("created_at", "desc")
    },
  ),

  byUser: defineQuery(z.object({ email: z.string() }), ({ args: { email }, ctx }) => {
    isAuthenticated(ctx)
    return zql.invitations
      .where("status", "pending")
      .where("email", email)
      .related("organization")
      .related("inviter")
      .orderBy("created_at", "desc")
  }),
}
