import { defineQuery } from "@rocicorp/zero"
import { z } from "zod"
import { hasOrganizationAccess } from "../auth"
import { zql } from "../schema"

export const memberQueries = {
  byOrganization: defineQuery(
    z.object({ organizationId: z.string() }),
    ({ args: { organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId)
      return zql.members
        .where("organization_id", organizationId)
        .related("user")
        .orderBy("created_at", "desc")
    },
  ),
}
