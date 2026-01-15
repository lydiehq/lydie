import { IntegrationLinkList } from "@/components/integrations/IntegrationLinkList";
import { createFileRoute } from "@tanstack/react-router";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { SectionHeader } from "@/components/generic/SectionHeader";
import { useOrganization } from "@/context/organization.context";

export const Route = createFileRoute(
  "/__auth/w/$organizationSlug/settings/integrations/$integrationType/"
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { integrationType } = Route.useParams();
  const { organization } = useOrganization();

  const [integrationLinks] = useQuery(
    queries.integrationLinks.byIntegrationType({
      integrationType: integrationType,
      organizationId: organization.id,
    })
  );

  return (
    <div className="flex flex-col gap-y-2">
      <SectionHeader
        heading="Synced Links"
        description="Manage specific resources being synced from this integration."
        descriptionClassName="text-sm/relaxed text-gray-700"
      />
      <IntegrationLinkList
        links={integrationLinks}
        integrationType={integrationType}
        organizationId={organization.id}
      />
    </div>
  );
}
