import { defineQuery } from "@rocicorp/zero"
import { z } from "zod"
import { hasOrganizationAccess } from "../auth"
import { zql } from "../schema"

export const usageQueries = {
  today: defineQuery(z.object({ organizationId: z.string() }), ({ args: { organizationId }, ctx }) => {
    hasOrganizationAccess(ctx, organizationId)

    // Get start of today in Unix timestamp (milliseconds)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const startOfDay = today.getTime()

    return zql.llm_usage
      .where("organization_id", organizationId)
      .where("created_at", ">=", startOfDay)
      .orderBy("created_at", "desc")
  }),
}
