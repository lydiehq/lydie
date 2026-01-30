import { defineQuery } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess } from "../auth";
import { zql } from "../schema";

export const seatQueries = {
  forUser: defineQuery(
    z.object({ organizationId: z.string() }),
    ({ args: { organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.seats
        .where("organization_id", organizationId)
        .where("claimed_by_user_id", ctx.userId)
        .where("status", "claimed")
        .one();
    },
  ),
};
