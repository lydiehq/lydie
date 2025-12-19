import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "../../schema";
import { hasOrganizationAccess } from "../../auth";
import { mutators as sharedMutators } from "../../mutators";
import {
  logIntegrationActivity,
  pullFromIntegrationLink,
} from "@lydie/core/integrations";

import { integrationRegistry } from "@lydie/integrations";

export const createIntegrationLinkMutation = (
  asyncTasks: Array<() => Promise<void>>
) =>
  defineMutator(
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
      await sharedMutators.integration.createLink.fn({
        tx,
        ctx,
        args: { id, connectionId, name, config, organizationId },
      });

      const connection = await tx.run(
        zql.integration_connections
          .where("id", connectionId)
          .where("organization_id", organizationId)
          .one()
      );

      if (!connection) {
        throw new Error(`Connection not found: ${connectionId}`);
      }

      const integration = integrationRegistry.get(connection.integration_type);
      if (!integration) {
        throw new Error(
          `Integration not found: ${connection.integration_type}`
        );
      }

      // Automatically pull from the integration after creating the link
      asyncTasks.push(async () => {
        console.log(
          `[Integration Link] Auto-pulling from newly created link ${id}`
        );
        const result = await pullFromIntegrationLink({
          linkId: id,
          organizationId,
          userId: ctx.userId,
          integration,
        });

        if (result.success) {
          console.log(
            `[Integration Link] Auto-pull succeeded: imported ${result.imported}, failed ${result.failed}`
          );
          await logIntegrationActivity(
            connectionId,
            "pull",
            "success",
            connection.integration_type
          );
        } else {
          console.error(`[Integration Link] Auto-pull failed: ${result.error}`);
          await logIntegrationActivity(
            connectionId,
            "pull",
            "error",
            connection.integration_type
          );
        }
      });
    }
  );
