const ACTIVE_ORG_KEY = "lydie:active-organization";

/**
 * Get the currently active organization slug from localStorage
 */
export function getActiveOrganizationSlug(): string | null {
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
 * Set the active organization slug in localStorage
 */
export function setActiveOrganizationSlug(organizationSlug: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(ACTIVE_ORG_KEY, organizationSlug);
  } catch {
    // Silently fail - localStorage might be disabled
  }
}

/**
 * Clear the active organization slug from localStorage
 */
export function clearActiveOrganizationSlug(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(ACTIVE_ORG_KEY);
  } catch {
    // Silently fail
  }
}
