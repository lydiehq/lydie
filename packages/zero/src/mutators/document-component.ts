import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess } from "../auth";
import { withTimestamps } from "../utils/timestamps";

export const documentComponentMutators = {
  create: defineMutator(
    z.object({
      id: z.string(),
      name: z.string(),
      properties: z.any(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { id, name, properties, organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId);

      await tx.mutate.document_components.insert(
        withTimestamps({
          id,
          name,
          properties,
          organization_id: organizationId,
        }),
      );
    },
  ),
};
