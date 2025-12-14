import { createFileRoute, redirect } from "@tanstack/react-router";
import { listOrganizationsQuery } from "@/utils/auth";
import { getActiveOrganizationId } from "@/lib/active-organization";

export const Route = createFileRoute("/__auth/")({
  component: RouteComponent,
  beforeLoad: async ({ context: { queryClient } }) => {
    const activeOrganizationId = getActiveOrganizationId();

    if (activeOrganizationId) {
      throw redirect({
        to: "/w/$organizationId",
        params: { organizationId: activeOrganizationId },
      });
    }

    const organizations = await queryClient.ensureQueryData({
      ...listOrganizationsQuery,
    });

    if (organizations && organizations.length > 0) {
      throw redirect({
        to: "/w/$organizationId",
        params: { organizationId: organizations[0].id },
      });
    }

    // No organizations found - redirect to onboarding to create one
    throw redirect({ to: "/onboarding" });
  },
});

function RouteComponent() {
  return <div></div>;
}
