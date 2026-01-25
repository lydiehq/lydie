import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess } from "../auth";
import { zql } from "../schema";
import { notFoundError } from "../utils/errors";
import { withUpdatedTimestamp } from "../utils/timestamps";

export const apiKeyMutators = {
  revoke: defineMutator(
    z.object({
      keyId: z.string(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { keyId, organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId);

      // Verify API key belongs to the organization
      const apiKey = await tx.run(
        zql.api_keys.where("id", keyId).where("organization_id", organizationId).one(),
      );

      if (!apiKey) {
        throw notFoundError("API key", keyId);
      }

      await tx.mutate.api_keys.update(
        withUpdatedTimestamp({
          id: keyId,
          revoked: true,
        }),
      );
    },
  ),
};
