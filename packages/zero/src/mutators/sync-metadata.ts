import { defineMutator } from "@rocicorp/zero"
import { createId } from "@lydie/core/id"
import { z } from "zod"
import { hasOrganizationAccess } from "../auth"
import { zql } from "../schema"
import { notFoundError } from "../utils/errors"
import { withTimestamps, withUpdatedTimestamp } from "../utils/timestamps"

export const syncMetadataMutators = {
  upsert: defineMutator(
    z.object({
      id: z.string().optional(),
      documentId: z.string(),
      connectionId: z.string(),
      externalId: z.string(),
      lastSyncedAt: z.number().optional(),
      lastSyncedHash: z.string().optional(),
      syncStatus: z.string(),
      syncError: z.string().optional(),
      organizationId: z.string(),
    }),
    async ({
      tx,
      ctx,
      args: {
        id,
        documentId,
        connectionId,
        externalId,
        lastSyncedAt,
        lastSyncedHash,
        syncStatus,
        syncError,
        organizationId,
      },
    }) => {
      hasOrganizationAccess(ctx, organizationId)

      // Verify document belongs to the organization
      const document = await tx.run(
        zql.documents.where("id", documentId).where("organization_id", organizationId).one(),
      )

      if (!document) {
        throw notFoundError("Document", documentId)
      }

      // Verify connection belongs to the organization
      const connection = await tx.run(
        zql.integration_connections
          .where("id", connectionId)
          .where("organization_id", organizationId)
          .one(),
      )

      if (!connection) {
        throw notFoundError("Connection", connectionId)
      }

      // Check if metadata exists for this document-connection pair
      const existing = await tx.run(
        zql.sync_metadata.where("document_id", documentId).where("connection_id", connectionId).one(),
      )

      if (existing) {
        // Update existing
        const updates: any = {
          id: existing.id,
          external_id: externalId,
          sync_status: syncStatus,
        }

        if (lastSyncedAt !== undefined) updates.last_synced_at = lastSyncedAt
        if (lastSyncedHash !== undefined) updates.last_synced_hash = lastSyncedHash
        if (syncError !== undefined) updates.sync_error = syncError

        await tx.mutate.sync_metadata.update(withUpdatedTimestamp(updates))
      } else {
        // Insert new
        await tx.mutate.sync_metadata.insert(
          withTimestamps({
            id: id || createId(),
            document_id: documentId,
            connection_id: connectionId,
            external_id: externalId,
            last_synced_at: lastSyncedAt || null,
            last_synced_hash: lastSyncedHash || null,
            sync_status: syncStatus,
            sync_error: syncError || null,
          }),
        )
      }
    },
  ),
}
