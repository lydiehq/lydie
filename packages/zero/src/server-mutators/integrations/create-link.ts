import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import { hasOrganizationAccess } from "../../auth";
import { mutators as sharedMutators } from "../../mutators";

export const createIntegrationLinkMutation = defineMutator(
  z.object({
    id: z.string(),
    connectionId: z.string(),
    name: z.string(),
    config: z.record(z.string(), z.any()),
    organizationId: z.string(),
  }),
  async ({
    tx,
    ctx,
    args: { id, connectionId, name, config, organizationId },
  }) => {
    hasOrganizationAccess(ctx, organizationId);
    await sharedMutators.integrations.createLink.fn({
      tx,
      ctx,
      args: { id, connectionId, name, config, organizationId },
    });
  }
);
