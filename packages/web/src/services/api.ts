import type { AppType } from "@lydie/backend/api";

import { hc } from "hono/client";
import { useCallback } from "react";

import { useOrganization } from "@/context/organization.context";

export const useAuthenticatedApi = () => {
  const { organization } = useOrganization();

  const createClient = useCallback(async () => {
    return hc<AppType>(import.meta.env.VITE_API_URL, {
      init: {
        credentials: "include",
      },
      headers: {
        "Content-Type": "application/json",
        "X-Organization-Id": organization.id,
      },
    });
  }, [organization.id]);

  return {
    createClient,
  };
};
