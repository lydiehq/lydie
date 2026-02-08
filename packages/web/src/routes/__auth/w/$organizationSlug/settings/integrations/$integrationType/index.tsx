import { SectionHeader } from "@lydie/ui/components/layout/SectionHeader";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";

import { IntegrationLinkList } from "@/components/settings/integrations/IntegrationLinkList";
import { useOrganization } from "@/context/organization.context";
import { useDocumentTitle } from "@/hooks/use-document-title";

export const Route = createFileRoute(
  "/__auth/w/$organizationSlug/settings/integrations/$integrationType/",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { integrationType } = Route.useParams();
  const { organization } = useOrganization();

  // Capitalize first letter for title
  const integrationName = integrationType.charAt(0).toUpperCase() + integrationType.slice(1);
  useDocumentTitle(`${integrationName} Integration`);

  const [integrationLinks] = useQuery(
    queries.integrationLinks.byIntegrationType({
      integrationType: integrationType,
      organizationId: organization.id,
    }),
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
