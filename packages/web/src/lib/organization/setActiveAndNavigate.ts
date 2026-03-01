import type { NavigateOptions } from "@tanstack/react-router";

import { authClient } from "@/utils/auth";

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
