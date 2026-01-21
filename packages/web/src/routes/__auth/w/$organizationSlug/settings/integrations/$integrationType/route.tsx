import { Heading } from "@/components/generic/Heading"
import { useAuthenticatedApi } from "@/services/api"
import { getIntegrationIconUrl } from "@/utils/integration-icons"
import { getIntegrationMetadata } from "@lydie/integrations/client"
import { queries } from "@lydie/zero/queries"
import { useQuery, useZero } from "@rocicorp/zero/react"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { Button } from "@/components/generic/Button"
import { Link } from "@/components/generic/Link"
import { toast } from "sonner"
import { z } from "zod"
import { Outlet } from "@tanstack/react-router"
import { mutators } from "@lydie/zero/mutators"
import { useState } from "react"
import { confirmDialog } from "@/stores/confirm-dialog"
import { DialogTrigger } from "react-aria-components"
import { Modal } from "@/components/generic/Modal"
import { Dialog } from "@/components/generic/Dialog"
import { WordPressConnectionForm } from "@/components/integrations/forms/wordpress-connection-form"
import { useOrganization } from "@/context/organization.context"
import { trackEvent } from "@/lib/posthog"

export const Route = createFileRoute("/__auth/w/$organizationSlug/settings/integrations/$integrationType")({
	component: RouteComponent,
	validateSearch: z.object({
		integrationType: z.string().optional(),
	}),
	loader: async ({ context, params }) => {
		const { zero, organization } = context

		zero.run(
			queries.integrations.byIntegrationType({
				integrationType: params.integrationType,
				organizationId: organization.id,
			}),
		)

		const integration = getIntegrationMetadata(params.integrationType)
		if (!integration) throw notFound()
		// TODO: default image
		const iconUrl = getIntegrationIconUrl(integration.id) ?? ""
		const integrationDetails = { ...integration, iconUrl }
		return { integrationDetails }
	},
	ssr: false,
})

function RouteComponent() {
	const { organization } = useOrganization()
	const { integrationDetails } = Route.useLoaderData()
	const { createClient } = useAuthenticatedApi()
	const zero = useZero()

	const [integrationConnections] = useQuery(
		queries.integrations.byIntegrationType({
			integrationType: integrationDetails.id,
			organizationId: organization.id,
		}),
	)

	const isEnabled = integrationConnections.length > 0
	const authType = integrationDetails.authType || "oauth"
	const isOAuth = authType === "oauth"

	const [isConnecting, setIsConnecting] = useState(false)
	const [isConnectionDialogOpen, setIsConnectionDialogOpen] = useState(false)

	const connectOAuth = async () => {
		try {
			setIsConnecting(true)
			const client = await createClient()
			const redirectUrl = `/w/${organization?.slug}/settings/integrations/${integrationDetails.id}`
			const response = await client.internal.integrations[":type"].oauth.authorize
				.$post({
					param: { type: integrationDetails.id },
					json: { redirectUrl },
				})
				.then((res: Response) => res.json())
			window.location.href = response.authUrl
		} catch (error) {
			setIsConnecting(false)
			console.error(`${integrationDetails.name} OAuth error:`, error)
			toast.error(`Failed to start ${integrationDetails.name} connection`)
		}
	}

	const handleConnectionSuccess = () => {
		setIsConnectionDialogOpen(false)

		// Track integration connected
		trackEvent("integration_connected", {
			integrationType: integrationDetails.id,
			integrationName: integrationDetails.name,
			organizationId: organization.id,
			authType,
		})
	}

	const disconnect = () => {
		confirmDialog({
			title: `Disable ${integrationDetails.name} Integration`,
			message:
				"This action will disconnect all connections and delete all documents associated with this integration.",
			onConfirm: () => {
				zero.mutate(
					mutators.integrationConnection.disconnect({
						connectionId: integrationConnections[0].id,
						organizationId: organization.id,
					}),
				)

				// Track integration disconnected
				trackEvent("integration_disconnected", {
					integrationType: integrationDetails.id,
					integrationName: integrationDetails.name,
					organizationId: organization.id,
				})
			},
		})
	}

	const pages = [
		{
			label: "Connections",
			href: `/w/$organizationSlug/settings/integrations/${integrationDetails.id}`,
		},
		{
			label: "Activity",
			href: `/w/$organizationSlug/settings/integrations/${integrationDetails.id}/activity`,
		},
	]

	return (
		<div className="flex flex-col gap-y-6">
			<Link to=".." className="text-sm text-gray-500 mb-4 block">
				Back to Integrations
			</Link>
			<div className="border-b border-black/5 flex flex-col gap-y-6 pb-1.5">
				<div className="flex justify-between items-center">
					<div className="flex items-center gap-x-4">
						<div className="rounded-lg ring-1 ring-black/6 flex items-center justify-center size-11">
							<img
								src={integrationDetails.iconUrl}
								alt={`${integrationDetails.name} icon`}
								className="size-8 rounded-sm"
							/>
						</div>
						<div>
							<Heading level={1}>{integrationDetails.name} Integration</Heading>
							<p className="text-sm/relaxed text-gray-600 mt-1">
								{integrationDetails.description}
							</p>
						</div>
					</div>
					{isEnabled ? (
						<Button onPress={disconnect} intent="secondary">
							Disable Integration
						</Button>
					) : isOAuth ? (
						<Button onPress={connectOAuth} isPending={isConnecting}>
							Enable Integration
						</Button>
					) : (
						<>
							<DialogTrigger
								isOpen={isConnectionDialogOpen}
								onOpenChange={setIsConnectionDialogOpen}
							>
								<Button>Enable Integration</Button>
								<Modal isDismissable>
									<Dialog>
										<div className="p-4">
											{integrationDetails.id === "wordpress" && (
												<WordPressConnectionForm
													organizationId={organization.id}
													integrationType={integrationDetails.id}
													onSuccess={handleConnectionSuccess}
													onCancel={() => setIsConnectionDialogOpen(false)}
												/>
											)}
											{/* Add other manual connection forms here as needed */}
										</div>
									</Dialog>
								</Modal>
							</DialogTrigger>
						</>
					)}
				</div>
				<nav aria-label="Integration pages" className="flex gap-x-1">
					{pages.map((page) => (
						<Link
							key={page.label}
							to={page.href}
							className="text-sm font-medium text-gray-700 px-3 py-1 hover:bg-black/1 rounded-md"
							replace
							activeOptions={{
								exact: true,
							}}
							activeProps={{
								className: "text-gray-950 bg-black/3",
							}}
						>
							{page.label}
						</Link>
					))}
				</nav>
			</div>
			<Outlet />
		</div>
	)
}
