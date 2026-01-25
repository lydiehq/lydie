import { Route } from "@/routes/__auth/w/$organizationSlug/route";

export function useOrganization() {
  const { organization } = Route.useRouteContext();
  return { organization };
}
