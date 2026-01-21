import { createId } from "@lydie/core/id"
import { useNavigate } from "@tanstack/react-router"
import { useZero } from "@/services/zero"
import { useOrganization } from "@/context/organization.context"
import { toast } from "sonner"
import { useRouter } from "@tanstack/react-router"
import { mutators } from "@lydie/zero/mutators"
import { trackEvent } from "@/lib/posthog"

export function useDocumentActions() {
	const z = useZero()
	const navigate = useNavigate()
	const { navigate: routerNavigate } = useRouter()
	const { organization } = useOrganization()

	const createDocument = async (parentId?: string, integrationLinkId?: string) => {
		const id = createId()
		z.mutate(
			mutators.document.create({
				id,
				organizationId: organization.id,
				parentId,
				integrationLinkId,
			}),
		)

		// Track document creation
		trackEvent("document_created", {
			documentId: id,
			organizationId: organization.id,
			hasParent: !!parentId,
			fromIntegration: !!integrationLinkId,
		})

		navigate({
			from: "/w/$organizationSlug",
			to: "/w/$organizationSlug/$id",
			params: { id, organizationSlug: organization.slug || "" },
		})
	}

	const deleteDocument = (
		documentId: string,
		redirectAfterDelete = false,
		integrationLinkId?: string | null,
	) => {
		const performDelete = () => {
			try {
				z.mutate(
					mutators.document.delete({
						documentId,
						organizationId: organization.id,
					}),
				)

				// Track document deletion
				trackEvent("document_deleted", {
					documentId,
					organizationId: organization.id,
					fromIntegration: !!integrationLinkId,
				})

				toast.success("Document deleted")

				if (redirectAfterDelete) {
					routerNavigate({
						to: "..",
					})
				}
			} catch (error) {
				toast.error("Failed to delete document")
			}
		}

		if (integrationLinkId) {
			const { confirmDialog } = require("@/stores/confirm-dialog")
			confirmDialog({
				title: "Delete from Integration?",
				message:
					"This document is part of an integration. Deleting it will also delete the corresponding file in the external provider (e.g. GitHub). This action cannot be undone.",
				confirmLabel: "Delete & Remove",
				destuctive: true,
				onConfirm: performDelete,
			})
		} else {
			performDelete()
		}
	}

	const publishDocument = (documentId: string) => {
		z.mutate(
			mutators.document.publish({
				documentId,
				organizationId: organization.id,
			}),
		)
	}

	const updateDocument = (documentId: string, data: any) => {
		z.mutate(
			mutators.document.update({
				documentId,
				organizationId: organization.id,
				...data,
			}),
		)
	}

	return {
		createDocument,
		deleteDocument,
		publishDocument,
		updateDocument,
	}
}
