import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess } from "../../auth";
import { mutators as sharedMutators } from "../../mutators/index";

export const moveDocumentMutation = () =>
  defineMutator(
    z.object({
      documentId: z.string(),
      targetParentId: z.string().optional().nullable(),
      organizationId: z.string(),
    }),
    async ({
      tx,
      ctx,
      args: { documentId, targetParentId, organizationId },
    }) => {
      hasOrganizationAccess(ctx, organizationId);

      // Perform the move in the database using the generic move mutator
      await sharedMutators.document.move.fn({
        tx,
        ctx,
        args: {
          documentId,
          targetParentId: targetParentId || null,
          organizationId,
        },
      });
    },
  );
