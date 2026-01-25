import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";

import { IntegrationActivityLog } from "@/components/settings/integrations/IntegrationActivityLog";
import { useOrganization } from "@/context/organization.context";

export const Route = createFileRoute(
  "/__auth/w/$organizationSlug/settings/integrations/$integrationType/activity",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { integrationType } = Route.useParams();
  const { organization } = useOrganization();
  const [activityLogs] = useQuery(
    queries.integrationActivityLogs.byIntegrationType({
      integrationType,
      organizationId: organization.id,
    }),
  );
  return (
    <div>
      <IntegrationActivityLog logs={activityLogs} />
    </div>
  );
}
