import { defineQuery } from "@rocicorp/zero"
import { z } from "zod"
import { hasOrganizationAccess } from "../auth"
import { zql } from "../schema"

export const integrationActivityQueries = {
  byIntegrationType: defineQuery(
    z.object({ organizationId: z.string(), integrationType: z.string() }),
    ({ args: { organizationId, integrationType }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId)
      return zql.integration_activity_logs
        .where("integration_type", integrationType)
        .related("connection", (q) => q.where("organization_id", organizationId))
        .orderBy("created_at", "desc")
    },
  ),
}
