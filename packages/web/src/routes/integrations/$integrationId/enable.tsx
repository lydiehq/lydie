import { createFileRoute, redirect } from "@tanstack/react-router";
import { listOrganizationsQuery } from "@/utils/auth";
import { getActiveOrganizationId } from "@/lib/active-organization";
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
    const activeOrganizationId = getActiveOrganizationId();

    if (activeOrganizationId) {
      throw redirect({
        to: "/w/$organizationId/settings/integrations/$integrationType",
        params: {
          organizationId: activeOrganizationId,
          integrationType: integrationId,
        },
      });
    }

    const organizations = await queryClient.ensureQueryData({
      ...listOrganizationsQuery,
    });

    if (organizations && organizations.length > 0) {
      throw redirect({
        to: "/w/$organizationId/settings/integrations/$integrationType",
        params: {
          organizationId: organizations[0].id,
          integrationType: integrationId,
        },
      });
    }

    // No organizations found - redirect to onboarding
    throw redirect({ to: "/onboarding" });
  },
});

function RouteComponent() {
  return null; // This component should never render as we always redirect
}

