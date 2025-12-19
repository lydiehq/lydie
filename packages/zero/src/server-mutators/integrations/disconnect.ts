import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "../../schema";
import { hasOrganizationAccess } from "../../auth";
import { mutators as sharedMutators } from "../../mutators";

import { integrationRegistry } from "@lydie/integrations";

export const disconnectIntegrationMutation = (
  asyncTasks: Array<() => Promise<void>>
) =>
  defineMutator(
    z.object({
      connectionId: z.string(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { connectionId, organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId);
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

      await sharedMutators.integrationConnection.disconnect.fn({
        tx,
        ctx,
        args: { connectionId, organizationId },
      });

      console.log("disconnecting integration", integration.onDisconnect);

      if (typeof integration.onDisconnect === "function") {
        // Transform database connection to IntegrationConnection interface
        const integrationConnection = {
          id: connection.id,
          integrationType: connection.integration_type,
          organizationId: connection.organization_id,
          config: connection.config as Record<string, any>,
          createdAt: new Date(connection.created_at),
          updatedAt: new Date(connection.updated_at),
        };
        asyncTasks.push(() => integration.onDisconnect!(integrationConnection));
      }
    }
  );
