import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess } from "../auth";
import { zql } from "../schema";
import { notFoundError } from "../utils/errors";
import { withTimestamps, withUpdatedTimestamp } from "../utils/timestamps";

export const integrationConnectionMutators = {
  create: defineMutator(
    z.object({
      id: z.string(),
      integrationType: z.string(),
      organizationId: z.string(),
      config: z.any(),
    }),
    async ({ tx, ctx, args: { id, integrationType, organizationId, config } }) => {
      hasOrganizationAccess(ctx, organizationId);

      await tx.mutate.integration_connections.insert(
        withTimestamps({
          id,
          integration_type: integrationType,
          status: "active",
          organization_id: organizationId,
          config,
        }),
      );
    },
  ),

  update: defineMutator(
    z.object({
      connectionId: z.string(),
      config: z.any().optional(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { connectionId, config, organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId);

      // Verify connection belongs to the organization
      const connection = await tx.run(
        zql.integration_connections
          .where("id", connectionId)
          .where("organization_id", organizationId)
          .one(),
      );

      if (!connection) {
        throw notFoundError("Connection", connectionId);
      }

      const updates: any = {
        id: connectionId,
      };

      if (config !== undefined) updates.config = config;

      await tx.mutate.integration_connections.update(withUpdatedTimestamp(updates));
    },
  ),

  disconnect: defineMutator(
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
          .related("links"),
      );

      if (!connection) {
        throw notFoundError("Connection", connectionId);
      }

      // Clean up all resources related to this integration connection
      // to avoid duplicate slug violations when documents are moved to root organization

      // For each integration link, delete all associated documents
      for (const link of connection.links) {
        const linkWithDocuments = await tx.run(
          zql.integration_links.where("id", link.id).one().related("documents"),
        );

        if (linkWithDocuments) {
          // Delete all documents associated with this link
          // This will cascade to embeddings, conversations, publications, etc.
          const deleteDocumentsPromise = linkWithDocuments.documents.map(({ id }) =>
            tx.mutate.documents.delete({ id }),
          );
          await Promise.all(deleteDocumentsPromise);
        }
      }

      // Delete the connection (this will cascade to links, sync_metadata, and activity_logs)
      await tx.mutate.integration_connections.delete({
        id: connectionId,
      });
    },
  ),
};
