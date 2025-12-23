import type { Session } from "better-auth";

export type Context = Session & {
  isTrial?: boolean;
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

export function isTrialMode(session: Context | undefined): boolean {
  return session?.isTrial === true;
}

export function isAuthenticated(
  session: Context | undefined
): asserts session is Context {
  if (!session || !session.userId) {
    throw new Error("Session expired");
  }
}

export function isAuthenticatedOrTrial(
  session: Context | undefined
): void {
  if (isTrialMode(session)) {
    return;
  }
  isAuthenticated(session);
}

/**
 * Validates that a user has access to a specific organization
 * Uses the organizations array from the session (populated by customSession plugin)
 * to avoid additional database lookups for performance
 *
 * Special cases:
 * - Trial mode: allows operations without organization validation
 * - 'local' organization: allowed for anonymous users
 */
export function hasOrganizationAccess(
  session: Context | undefined,
  organizationId: string
): asserts session is Context & { userId: string } {
  // Allow operations in trial mode without organization validation
  if (isTrialMode(session)) {
    return;
  }

  // Allow local organization for anonymous users
  if (organizationId === "local") {
    return;
  }

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
