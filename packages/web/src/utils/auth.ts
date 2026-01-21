import { createAuthClient } from "better-auth/react"
import { organizationClient, customSessionClient, adminClient } from "better-auth/client/plugins"
import { polarClient } from "@polar-sh/better-auth"

export const authClient = createAuthClient({
	baseURL: import.meta.env.VITE_API_URL + "/internal/public/auth",
	fetchOptions: {
		credentials: "include",
	},
	plugins: [organizationClient(), customSessionClient(), polarClient(), adminClient()],
})

export const listOrganizationsQuery = {
	queryKey: ["auth", "listOrganizations"],
	queryFn: async () => {
		const response = await authClient.organization.list()
		return response.data
	},
}
