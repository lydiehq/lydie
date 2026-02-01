import { useAuth as useAuthStore } from "@/lib/auth/store";

/**
 * @deprecated Use `useAuth` from `@/lib/auth/store` instead.
 * This wrapper maintains backward compatibility during migration.
 */
export function useAuth() {
  const { user, session, isAuthenticated, isValidating, access, refresh, logout } = useAuthStore();

  return {
    user,
    session,
    isAuthenticated,
    isLoading: isValidating,
    access,
    refresh,
    logout,
  };
}
