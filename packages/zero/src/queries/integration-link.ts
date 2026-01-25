import { defineQuery } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess } from "../auth";
import { zql } from "../schema";

export const integrationLinkQueries = {
  byOrganization: defineQuery(
    z.object({ organizationId: z.string() }),
    ({ args: { organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.integration_links
        .where("organization_id", organizationId)
        .related("connection")
        .orderBy("created_at", "desc");
    },
  ),

  byConnection: defineQuery(
    z.object({ connectionId: z.string(), organizationId: z.string() }),
    ({ args: { connectionId, organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.integration_links
        .where("connection_id", connectionId)
        .where("organization_id", organizationId)
        .related("connection")
        .orderBy("created_at", "desc");
    },
  ),

  byIntegrationType: defineQuery(
    z.object({ organizationId: z.string(), integrationType: z.string() }),
    ({ args: { organizationId, integrationType }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.integration_links
        .where("organization_id", organizationId)
        .where("integration_type", integrationType)
        .related("connection")
        .related("documents", (q) => q.orderBy("created_at", "desc"))
        .orderBy("created_at", "desc");
    },
  ),

  byId: defineQuery(
    z.object({ linkId: z.string(), organizationId: z.string() }),
    ({ args: { linkId, organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.integration_links
        .where("id", linkId)
        .where("organization_id", organizationId)
        .related("connection")
        .one();
    },
  ),
};
