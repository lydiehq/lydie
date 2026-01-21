import { getUserStorage, setUserStorage, removeUserStorage } from "./user-storage"

const ACTIVE_ORG_KEY = "lydie:active-organization"

export function getActiveOrganizationSlug(userId?: string | null): string | null {
  if (typeof window === "undefined") {
    return null
  }

  try {
    return getUserStorage(userId, ACTIVE_ORG_KEY)
  } catch {
    return null
  }
}

export function setActiveOrganizationSlug(organizationSlug: string, userId?: string | null): void {
  if (typeof window === "undefined") {
    return
  }

  try {
    setUserStorage(userId, ACTIVE_ORG_KEY, organizationSlug)
  } catch {
    // Ignore errors
  }
}

export function clearActiveOrganizationSlug(userId?: string | null): void {
  if (typeof window === "undefined") {
    return
  }

  try {
    removeUserStorage(userId, ACTIVE_ORG_KEY)
  } catch {
    // Ignore errors
  }
}
