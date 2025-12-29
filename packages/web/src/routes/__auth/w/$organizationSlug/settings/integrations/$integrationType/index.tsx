import { IntegrationLinkList } from "@/components/integrations/IntegrationLinkList";
import { createFileRoute } from "@tanstack/react-router";
import { Route as IntegrationRoute } from "@/routes/__auth/w/$organizationSlug/settings/integrations/$integrationType/route";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { Heading } from "@/components/generic/Heading";

export const Route = createFileRoute(
  "/__auth/w/$organizationSlug/settings/integrations/$integrationType/"
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { organizationId } = Route.useParams();
  const { integrationType } = IntegrationRoute.useParams();

  const [integrationLinks] = useQuery(
    queries.integrationLinks.byIntegrationType({
      integrationType: integrationType,
      organizationId: organizationId,
    })
  );

  return (
    <div className="flex flex-col gap-y-2">
      <div className="flex flex-col gap-y-0.5">
        <Heading level={2}>Synced Links</Heading>
        <p className="text-sm/relaxed text-gray-700">
          Manage specific resources being synced from this integration.
        </p>
      </div>
      <IntegrationLinkList
        links={integrationLinks}
        integrationType={integrationType}
        organizationId={organizationId}
      />
    </div>
  );
}
