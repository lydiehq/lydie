import { useOrganizationContext } from "./organization-provider";

/**
 * Hook to access the current organization from the $organizationSlug route.
 * This is synchronous - organization is always available when inside a workspace route.
 */
export function useOrganization() {
  const organization = useOrganizationContext();
  return { organization };
}
