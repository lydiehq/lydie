import { useNavigate } from "@tanstack/react-router";
import { atom, useAtom, useAtomValue } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useCallback, useEffect, useState } from "react";

import { authClient, type ExtendedSession } from "@/utils/auth";

// Persisted atom for session - immediately available from localStorage
// This eliminates the "undefined" state that was causing errors
const sessionAtom = atomWithStorage<ExtendedSession | null>("lydie:session", null, undefined, {
  getOnInit: true, // Get from storage immediately on init
});

// Track if we've validated the cached session with the server
const validatedAtom = atom<boolean>(false);
const isValidatingAtom = atom<boolean>(false);
const errorAtom = atom<Error | null>(null);

// Helper to check if persisted session might be stale (5-min cookie cache)
function isSessionStale(session: ExtendedSession | null): boolean {
  if (!session?.session) return true;

  const expiresAt = session.session.expiresAt;
  if (!expiresAt) return false;

  const expirationTime = new Date(expiresAt).getTime();
  const now = Date.now();
  const fourMinutes = 4 * 60 * 1000;

  return now > expirationTime - fourMinutes;
}

// Force refresh session from server
async function fetchSession(): Promise<ExtendedSession | null> {
  const response = await authClient.getSession();
  return response.data as ExtendedSession;
}

// React hook for using auth in components
export function useAuth() {
  const navigate = useNavigate();
  const [session, setSession] = useAtom(sessionAtom);
  const [validated, setValidated] = useAtom(validatedAtom);
  const [isValidating, setIsValidating] = useAtom(isValidatingAtom);
  const [error, setError] = useAtom(errorAtom);

  // access() - Validates the cached session with the server (lazy)
  const access = useCallback(async () => {
    // If already validating, wait for it
    if (isValidating) {
      return session;
    }

    // If we have a valid cached session and it's not stale, return it
    if (session && !isSessionStale(session) && validated) {
      return session;
    }

    // Validate with server in background
    setIsValidating(true);
    setError(null);

    try {
      const newSession = await fetchSession();
      setSession(newSession);
      setValidated(true);
      setIsValidating(false);
      return newSession;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to access session");
      setSession(null);
      setValidated(true);
      setIsValidating(false);
      setError(error);
      return null;
    }
  }, [session, validated, isValidating, setSession, setValidated, setIsValidating, setError]);

  // refresh() - Force refresh from server
  const refresh = useCallback(async () => {
    setIsValidating(true);
    setError(null);

    try {
      const newSession = await fetchSession();
      setSession(newSession);
      setValidated(true);
      setIsValidating(false);
      return newSession;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to refresh session");
      setSession(null);
      setValidated(true);
      setIsValidating(false);
      setError(error);
      return null;
    }
  }, [setSession, setValidated, setIsValidating, setError]);

  const logout = useCallback(async () => {
    try {
      await authClient.signOut();
    } catch (err) {
      console.error("Sign out error:", err);
    } finally {
      setSession(null);
      setValidated(true);
      setIsValidating(false);
      setError(null);
      await navigate({ to: "/auth" });
    }
  }, [setSession, setValidated, setIsValidating, setError, navigate]);

  const switchOrganization = useCallback(
    async (organizationId: string) => {
      setIsValidating(true);
      setError(null);

      try {
        await authClient.organization.setActive({
          organizationId,
        });
        const newSession = await fetchSession();
        setSession(newSession);
        setIsValidating(false);
        return newSession;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to switch organization");
        setIsValidating(false);
        setError(error);
        return null;
      }
    },
    [setSession, setIsValidating, setError],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, [setError]);

  return {
    // State - always defined, no more undefined checks needed!
    session,
    isValidating,
    error,
    isAuthenticated: !!session?.session,
    user: session?.user,
    organizations: session?.session?.organizations || [],
    activeOrganizationId: session?.session?.activeOrganizationId,
    activeOrganizationSlug: session?.session?.activeOrganizationSlug,

    // Actions
    access,
    refresh,
    logout,
    switchOrganization,
    clearError,
  };
}

// Utility for API calls that need auth
export async function getAccessToken(): Promise<string | null> {
  // This is a bit tricky with Jotai since we need to access the atom value outside React
  // For now, we'll return a placeholder - the actual auth is handled via cookies
  // Components should use the useAuth hook instead
  return "cookie-based";
}

// Check if current session is valid (for route guards)
export async function requireAuth(): Promise<ExtendedSession> {
  throw new Error("requireAuth should be called from useAuth().access() instead");
}

// Hook to check if auth is validated with server
export function useAuthValidated() {
  return useAtomValue(validatedAtom);
}

// Hook to check if user is authenticated (triggers lazy load)
export function useAuthenticated() {
  const session = useAtomValue(sessionAtom);
  const access = useAuth().access;
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const s = await access();
      if (!cancelled) {
        setIsAuthed(!!s?.session);
      }
    };

    // Always have a value immediately from localStorage (no undefined!)
    setIsAuthed(!!session?.session);

    // Validate in background
    check();

    return () => {
      cancelled = true;
    };
  }, [session, access]);

  return isAuthed;
}

// Direct atom exports for advanced use cases
export { sessionAtom, validatedAtom, isValidatingAtom, errorAtom };
