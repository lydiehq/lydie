const ACTIVE_ORG_KEY = "lydie:active-organization";

/**
 * Get the currently active organization ID from localStorage
 */
export function getActiveOrganizationId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return localStorage.getItem(ACTIVE_ORG_KEY);
  } catch {
    return null;
  }
}

/**
 * Set the active organization ID in localStorage
 */
export function setActiveOrganizationId(organizationId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(ACTIVE_ORG_KEY, organizationId);
  } catch {
    // Silently fail - localStorage might be disabled
  }
}

/**
 * Clear the active organization ID from localStorage
 */
export function clearActiveOrganizationId(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(ACTIVE_ORG_KEY);
  } catch {
    // Silently fail
  }
}
