import { IntegrationActivityLog } from "@/components/integrations/IntegrationActivityLog";
import { createFileRoute } from "@tanstack/react-router";
import { Route as IntegrationRoute } from "@/routes/_auth/w/$organizationId/settings/integrations/$integrationType/route";
import { useQuery } from "@rocicorp/zero/react";
import { queries } from "@lydie/zero/queries";

export const Route = createFileRoute(
  "/_auth/w/$organizationId/settings/integrations/$integrationType/activity"
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { organizationId } = Route.useParams();
  const { integrationDetails } = IntegrationRoute.useLoaderData();
  const [activityLogs] = useQuery(
    queries.integrationActivityLogs.byIntegrationType({
      integrationType: integrationDetails.id,
      organizationId: organizationId,
    })
  );
  return (
    <div>
      <IntegrationActivityLog logs={activityLogs} />
    </div>
  );
}
