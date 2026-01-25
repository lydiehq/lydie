import { defineQuery } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess, isAuthenticated } from "../auth";
import { zql } from "../schema";

export const settingsQueries = {
  user: defineQuery(z.object({}), ({ ctx }) => {
    isAuthenticated(ctx);
    const settings = zql.user_settings.where("user_id", ctx.userId).one();
    return settings;
  }),

  organization: defineQuery(
    z.object({ organizationId: z.string() }),
    ({ args: { organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.organization_settings.where("organization_id", organizationId).one();
    },
  ),
};
