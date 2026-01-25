import { polarClient } from "@polar-sh/better-auth";
import { adminClient, customSessionClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL + "/internal/public/auth",
  fetchOptions: {
    credentials: "include",
  },
  plugins: [organizationClient(), customSessionClient(), polarClient(), adminClient()],
}) as ReturnType<typeof createAuthClient<typeof import("@lydie/core/auth").authClient>>;

export const listOrganizationsQuery = {
  queryKey: ["auth", "listOrganizations"],
  queryFn: async () => {
    const response = await authClient.organization.list();
    return response.data;
  },
};
