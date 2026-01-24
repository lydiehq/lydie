import type { Session } from "better-auth"

export type Context = Session & {
  role?: string
  organizations?: Array<{
    id: string
    name: string
    slug: string
    [key: string]: any
  }>
}

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    context: Context
  }
}

export function isAuthenticated(session: Context | undefined): asserts session is Context {
  if (!session || !session.userId) {
    throw new Error("Session expired")
  }
}

/**
 * Validates that a user has access to a specific organization
 * Uses the organizations array from the session (populated by customSession plugin)
 * to avoid additional database lookups for performance
 */
export function hasOrganizationAccess(
  session: Context | undefined,
  organizationId: string,
): asserts session is Context & { userId: string } {
  isAuthenticated(session)

  if (!session.organizations || session.organizations.length === 0) {
    throw new Error("No organization access")
  }

  const hasAccess = session.organizations.some((org) => org.id === organizationId)

  if (!hasAccess) {
    throw new Error(`Access denied: You do not have permission to access this workspace`)
  }
}

/**
 * Validates that a user has access to a specific organization by slug
 * Uses the organizations array from the session (populated by customSession plugin)
 * to avoid additional database lookups for performance
 */
export function hasOrganizationAccessBySlug(
  session: Context | undefined,
  organizationSlug: string,
): asserts session is Context & { userId: string } {
  isAuthenticated(session)

  if (!session.organizations || session.organizations.length === 0) {
    throw new Error("No workspace access")
  }

  const hasAccess = session.organizations.some((org) => org.slug === organizationSlug)

  if (!hasAccess) {
    throw new Error(`Access denied: You do not have permission to access this workspace`)
  }
}

/**
 * Validates organization access and returns both userId and organizationId
 * Useful for inline checks where you need both values
 */
export function requireOrganizationAccess(
  session: Context | undefined,
  organizationId: string,
): { userId: string; organizationId: string } {
  hasOrganizationAccess(session, organizationId)
  return { userId: session.userId, organizationId }
}

/**
 * Checks if the user has admin role
 * Uses the role from the session (populated by customSession plugin)
 * to avoid additional database lookups for performance
 */
export function isAdmin(session: Context | undefined): boolean {
  return session?.role === "admin"
}

/**
 * Validates that a user is an admin
 * Throws an error if the user is not authenticated or not an admin
 */
export function requireAdmin(session: Context | undefined): asserts session is Context {
  isAuthenticated(session)
  if (!isAdmin(session)) {
    throw new Error("Access denied: Admin privileges required")
  }
}
