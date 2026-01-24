import { defineQuery } from "@rocicorp/zero"
import { z } from "zod"
import { hasOrganizationAccess } from "../auth"
import { zql } from "../schema"

export const integrationQueries = {
  byIntegrationType: defineQuery(
    z.object({ integrationType: z.string(), organizationId: z.string() }),
    ({ args: { integrationType, organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId)
      return zql.integration_connections
        .where("integration_type", integrationType)
        .where("organization_id", organizationId)
        .orderBy("created_at", "desc")
    },
  ),

  byOrganization: defineQuery(
    z.object({ organizationId: z.string() }),
    ({ args: { organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId)
      return zql.integration_connections
        .where("organization_id", organizationId)
        .related("links", (links) => links)
        .orderBy("created_at", "desc")
    },
  ),

  byId: defineQuery(
    z.object({ connectionId: z.string(), organizationId: z.string() }),
    ({ args: { connectionId, organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId)
      return zql.integration_connections
        .where("id", connectionId)
        .where("organization_id", organizationId)
        .related("links")
        .one()
    },
  ),
}
