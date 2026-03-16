import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess } from "../../auth";
import { mutators as sharedMutators } from "../../mutators/index";

export const publishDocumentMutation = () =>
  defineMutator(
    z.object({
      documentId: z.string(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { documentId, organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId);
      await sharedMutators.document.publish.fn({
        tx,
        ctx,
        args: { documentId, organizationId },
      });

      // TODO: document versioning here
    },
  );
