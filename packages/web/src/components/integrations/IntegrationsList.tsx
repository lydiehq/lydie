import { useQuery } from "@rocicorp/zero/react";
import { CheckCircle2 } from "lucide-react";
import { queries } from "@lydie/zero/queries";
import {
  integrationMetadata,
  type IntegrationMetadata,
} from "@lydie/integrations/client";
import { getIntegrationIconUrl } from "@/utils/integration-icons";
import { Link } from "@/components/generic/Link";
import { cardStyles } from "@/components/layout/Card";
import { useOrganization } from "@/context/organization.context";
import { Eyebrow } from "../generic/Eyebrow";

const integrationRoutes = {
  github: "/w/$organizationId/settings/integrations/github",
  shopify: "/w/$organizationId/settings/integrations/shopify",
  wordpress: "/w/$organizationId/settings/integrations/wordpress",
} as const;

type IntegrationsListItemProps = {
  integration: IntegrationMetadata;
  isEnabled: boolean;
};

export function IntegrationsListItem({
  integration,
  isEnabled,
}: IntegrationsListItemProps) {
  const iconUrl = getIntegrationIconUrl(integration.id);
  const integrationRoute =
    integrationRoutes[integration.id as keyof typeof integrationRoutes] ??
    "/w/$organizationId/settings/integrations";

  return (
    <li className={cardStyles({ className: "p-2.5" })}>
      <Link to={integrationRoute} from="/w/$organizationId/settings/">
        <div className="flex flex-col gap-y-2">
          <div className="flex items-center gap-x-2">
            <div className="rounded-md ring ring-black/6 p-[2px]">
              {iconUrl ? (
                <img
                  src={iconUrl}
                  alt={`${integration.name} icon`}
                  className="rounded-[5px] size-7"
                />
              ) : (
                <div className="rounded-sm size-7 bg-gray-100" />
              )}
            </div>
            <h3 className="text-sm font-medium text-gray-950">
              {integration.name}
            </h3>
            {isEnabled && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-50 border border-green-200">
                <CheckCircle2 className="size-3 text-green-600" />
                <span className="text-xs font-medium text-green-700">On</span>
              </div>
            )}
          </div>
          <p className="text-sm text-gray-600">{integration.description}</p>
        </div>
      </Link>
    </li>
  );
}

export function IntegrationsList() {
  const { organization } = useOrganization();
  const [connections] = useQuery(
    queries.integrations.byOrganization({
      organizationId: organization?.id || "",
    })
  );

  const enabledIntegrationIds = new Set(
    connections
      ?.filter((conn) => conn.enabled === true)
      .map((conn) => conn.integration_type)
  );

  // Split integrations into enabled and not enabled
  const enabledIntegrations = integrationMetadata.filter((integration) =>
    enabledIntegrationIds.has(integration.id)
  );

  const notEnabledIntegrations = integrationMetadata.filter(
    (integration) => !enabledIntegrationIds.has(integration.id)
  );

  return (
    <div className="flex flex-col gap-y-6">
      {enabledIntegrations.length > 0 && (
        <div className="flex flex-col gap-y-2">
          <Eyebrow>Enabled</Eyebrow>
          <ul className="flex flex-col gap-y-2">
            {enabledIntegrations.map((integration) => (
              <IntegrationsListItem
                key={integration.id}
                integration={integration}
                isEnabled={true}
              />
            ))}
          </ul>
        </div>
      )}
      {notEnabledIntegrations.length > 0 && (
        <div className="flex flex-col gap-y-2">
          <Eyebrow>Not Enabled</Eyebrow>
          <ul className="flex flex-col gap-y-2">
            {notEnabledIntegrations.map((integration) => (
              <IntegrationsListItem
                key={integration.id}
                integration={integration}
                isEnabled={false}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
