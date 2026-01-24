import { authClient } from "@/utils/auth"
import type { NavigateOptions } from "@tanstack/react-router"

/**
 * Sets the active organization in better-auth and optionally navigates to it.
 * This ensures the active organization is set before navigation happens.
 */
export async function setActiveOrganizationAndNavigate(
  organizationId: string,
  navigate: (options: NavigateOptions) => void | Promise<void>,
  navigateOptions: NavigateOptions,
) {
  // Set active organization first and wait for it to complete
  await authClient.organization.setActive({
    organizationId,
  })

  // Then navigate to the organization
  await navigate(navigateOptions)
}
