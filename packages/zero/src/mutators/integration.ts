import { defineMutator } from "@rocicorp/zero"
import { z } from "zod"
import { hasOrganizationAccess } from "../auth"
import { zql } from "../schema"
import { notFoundError } from "../utils/errors"
import { withTimestamps } from "../utils/timestamps"

export const integrationMutators = {
  deleteLink: defineMutator(
    z.object({
      linkId: z.string(),
      deleteDocuments: z.boolean().optional(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { linkId, deleteDocuments, organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId)
      const link = await tx.run(
        zql.integration_links
          .where("id", linkId)
          .where("organization_id", organizationId)
          .one()
          .related("documents"),
      )

      if (!link) {
        throw notFoundError("Link", linkId)
      }

      if (deleteDocuments) {
        const deleteDocumentsPromise = link.documents.map(({ id }) => tx.mutate.documents.delete({ id }))
        await Promise.all(deleteDocumentsPromise)
      }

      await tx.mutate.integration_links.delete({ id: linkId })
    },
  ),

  createLink: defineMutator(
    z.object({
      id: z.string(),
      connectionId: z.string(),
      name: z.string(),
      config: z.record(z.string(), z.any()),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { id, connectionId, name, config, organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId)

      const connection = await tx.run(
        zql.integration_connections
          .where("id", connectionId)
          .where("organization_id", organizationId)
          .one(),
      )

      if (!connection) {
        throw notFoundError("Connection", `${connectionId} for organization ${organizationId}`)
      }

      await tx.mutate.integration_links.insert(
        withTimestamps({
          id,
          connection_id: connection.id,
          organization_id: organizationId,
          integration_type: connection.integration_type,
          name,
          config,
          sync_status: "pulling",
        }),
      )
    },
  ),
}
