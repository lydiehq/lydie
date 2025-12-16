import { Button } from "@/components/generic/Button";
import { Separator } from "@/components/generic/Separator";
import { Heading } from "@/components/generic/Heading";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { queries } from "@lydie/zero/queries";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  Github,
  CheckCircle2,
  XCircle,
  Link as LinkIcon,
} from "lucide-react";

export const Route = createFileRoute(
  "/__auth/w/$organizationId/settings/integrations/$integrationId"
)({
  component: RouteComponent,
  loader: async ({ context, params }) => {
    const { zero } = context;
    zero.run(
      queries.integrationLinks.byId({
        linkId: params.integrationId,
        organizationId: params.organizationId,
      })
    );
  },
  ssr: false,
});

function RouteComponent() {
  const { integrationId, organizationId } = Route.useParams();
  const navigate = useNavigate();

  const [extensionLink, status] = useQuery(
    queries.integrationLinks.byId({
      linkId: integrationId,
      organizationId: organizationId || "",
    })
  );

  if (!extensionLink && status.type === "complete") {
    return (
      <div className="flex flex-col gap-y-4">
        <div className="text-sm text-gray-500">Extension link not found</div>
        <Button
          onPress={() => {
            navigate({
              to: "/w/$organizationId/settings/extensions/",
              params: { organizationId: organizationId || "" },
            });
          }}
          size="sm"
          intent="secondary"
        >
          <ArrowLeft className="size-3.5 mr-1" />
          Back to Extensions
        </Button>
      </div>
    );
  }

  if (!extensionLink) return null;

  const connection = extensionLink.connection;
  const config = extensionLink.config as any;
  const isEnabled = extensionLink.enabled && (connection?.enabled ?? false);

  const getStatusIcon = (enabled: boolean, status?: string) => {
    if (!enabled) return <XCircle className="size-4 text-gray-400" />;

    switch (status) {
      case "revoked":
        return <XCircle className="size-4 text-red-600" />;
      case "error":
        return <XCircle className="size-4 text-orange-600" />;
      case "suspended":
        return <XCircle className="size-4 text-amber-600" />;
      case "active":
      default:
        return <CheckCircle2 className="size-4 text-green-600" />;
    }
  };

  const getStatusText = (
    enabled: boolean,
    status?: string,
    statusMessage?: string
  ) => {
    if (!enabled) return "Disabled";

    switch (status) {
      case "revoked":
        return "Access Revoked";
      case "error":
        return statusMessage || "Error";
      case "suspended":
        return "Suspended";
      case "active":
      default:
        return "Active";
    }
  };

  const getIntegrationIcon = (type: string) => {
    switch (type) {
      case "github":
        return <Github className="size-4" />;
      default:
        return <LinkIcon className="size-4" />;
    }
  };

  return (
    <div className="flex flex-col gap-y-6">
      <div className="flex items-center gap-3">
        <Button
          onPress={() => {
            navigate({
              to: "/w/$organizationId/settings/integrations",
            });
          }}
          size="sm"
          intent="secondary"
        >
          <ArrowLeft className="size-3.5 mr-1" />
          Back
        </Button>
        <div>
          <Heading level={1}>{extensionLink.name}</Heading>
          <p className="text-sm/relaxed text-gray-600 mt-1">
            Extension link settings and configuration
          </p>
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-y-6">
        {/* Status Section */}
        <div>
          <h2 className="text-md/none font-medium mb-3">Status</h2>
          <div className="rounded-lg ring-1 ring-black/10 bg-white p-4">
            <div className="flex items-center gap-2">
              {getStatusIcon(isEnabled, (connection as any)?.status)}
              <span className="text-sm font-medium">
                {getStatusText(
                  isEnabled,
                  (connection as any)?.status,
                  (connection as any)?.status_message
                )}
              </span>
            </div>
            {extensionLink.last_synced_at && (
              <div className="text-xs text-gray-500 mt-2">
                Last synced{" "}
                {formatDistanceToNow(extensionLink.last_synced_at, {
                  addSuffix: true,
                })}
              </div>
            )}
          </div>
        </div>

        {/* Connection Info */}
        {connection && (
          <div>
            <h2 className="text-md/none font-medium mb-3">Connection</h2>
            <div className="rounded-lg ring-1 ring-black/10 bg-white p-4">
              <div className="flex items-center gap-2 mb-2">
                {getIntegrationIcon(connection.integration_type)}
                <span className="text-sm font-medium capitalize">
                  {connection.integration_type}
                </span>
              </div>
              <div className="text-xs text-gray-500">
                Connection ID: {connection.id}
              </div>
            </div>
          </div>
        )}

        {/* Configuration */}
        <div>
          <h2 className="text-md/none font-medium mb-3">Configuration</h2>
          <div className="rounded-lg ring-1 ring-black/10 bg-white p-4">
            <div className="flex flex-col gap-y-3">
              {config.owner && config.repo && (
                <div>
                  <div className="text-xs text-gray-500 mb-1">Repository</div>
                  <code className="text-sm text-gray-700">
                    {config.owner}/{config.repo}
                  </code>
                </div>
              )}
              {config.branch && (
                <div>
                  <div className="text-xs text-gray-500 mb-1">Branch</div>
                  <code className="text-sm text-gray-700">{config.branch}</code>
                </div>
              )}
              {config.basePath && (
                <div>
                  <div className="text-xs text-gray-500 mb-1">Base Path</div>
                  <code className="text-sm text-gray-700">
                    {config.basePath}
                  </code>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Link Details */}
        <div>
          <h2 className="text-md/none font-medium mb-3">Link Details</h2>
          <div className="rounded-lg ring-1 ring-black/10 bg-white p-4">
            <div className="flex flex-col gap-y-3">
              <div>
                <div className="text-xs text-gray-500 mb-1">Link ID</div>
                <code className="text-sm text-gray-700">
                  {extensionLink.id}
                </code>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Name</div>
                <div className="text-sm text-gray-700">
                  {extensionLink.name}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Enabled</div>
                <div className="text-sm text-gray-700">
                  {extensionLink.enabled ? "Yes" : "No"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
