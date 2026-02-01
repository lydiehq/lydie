import { type QueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { type ReactNode, useEffect, useState } from "react";

import { sessionAtom, validatedAtom, errorAtom, isValidatingAtom } from "@/lib/auth/store";

interface AuthProviderProps {
  children: ReactNode;
  queryClient: QueryClient;
  fallback?: ReactNode;
}

/**
 * AuthProvider - Hybrid lazy auth with localStorage persistence
 *
 * This provider:
 * 1. Renders children immediately with cached data from localStorage (no undefined!)
 * 2. Lazily validates session with server in background when accessed
 * 3. Handles auth errors globally
 */
export function AuthProvider({ children, fallback }: AuthProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const setSession = useSetAtom(sessionAtom);
  const setValidated = useSetAtom(validatedAtom);
  const setError = useSetAtom(errorAtom);
  const setIsValidating = useSetAtom(isValidatingAtom);

  // Global error handler for 401s - triggers re-auth
  useEffect(() => {
    const handleUnauthorized = () => {
      // Clear the cached session to force re-validation
      setSession(null);
      setValidated(true);
      setError(null);
      setIsValidating(false);

      // Redirect to auth page
      window.location.href = "/auth";
    };

    // Listen for unauthorized events from API calls
    window.addEventListener("auth:unauthorized", handleUnauthorized);

    return () => {
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
    };
  }, [setSession, setValidated, setError, setIsValidating]);

  // Mark as ready immediately - session is already loaded from localStorage
  useEffect(() => {
    setIsReady(true);
  }, []);

  if (!isReady) {
    return fallback || null;
  }

  return <>{children}</>;
}
