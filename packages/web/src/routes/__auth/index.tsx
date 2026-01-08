import { createFileRoute, redirect } from "@tanstack/react-router";
import { listOrganizationsQuery } from "@/utils/auth";
import { getActiveOrganizationSlug } from "@/lib/active-organization";

export const Route = createFileRoute("/__auth/")({
  component: RouteComponent,
  beforeLoad: async ({ context: { queryClient, auth } }) => {
    const userId = auth?.session?.userId;
    const activeOrganizationSlug = getActiveOrganizationSlug(userId);

    if (activeOrganizationSlug) {
      throw redirect({
        to: "/w/$organizationSlug",
        params: { organizationSlug: activeOrganizationSlug },
      });
    }

    const organizations = await queryClient.ensureQueryData({
      ...listOrganizationsQuery,
    });

    if (organizations && organizations.length > 0) {
      const firstOrg = organizations[0];
      throw redirect({
        to: "/w/$organizationSlug",
        params: { organizationSlug: firstOrg.slug },
      });
    }

    // No organizations found - redirect to onboarding to create one
    throw redirect({ to: "/onboarding" });
  },
});

function RouteComponent() {
  return <div></div>;
}
