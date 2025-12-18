import { Heading } from "@/components/generic/Heading";
import { Separator } from "@/components/generic/Separator";
import { createFileRoute } from "@tanstack/react-router";
import { IntegrationsList } from "@/components/integrations/IntegrationsList";

export const Route = createFileRoute(
  "/__auth/w/$organizationId/settings/integrations/"
)({
  component: RouteComponent,
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
