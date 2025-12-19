import type { Session } from "better-auth";

export type Context = Session & {
  organizations?: Array<{
    id: string;
    name: string;
    slug: string | null;
    [key: string]: any;
  }>;
};

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    context: Context;
  }
}

export function isAuthenticated(
  session: Context | undefined
): asserts session is Context {
  console.log("isAuthenticated", session);
  if (!session || !session.userId) {
    throw new Error("Session expired");
  }
}

/**
 * Validates that a user has access to a specific organization
 * Uses the organizations array from the session (populated by customSession plugin)
 * to avoid additional database lookups for performance
 */
export function hasOrganizationAccess(
  session: Context | undefined,
  organizationId: string
): asserts session is Context & { userId: string } {
  isAuthenticated(session);

  if (!session.organizations || session.organizations.length === 0) {
    throw new Error("No organization access");
  }

  const hasAccess = session.organizations.some(
    (org) => org.id === organizationId
  );

  if (!hasAccess) {
    throw new Error(
      `Access denied: You do not have permission to access this organization`
    );
  }
}

/**
 * Validates organization access and returns both userId and organizationId
 * Useful for inline checks where you need both values
 */
export function requireOrganizationAccess(
  session: Context | undefined,
  organizationId: string
): { userId: string; organizationId: string } {
  hasOrganizationAccess(session, organizationId);
  return { userId: session.userId, organizationId };
}
