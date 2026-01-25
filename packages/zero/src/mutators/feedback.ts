import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess } from "../auth";
import { withTimestamps } from "../utils/timestamps";

export const feedbackMutators = {
  create: defineMutator(
    z.object({
      id: z.string(),
      type: z.enum(["feedback", "help"]).optional(),
      message: z.string().min(1),
      metadata: z.any().optional(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { id, type, message, metadata, organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId);

      await tx.mutate.feedback_submissions.insert(
        withTimestamps({
          id,
          user_id: ctx.userId,
          organization_id: organizationId,
          type: type || "feedback",
          message,
          metadata: metadata || null,
        }),
      );
    },
  ),
};
