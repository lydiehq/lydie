import { defineMutator } from "@rocicorp/zero"
import { z } from "zod"
import { zql } from "../../schema"
import { hasOrganizationAccess } from "../../auth"
import { db } from "@lydie/database"
import { logIntegrationActivity } from "@lydie/core/integrations"
import { mutators as sharedMutators } from "../../mutators"
import { convertYjsToJson } from "@lydie/core/yjs-to-json"
import { integrationRegistry } from "@lydie/integrations"
import { MutatorContext } from "../../server-mutators"

export const moveDocumentMutation = ({ asyncTasks }: MutatorContext) =>
	defineMutator(
		z.object({
			documentId: z.string(),
			targetParentId: z.string().optional().nullable(),
			targetIntegrationLinkId: z.string().optional().nullable(),
			organizationId: z.string(),
		}),
		async ({
			tx,
			ctx,
			args: { documentId, targetParentId, targetIntegrationLinkId, organizationId },
		}) => {
			hasOrganizationAccess(ctx, organizationId)

			// Get current document state
			const doc = await tx.run(
				zql.documents.where("id", documentId).where("organization_id", organizationId).one(),
			)

			if (!doc) {
				throw new Error(`Document not found: ${documentId}`)
			}

			const previousIntegrationLinkId = doc.integration_link_id
			const isPublished = doc.published

			// Perform the move in the database using the generic move mutator
			await sharedMutators.document.move.fn({
				tx,
				ctx,
				args: {
					documentId,
					targetParentId: targetParentId || null,
					targetIntegrationLinkId: targetIntegrationLinkId || null,
					organizationId,
				},
			})

			// Handle Side Effects
			const isMovingOut = previousIntegrationLinkId && !targetIntegrationLinkId && doc.external_id // Only delete if it was synced

			const isMovingIn = !previousIntegrationLinkId && targetIntegrationLinkId && isPublished

			// 1. Handle Drag OUT -> Delete from external
			if (isMovingOut) {
				asyncTasks.push(async () => {
					await deleteFromIntegration(documentId, doc.external_id!, previousIntegrationLinkId!)
				})
			}

			// 2. Handle Drag IN (Published) -> Push to external
			if (isMovingIn) {
				asyncTasks.push(async () => {
					await pushToIntegration(documentId, targetIntegrationLinkId!)
				})
			}
		},
	)

// --- Helper Functions (Reused/Adapted) ---

async function deleteFromIntegration(documentId: string, externalId: string, integrationLinkId: string) {
	try {
		const link = await db.query.integrationLinksTable.findFirst({
			where: { id: integrationLinkId },
			with: { connection: true },
		})

		if (!link || !link.connection) return

		const integration = integrationRegistry.get(link.connection.integrationType)
		if (!integration) return

		const mergedConfig = {
			...(link.connection.config as Record<string, any>),
			...(link.config as Record<string, any>),
		}

		console.log(`[Move] Deleting document ${documentId} from integration (moved out)`)

		await integration.delete({
			documentId,
			externalId,
			connection: {
				id: link.connection.id,
				integrationType: link.connection.integrationType,
				organizationId: link.connection.organizationId,
				config: mergedConfig,
				createdAt: link.connection.createdAt,
				updatedAt: link.connection.updatedAt,
			},
			commitMessage: `Delete ${externalId} (moved out of integration)`,
		})
	} catch (error) {
		console.error(`[Move] Error removing document from integration:`, error)
	}
}

async function pushToIntegration(documentId: string, integrationLinkId: string) {
	try {
		const link = await db.query.integrationLinksTable.findFirst({
			where: { id: integrationLinkId },
			with: { connection: true },
		})

		if (!link || !link.connection) return

		const document = await db.query.documentsTable.findFirst({
			where: { id: documentId },
		})

		if (!document || !document.published || !document.yjsState) return

		const integration = integrationRegistry.get(link.connection.integrationType)
		if (!integration) return

		const mergedConfig = {
			...(link.connection.config as Record<string, any>),
			...(link.config as Record<string, any>),
		}

		console.log(`[Move] Pushing document ${documentId} to integration (moved in)`)

		const jsonContent = convertYjsToJson(document.yjsState)

		await integration.push({
			document: {
				id: document.id,
				title: document.title,
				slug: document.slug,
				content: jsonContent,
				published: document.published,
				updatedAt: document.updatedAt,
				organizationId: document.organizationId,
				externalId: document.externalId,
				isLocked: document.isLocked ?? false,
				parentId: document.parentId,
			},
			connection: {
				id: link.connection.id,
				integrationType: link.connection.integrationType,
				organizationId: link.connection.organizationId,
				config: mergedConfig,
				createdAt: link.connection.createdAt,
				updatedAt: link.connection.updatedAt,
			},
			commitMessage: `Add ${document.title} to integration (moved in)`,
		})
	} catch (error) {
		console.error(`[Move] Error pushing document to integration:`, error)
	}
}
