import type { AppType } from "@lydie/backend/api";

import { hc } from "hono/client";
import { useSetAtom } from "jotai";
import { useCallback } from "react";

import { useOrganization } from "@/context/organization.context";
import { sessionAtom, validatedAtom, errorAtom, isValidatingAtom } from "@/lib/auth/store";

// Global event for unauthorized errors
export function emitUnauthorized() {
  window.dispatchEvent(new CustomEvent("auth:unauthorized"));
}

// Custom fetch wrapper that handles auth errors
// Note: This is a factory function that creates the actual fetch function with access to atom setters
function createFetchWithAuth(clearSession: () => void) {
  return async function fetchWithAuth(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const response = await fetch(input, {
      ...init,
      credentials: "include", // Always include cookies
    });

    // Handle 401 Unauthorized
    if (response.status === 401) {
      // Clear the session cache to force re-validation
      clearSession();

      // Emit unauthorized event
      emitUnauthorized();

      // Don't throw here - let the caller handle it
      // This allows for custom error handling per request
    }

    return response;
  };
}

export const useAuthenticatedApi = () => {
  const { organization } = useOrganization();
  const setSession = useSetAtom(sessionAtom);
  const setValidated = useSetAtom(validatedAtom);
  const setError = useSetAtom(errorAtom);
  const setIsValidating = useSetAtom(isValidatingAtom);

  const clearSession = useCallback(() => {
    setSession(null);
    setValidated(true);
    setError(null);
    setIsValidating(false);
  }, [setSession, setValidated, setError, setIsValidating]);

  const createClient = useCallback(async () => {
    const fetchWithAuth = createFetchWithAuth(clearSession);

    return hc<AppType>(import.meta.env.VITE_API_URL, {
      fetch: fetchWithAuth,
      headers: {
        "Content-Type": "application/json",
        "X-Organization-Id": organization.id,
      },
    });
  }, [organization.id, clearSession]);

  return {
    createClient,
  };
};

// Non-hook version for use outside React components
// Note: This version cannot clear the session on 401 - that must be handled by the calling code
export function createAuthenticatedApiClient(organizationId: string) {
  return hc<AppType>(import.meta.env.VITE_API_URL, {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await fetch(input, {
        ...init,
        credentials: "include",
      });

      if (response.status === 401) {
        // Emit unauthorized event - the AuthProvider will handle clearing state
        emitUnauthorized();
      }

      return response;
    },
    headers: {
      "Content-Type": "application/json",
      "X-Organization-Id": organizationId,
    },
  });
}
