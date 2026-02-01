import { polarClient } from "@polar-sh/better-auth";
import { adminClient, customSessionClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL + "/internal/public/auth",
  fetchOptions: {
    credentials: "include",
  },
  plugins: [organizationClient(), customSessionClient(), polarClient(), adminClient()],
});

export type SessionData = Awaited<ReturnType<typeof authClient.getSession>>["data"];

export type ExtendedSession = SessionData & {
  session?: {
    organizations?: Array<{
      id: string;
      name: string;
      slug: string;
      [key: string]: any;
    }>;
  };
};
