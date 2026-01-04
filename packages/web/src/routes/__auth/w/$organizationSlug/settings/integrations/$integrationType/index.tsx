import { IntegrationLinkList } from "@/components/integrations/IntegrationLinkList";
import { createFileRoute } from "@tanstack/react-router";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { Heading } from "@/components/generic/Heading";
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
      organizationId: organization?.id || "",
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
        organizationId={organization?.id || ""}
      />
    </div>
  );
}
