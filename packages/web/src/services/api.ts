import { hc } from "hono/client";
import type { AppType } from "@lydie/backend/api";
import { useOrganization } from "@/context/organization.context";

export const useAuthenticatedApi = () => {
  const { organization } = useOrganization();

  const createClient = async () => {
    return hc<AppType>(import.meta.env.VITE_API_URL, {
      init: {
        credentials: "include",
      },
      headers: {
        // Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Organization-Id": organization?.id || "",
      },
    });
  };

  return {
    createClient,
  };
};
