import { queries } from "@lydie/zero/queries";
import { Route } from "@/routes/__auth/w/$organizationSlug/route";
import type { QueryResultType } from "@rocicorp/zero";

export function useOrganization() {
  const { organization } = Route.useRouteContext();
  return { organization };
}
