import { useQuery } from "@rocicorp/zero/react";
import { CheckCircle2, Github } from "lucide-react";
import { queries } from "@lydie/zero/queries";
import {
  integrationMetadata,
  type IntegrationMetadata,
} from "@lydie/integrations/client";
import { getIntegrationIconUrl } from "@/utils/integration-icons";
import { Heading } from "@/components/generic/Heading";
import { Link } from "@/components/generic/Link";
import { cardStyles } from "@/components/layout/Card";
import { useOrganization } from "@/context/organization.context";

type IntegrationsListItemProps = {
  integration: IntegrationMetadata;
  connections: any[] | null | undefined;
};

export function IntegrationsListItem({
  integration,
  connections,
}: IntegrationsListItemProps) {
  const enabledConnection = connections?.find(
    (conn) => conn.integration_type === integration.id && conn.enabled === true
  );
  const isTurnedOn = !!enabledConnection;
  const iconUrl = getIntegrationIconUrl(integration.id);

  return (
    <li className={cardStyles({ className: "p-2.5" })}>
      <Link
        to="/w/$organizationId/settings/integrations/$integrationId"
        params={{ integrationId: integration.id }}
        from="/w/$organizationId/settings/"
      >
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
            {isTurnedOn && (
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

  // Split integrations into enabled and not enabled
  const enabledIntegrations = integrationMetadata.filter((integration) => {
    const enabledConnection = connections?.find(
      (conn) =>
        conn.integration_type === integration.id && conn.enabled === true
    );
    return !!enabledConnection;
  });

  const notEnabledIntegrations = integrationMetadata.filter((integration) => {
    const enabledConnection = connections?.find(
      (conn) =>
        conn.integration_type === integration.id && conn.enabled === true
    );
    return !enabledConnection;
  });

  return (
    <div className="flex flex-col gap-y-6">
      {enabledIntegrations.length > 0 && (
        <div className="flex flex-col gap-y-2">
          <Heading level={3}>Enabled</Heading>
          <ul className="flex flex-col gap-y-2">
            {enabledIntegrations.map((integration) => (
              <IntegrationsListItem
                key={integration.id}
                integration={integration}
                connections={connections}
              />
            ))}
          </ul>
        </div>
      )}
      {notEnabledIntegrations.length > 0 && (
        <div className="flex flex-col gap-y-2">
          <Heading level={3}>Not Enabled</Heading>
          <ul className="flex flex-col gap-y-2">
            {notEnabledIntegrations.map((integration) => (
              <IntegrationsListItem
                key={integration.id}
                integration={integration}
                connections={connections}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
