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

export const publishDocumentMutation = ({ asyncTasks }: MutatorContext) =>
	defineMutator(
		z.object({
			documentId: z.string(),
			organizationId: z.string(),
		}),
		async ({ tx, ctx, args: { documentId, organizationId } }) => {
			hasOrganizationAccess(ctx, organizationId)
			await sharedMutators.document.publish.fn({
				tx,
				ctx,
				args: { documentId, organizationId },
			})

			const doc = await tx.run(
				zql.documents.where("id", documentId).where("organization_id", organizationId).one(),
			)

			if (!doc) {
				throw new Error(`Document not found: ${documentId}`)
			}

			// TODO: document versioning here

			const shouldPush = doc.integration_link_id

			if (shouldPush) {
				asyncTasks.push(async () => {
					await pushToIntegration(documentId, doc.integration_link_id)
				})
			}
		},
	)

async function pushToIntegration(documentId: string, integrationLinkId: string | null) {
	if (!integrationLinkId) {
		return
	}

	try {
		// Fetch the integration link with its connection
		const link = await db.query.integrationLinksTable.findFirst({
			where: { id: integrationLinkId },
			with: {
				connection: true,
			},
		})

		if (!link || !link.connection) {
			console.error(`[Push] Integration link not found: ${integrationLinkId}`)
			return
		}

		// Get the document
		const document = await db.query.documentsTable.findFirst({
			where: { id: documentId },
		})

		if (!document) {
			console.error(`[Push] Document not found: ${documentId}`)
			return
		}

		// Only push if document is published
		if (!document.published) {
			console.log(`[Push] Document ${documentId} is not published, skipping push`)
			return
		}

		// Get integration from registry
		const integration = integrationRegistry.get(link.connection.integrationType)
		if (!integration) {
			console.error(`[Push] Unknown integration type: ${link.connection.integrationType}`)
			return
		}

		// Merge connection config with link config (link config has repo-specific info)
		const mergedConfig = {
			...(link.connection.config as Record<string, any>),
			...(link.config as Record<string, any>),
		}

		console.log(
			`[Push] Pushing document ${documentId} to ${link.connection.integrationType} link: ${link.name}`,
		)

		// Use Yjs as source of truth
		if (!document.yjsState) {
			console.error(`[Push] Document ${documentId} has no content (yjsState is missing)`)
			return
		}

		const jsonContent = convertYjsToJson(document.yjsState)

		// Call integration's push method
		const result = await integration.push({
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
			commitMessage: `Update ${document.title} from Lydie`,
		})

		if (result.success) {
			await logIntegrationActivity(
				link.connection.id,
				"push",
				"success",
				link.connection.integrationType,
			)
			console.log(`[Push] Successfully pushed document ${documentId}: ${result.message}`)
		} else {
			await logIntegrationActivity(link.connection.id, "push", "error", link.connection.integrationType)
			console.error(`[Push] Failed to push document ${documentId}: ${result.error}`)
		}
	} catch (error) {
		// Log but don't throw - push failure shouldn't block the mutation
		console.error(`[Push] Error pushing document ${documentId}:`, error)
	}
}
