import { queries } from "@lydie/zero/queries";
import { createFileRoute } from "@tanstack/react-router";

import { Heading } from "@/components/generic/Heading";
import { Separator } from "@/components/generic/Separator";
import { IntegrationsList } from "@/components/settings/integrations/IntegrationsList";

export const Route = createFileRoute("/__auth/w/$organizationSlug/settings/integrations/")({
  component: RouteComponent,
  loader: async ({ context }) => {
    const { zero, organization } = context;
    // Preload all integration connections for the organization
    zero.run(queries.integrations.byOrganization({ organizationId: organization.id }));
  },
  ssr: false,
});

function RouteComponent() {
  return (
    <div className="flex flex-col gap-y-6">
      <div className="flex flex-col gap-y-1">
        <Heading level={1}>Integrations</Heading>
        <p className="text-sm/relaxed text-gray-600 mt-1">
          Connect external platforms to sync your documents when published.
        </p>
      </div>
      <Separator />
      <IntegrationsList />
    </div>
  );
}
