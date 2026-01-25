import type { NavigateOptions } from "@tanstack/react-router";

import { authClient } from "@/utils/auth";

// Sets the active organization in better-auth and optionally navigates to it.
// This ensures the active organization is set before navigation happens.
export async function setActiveOrganizationAndNavigate(
  organizationId: string,
  navigate: (options: NavigateOptions) => void | Promise<void>,
  navigateOptions: NavigateOptions,
) {
  await authClient.organization.setActive({
    organizationId,
  });

  await navigate(navigateOptions);
}
