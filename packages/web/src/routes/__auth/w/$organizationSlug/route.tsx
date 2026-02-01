import {
	Outlet,
	createFileRoute,
	notFound,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useZero } from "@rocicorp/zero/react";

import { FloatingAssistant } from "@/components/assistant/FloatingAssistant";
import { CommandMenu } from "@/components/layout/command-menu/CommandMenu";
import { Sidebar } from "@/components/layout/Sidebar";
import { OrganizationProvider } from "@/context/organization-provider";
import { InstallTemplateDialog } from "@/components/templates/InstallTemplateDialog";
import { loadOrganization } from "@/lib/organization/loadOrganization";

const organizationSearchSchema = z.object({
	installTemplate: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/__auth/w/$organizationSlug")({
	component: RouteComponent,
	validateSearch: (search) => organizationSearchSchema.parse(search),
	beforeLoad: async ({ params }) => {
		return { organizationSlug: params.organizationSlug };
	},
	notFoundComponent: () => <div>Organization not found</div>,
	gcTime: Infinity,
	staleTime: Infinity,
});

function RouteComponent() {
	const navigate = useNavigate();
	const { organizationSlug } = Route.useParams();
	const { installTemplate } = Route.useSearch();
	const { queryClient } = Route.useRouteContext();

	// Load organization using Zero
	const zero = useZero();
	const [organization, setOrganization] = useState<any>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const load = async () => {
			if (!zero || !queryClient) return;
			
			try {
				const org = await loadOrganization(queryClient, zero, organizationSlug);
				setOrganization(org);
			} catch (error) {
				console.error(error);
				throw notFound();
			} finally {
				setIsLoading(false);
			}
		};

		load();
	}, [zero, queryClient, organizationSlug]);

	if (isLoading || !organization) {
		return <div>Loading...</div>;
	}

	return (
		<OrganizationProvider organization={organization}>
			<div className="h-screen flex flex-col overflow-hidden">
				<CommandMenu />
				<div className="flex-1 flex overflow-hidden">
					<Sidebar organization={organization} />
					<Outlet />
				</div>
				<FloatingAssistant />
				{installTemplate && (
					<InstallTemplateDialog
						organizationSlug={organizationSlug}
						templateId={installTemplate}
						isOpen={true}
						onClose={() => {
							navigate({
								to: "/w/$organizationSlug",
								params: { organizationSlug },
								search: {},
							});
						}}
					/>
				)}
			</div>
		</OrganizationProvider>
	);
}
