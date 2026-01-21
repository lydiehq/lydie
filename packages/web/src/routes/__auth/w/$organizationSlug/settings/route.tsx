import { createFileRoute, Link, Outlet } from "@tanstack/react-router"
import { Surface } from "@/components/layout/Surface"
import {
	UserIcon,
	SettingsIcon,
	SparklesIcon,
	CreditCardIcon,
	BlocksIcon,
	UploadIcon,
	DocumentIcon,
	ExternalLinkIcon,
	ShieldAlertIcon,
	PuzzleIcon,
} from "@/icons"
import { sidebarItemStyles, sidebarItemIconStyles } from "@/components/layout/Sidebar"
import { Eyebrow } from "@/components/generic/Eyebrow"
import { useAuth } from "@/context/auth.context"
import { isAdmin } from "@/utils/admin"

export const Route = createFileRoute("/__auth/w/$organizationSlug/settings")({
	component: RouteComponent,
})

type SettingsRoute = {
	path: string
	label: string
	icon: React.ComponentType<{ className?: string }>
	external?: boolean
	adminOnly?: boolean
}

type SettingsSection = {
	title: string
	routes: SettingsRoute[]
}

const settingsRoutes: SettingsSection[] = [
	{
		title: "Account",
		routes: [
			{
				path: "/w/$organizationSlug/settings/profile",
				label: "Profile",
				icon: UserIcon,
			},
			{
				path: "/w/$organizationSlug/settings/user",
				label: "Preferences",
				icon: UserIcon,
			},
			{
				path: "/w/$organizationSlug/settings/ai",
				label: "AI Settings",
				icon: SparklesIcon,
			},
		],
	},
	{
		title: "Workspace",
		routes: [
			{
				path: "/w/$organizationSlug/settings",
				label: "General",
				icon: SettingsIcon,
			},
			{
				path: "/w/$organizationSlug/settings/admin",
				label: "Admin",
				icon: ShieldAlertIcon,
				adminOnly: true,
			},
			{
				path: "/w/$organizationSlug/settings/billing",
				label: "Billing & Usage",
				icon: CreditCardIcon,
			},
			{
				path: "/w/$organizationSlug/settings/components",
				label: "Components",
				icon: BlocksIcon,
				adminOnly: true,
			},
			{
				path: "/w/$organizationSlug/settings/integrations/",
				label: "Integrations",
				icon: PuzzleIcon,
			},
			{
				path: "/w/$organizationSlug/settings/import",
				label: "Import",
				icon: UploadIcon,
				adminOnly: true,
			},
		],
	},
	{
		title: "Miscellaneous",
		routes: [
			{
				path: "https://lydie.co/documentation",
				external: true,
				label: "Docs",
				icon: DocumentIcon,
			},
		],
	},
]

function RouteComponent() {
	const { user } = useAuth()
	const userIsAdmin = isAdmin(user)

	return (
		<div className="p-1 size-full">
			<Surface className="overflow-y-auto">
				<div className="mx-auto max-w-5xl gap-x-8 flex size-full grow p-12 overflow-visible">
					<nav aria-label="Settings navigation" className="w-[200px] shrink-0">
						<ul className="flex flex-col gap-y-2">
							{settingsRoutes.map((section) => (
								<li key={section.title} className="flex flex-col gap-y-2">
									<Eyebrow>{section.title}</Eyebrow>
									<ul className="flex flex-col">
										{section.routes
											.filter((route) => !route.adminOnly || userIsAdmin)
											.map((route) => {
												return (
													<li key={route.path}>
														<Link
															to={route.path}
															from="/w/$organizationSlug/settings"
															{...(route.external ? { target: "_blank" } : {})}
															className={sidebarItemStyles({
																className: "px-1.5",
															})}
															activeOptions={{
																exact: true,
															}}
														>
															<div className="flex items-center gap-1.5 flex-1 min-w-0">
																<route.icon
																	className={sidebarItemIconStyles({
																		className: "size-4 shrink-0",
																	})}
																/>
																<span className="truncate flex-1">
																	{route.label}
																</span>
																{route.adminOnly && (
																	<span className="text-[10px] font-medium text-muted-foreground/80 bg-muted/50 dark:bg-muted/30 px-1.5 py-0.5 rounded shrink-0">
																		Admin
																	</span>
																)}
																{route.external && (
																	<ExternalLinkIcon
																		className={sidebarItemIconStyles({
																			className: "size-3 shrink-0",
																		})}
																	/>
																)}
															</div>
														</Link>
													</li>
												)
											})}
									</ul>
								</li>
							))}
						</ul>
					</nav>
					<div className="grow">
						<Outlet />
					</div>
				</div>
			</Surface>
		</div>
	)
}
