import type { ExtendedSessionData } from "@/lib/auth/session";

type RecoveryDecision =
  | { type: "redirect-new" }
  | { type: "redirect-workspace"; organizationSlug: string }
  | { type: "not-found" };

function getFallbackOrganizationSlug(session: ExtendedSessionData["session"] | undefined) {
  const organizations = session?.organizations ?? [];

  if (organizations.length === 0) {
    return null;
  }

  const activeOrganizationSlug = session?.activeOrganizationSlug;

  if (
    activeOrganizationSlug &&
    organizations.some((organization: { slug: string }) => organization.slug === activeOrganizationSlug)
  ) {
    return activeOrganizationSlug;
  }

  return organizations[0]?.slug ?? null;
}

export function resolveOrganizationRecovery(
  requestedOrganizationSlug: string,
  session: ExtendedSessionData["session"] | undefined,
): RecoveryDecision {
  const fallbackOrganizationSlug = getFallbackOrganizationSlug(session);

  if (!fallbackOrganizationSlug) {
    return { type: "redirect-new" };
  }

  if (fallbackOrganizationSlug !== requestedOrganizationSlug) {
    return {
      type: "redirect-workspace",
      organizationSlug: fallbackOrganizationSlug,
    };
  }

  return { type: "not-found" };
}
