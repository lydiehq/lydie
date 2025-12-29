import { createFileRoute, redirect } from "@tanstack/react-router";
import { listOrganizationsQuery } from "@/utils/auth";
import { getActiveOrganizationSlug } from "@/lib/active-organization";
import { getIntegrationMetadata } from "@lydie/integrations/client";
import { notFound } from "@tanstack/react-router";

export const Route = createFileRoute("/integrations/$integrationId/enable")({
  component: RouteComponent,
  beforeLoad: async ({ params, context }) => {
    const { integrationId } = params;

    // Verify integration exists
    const integration = getIntegrationMetadata(integrationId);
    if (!integration) {
      throw notFound();
    }

    // Check if user is authenticated
    if (!context.auth) {
      // Redirect to auth with redirect parameter
      throw redirect({
        to: "/auth",
        search: {
          redirect: `/integrations/${integrationId}/enable`,
        },
      });
    }

    // User is authenticated, get organization and redirect to integration page
    const { queryClient } = context;
    const activeOrganizationSlug = getActiveOrganizationSlug();

    if (activeOrganizationSlug) {
      throw redirect({
        to: "/w/$organizationSlug/settings/integrations/$integrationType",
        params: {
          organizationSlug: activeOrganizationSlug,
          integrationType: integrationId,
        },
      });
    }

    const organizations = await queryClient.ensureQueryData({
      ...listOrganizationsQuery,
    });

    if (organizations && organizations.length > 0) {
      const firstOrg = organizations[0];
      if (firstOrg.slug) {
        throw redirect({
          to: "/w/$organizationSlug/settings/integrations/$integrationType",
          params: {
            organizationSlug: firstOrg.slug,
            integrationType: integrationId,
          },
        });
      }
    }

    // No organizations found - redirect to onboarding
    throw redirect({ to: "/onboarding" });
  },
});

function RouteComponent() {
  return null; // This component should never render as we always redirect
}
