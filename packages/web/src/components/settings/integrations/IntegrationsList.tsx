import { Check24Filled } from "@fluentui/react-icons";
import { type IntegrationMetadata, integrationMetadata } from "@lydie/integrations/client";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";

import { Eyebrow } from "@lydie/ui/components/layout/Eyebrow";
import { Link } from "@lydie/ui/components/generic/Link";
import { cardStyles } from "@/components/layout/Card";
import { useOrganization } from "@/context/organization.context";
import { getIntegrationIconUrl } from "@/utils/integration-icons";

export function IntegrationsList() {
  const { organization } = useOrganization();
  const [connections] = useQuery(
    queries.integrations.byOrganization({
      organizationId: organization.id,
    }),
  );

  const connectedIntegrationIds = new Set(
    connections?.filter((conn) => conn.status === "active").map((conn) => conn.integration_type),
  );

  // Split integrations into enabled and not enabled
  const connectedIntegrations = integrationMetadata.filter((integration) =>
    connectedIntegrationIds.has(integration.id),
  );

  const notConnectedIntegrations = integrationMetadata.filter(
    (integration) => !connectedIntegrationIds.has(integration.id),
  );

  return (
    <div className="flex flex-col gap-y-6">
      {connectedIntegrations.length > 0 && (
        <div className="flex flex-col gap-y-2">
          <Eyebrow>Enabled</Eyebrow>
          <ul className="flex flex-col gap-y-2">
            {connectedIntegrations.map((integration) => (
              <IntegrationsListItem
                key={integration.id}
                integration={integration}
                isEnabled={true}
              />
            ))}
          </ul>
        </div>
      )}
      {notConnectedIntegrations.length > 0 && (
        <div className="flex flex-col gap-y-2">
          <Eyebrow>Not Enabled</Eyebrow>
          <ul className="flex flex-col gap-y-2">
            {notConnectedIntegrations.map((integration) => (
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

type IntegrationsListItemProps = {
  integration: IntegrationMetadata;
  isEnabled: boolean;
};

export function IntegrationsListItem({ integration, isEnabled }: IntegrationsListItemProps) {
  const iconUrl = getIntegrationIconUrl(integration.id);
  const integrationRoute = `/w/$organizationSlug/settings/integrations/${integration.id}`;

  return (
    <li
      className={cardStyles({
        className: "hover:bg-black/1 transition-colors duration-75",
      })}
    >
      <Link to={integrationRoute} from="/w/$organizationSlug/settings/">
        <div className="flex flex-col gap-y-2 p-2.5">
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
            <h3 className="text-sm font-medium text-gray-950">{integration.name}</h3>
            {isEnabled && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-50 border border-green-200">
                <Check24Filled className="size-3 text-green-600" />
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
