import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import "@fontsource-variable/dm-sans"

export const Route = createFileRoute("/_landing")({
	component: RouteComponent,
	beforeLoad: ({ context }) => {
		if (context.auth) {
			throw redirect({
				to: "/",
			})
		}
		// if (context.auth) {
		//   const lastWorkspace =
		//     getLastActiveWorkspace() ?? account.workspaces[0].slug;
		//   throw redirect({
		//     to: "/org/$workspace",
		//     params: { workspace: lastWorkspace },
		//   });
		// }
	},
})

function RouteComponent() {
	return <Outlet />
}
