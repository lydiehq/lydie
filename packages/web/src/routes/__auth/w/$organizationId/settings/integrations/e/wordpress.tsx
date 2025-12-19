import { Button } from "@/components/generic/Button";
import { Card } from "@/components/layout/Card";
import { Separator } from "@/components/generic/Separator";
import { Heading } from "@/components/generic/Heading";
import { mutators } from "@lydie/zero/mutators";
import { confirmDialog } from "@/stores/confirm-dialog";
import { formatDistanceToNow } from "date-fns";
import { getIntegrationIconUrl } from "@/utils/integration-icons";
import { createFileRoute } from "@tanstack/react-router";
import {
  DialogTrigger,
  MenuTrigger,
  Button as RACButton,
  Input,
  Label,
  TextField,
} from "react-aria-components";
import { Modal } from "@/components/generic/Modal";
import { Dialog } from "@/components/generic/Dialog";
import { Menu, MenuItem } from "@/components/generic/Menu";
import { RadioGroup, Radio } from "@/components/generic/RadioGroup";
import {
  Plus,
  MoreHorizontal,
  CheckCircle2,
  XCircle,
  Link as LinkIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { useQuery } from "@rocicorp/zero/react";
import { useZero } from "@/services/zero";
import { queries } from "@lydie/zero/queries";
import { useOrganization } from "@/context/organization.context";
import { useAuthenticatedApi } from "@/services/api";
import { IntegrationLinkList } from "@/components/integrations/IntegrationLinkList";

export const Route = createFileRoute(
  "/__auth/w/$organizationId/settings/integrations/e/wordpress"
)({
  component: RouteComponent,
});

type ConnectionDialogStep = "selectType" | "configure";

function RouteComponent() {
  const { organization } = useOrganization();
  const z = useZero();
  const { createClient } = useAuthenticatedApi();

  const [isConnectionDialogOpen, setIsConnectionDialogOpen] = useState(false);
  const [connectionDialogStep, setConnectionDialogStep] =
    useState<ConnectionDialogStep>("selectType");

  // WordPress Config State
  const [wpConfig, setWpConfig] = useState({
    siteUrl: "",
    username: "",
    applicationPassword: "",
  });

  const [deleteLinkDialog, setDeleteLinkDialog] = useState<{
    isOpen: boolean;
    linkId: string | null;
    linkName: string | null;
    documentCount: number | null;
  }>({
    isOpen: false,
    linkId: null,
    linkName: null,
    documentCount: null,
  });

  const [allConnections] = useQuery(
    queries.integrations.byOrganization({
      organizationId: organization?.id || "",
    })
  );

  const [allIntegrationLinks] = useQuery(
    queries.integrationLinks.byOrganization({
      organizationId: organization?.id || "",
    })
  );

  const connections =
    allConnections?.filter(
      (connection) => connection.integration_type === "wordpress"
    ) ?? undefined;

  const integrationLinks =
    allIntegrationLinks?.filter(
      (link) => link.connection?.integration_type === "wordpress"
    ) ?? undefined;

  const handleConnectWordpress = async () => {
    if (!organization?.id) return;

    try {
      const client = await createClient();

      const response = await client.internal.integrations[":type"].connect
        .$post({
          param: { type: "wordpress" },
          json: {
            organizationId: organization.id,
            config: wpConfig,
          },
        })
        .then((res: Response) => res.json());

      if ("error" in response) {
        toast.error(response.error);
        return;
      }

      toast.success("WordPress connected successfully!");
      setIsConnectionDialogOpen(false);
      setWpConfig({ siteUrl: "", username: "", applicationPassword: "" });
      setConnectionDialogStep("selectType");
    } catch (error) {
      console.error("Failed to connect WordPress:", error);
      toast.error(
        "Failed to connect WordPress. Please check your credentials."
      );
    }
  };

  const handleCloseDialog = () => {
    setIsConnectionDialogOpen(false);
    setConnectionDialogStep("selectType");
    setWpConfig({ siteUrl: "", username: "", applicationPassword: "" });
  };

  const handleToggleConnection = (connectionId: string, enabled: boolean) => {
    try {
      z.mutate(
        mutators.integrationConnection.update({
          connectionId,
        })
      );
      toast.success(enabled ? "Connection disabled" : "Connection enabled");
    } catch (error) {
      toast.error("Failed to update connection");
      console.error("Toggle connection error:", error);
    }
  };

  const handleDeleteConnection = (connectionId: string, name: string) => {
    confirmDialog({
      title: `Delete "${name}" Connection`,
      message:
        "This action cannot be undone. All sync metadata for this connection will be permanently deleted.",
      onConfirm: () => {
        try {
          z.mutate(mutators.integrationConnection.delete({ connectionId }));
          toast.success("Connection deleted successfully");
        } catch (error) {
          toast.error("Failed to delete connection");
          console.error("Delete connection error:", error);
        }
      },
    });
  };

  // ... (Link Management functions similar to GitHub but adapted if necessary)
  // For brevity, using similar handlers
  const handleSyncLink = async (linkId: string, linkName: string) => {
    try {
      const client = await createClient();

      toast.loading(`Pulling "${linkName}"...`, { id: `sync-${linkId}` });

      // @ts-expect-error - Dynamic route parameter type inference limitation
      const response = await client.internal.integrations.links[":linkId"].pull
        .$post({
          param: { linkId },
        })
        .then((res: Response) => res.json());

      if ("error" in response) {
        toast.error(response.error, { id: `sync-${linkId}` });
      } else if ("imported" in response) {
        toast.success(
          `Pulled ${response.imported} document(s) from "${linkName}"`,
          {
            id: `sync-${linkId}`,
          }
        );
      }
    } catch (error) {
      toast.error(`Failed to sync "${linkName}"`, { id: `sync-${linkId}` });
      console.error("Sync error:", error);
    }
  };

  const handleDeleteLink = async (linkId: string, linkName: string) => {
    try {
      const client = await createClient();
      // Fetch document count
      // @ts-expect-error - Dynamic route parameter type inference limitation
      const countResponse = await client.internal.integrations.links[
        ":linkId"
      ].documents.count.$get({
        param: { linkId },
      });
      const countData = await countResponse.json();
      const documentCount = "count" in countData ? countData.count : 0;

      setDeleteLinkDialog({
        isOpen: true,
        linkId,
        linkName,
        documentCount,
      });
    } catch (error) {
      console.error("Failed to fetch document count:", error);
      // Still show dialog even if count fetch fails
      setDeleteLinkDialog({
        isOpen: true,
        linkId,
        linkName,
        documentCount: null,
      });
    }
  };

  return (
    <div className="flex flex-col gap-y-6">
      <div>
        <Heading level={1}>WordPress Integration</Heading>
        <p className="text-sm/relaxed text-gray-600 mt-1">
          Sync your documents to your self-hosted WordPress site.
        </p>
      </div>
      <Separator />
      {/* 1. Connection Management */}
      <div className="flex flex-col gap-y-2">
        <div className="flex justify-between items-start">
          <Heading level={2}>Connection</Heading>
          {(!connections || connections.length === 0) && (
            <Button
              onPress={() => {
                setIsConnectionDialogOpen(true);
                setConnectionDialogStep("selectType");
              }}
              size="sm"
            >
              <Plus className="size-3.5 mr-1" />
              Connect WordPress
            </Button>
          )}
        </div>

        {connections && connections.length > 0 ? (
          <div className="flex flex-col gap-3">
            {connections.map((connection) => (
              <div
                key={connection.id}
                className="rounded-lg ring-1 ring-black/10 bg-white p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getIntegrationIcon(connection.integration_type)}
                    <span className="font-medium capitalize">
                      {connection.integration_type}
                    </span>
                    <span className="text-xs">
                      {getStatusText(
                        connection.enabled,
                        (connection as any).status,
                        (connection as any).status_message
                      )}
                    </span>
                  </div>
                  <MenuTrigger>
                    <RACButton className="ml-1">
                      <MoreHorizontal className="size-4 text-gray-500" />
                    </RACButton>
                    <Menu>
                      <MenuItem
                        onAction={() =>
                          handleToggleConnection(
                            connection.id,
                            connection.enabled
                          )
                        }
                      >
                        {connection.enabled ? "Disable" : "Enable"}
                      </MenuItem>
                      <MenuItem
                        onAction={() =>
                          handleDeleteConnection(
                            connection.id,
                            connection.integration_type
                          )
                        }
                        className="text-red-600"
                      >
                        Delete
                      </MenuItem>
                    </Menu>
                  </MenuTrigger>
                </div>
                <div className="mt-2 text-sm text-gray-600">
                  Site: {(connection.config as any)?.siteUrl}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <div className="text-sm font-medium text-gray-700">
              Not connected
            </div>
            <div className="text-xs mt-1 text-gray-500">
              Connect your WordPress site to start syncing.
            </div>
          </Card>
        )}
      </div>
      {/* 2. Link Management */}
      {connections && connections.find((c) => c.enabled) && (
        <div className="flex flex-col gap-y-2">
          <div className="flex flex-col gap-y-0.5">
            <Heading level={2}>Synced Links</Heading>
            <p className="text-sm/relaxed text-gray-700">
              Posts and Pages are automatically synced from your WordPress site.
            </p>
          </div>

          {integrationLinks && integrationLinks.length > 0 ? (
            <IntegrationLinkList
              items={integrationLinks.map((link) => ({
                id: link.id,
                name: link.name,
                nameIcon: <LinkIcon className="size-4 text-blue-500" />,
                secondaryText: (
                  <>
                    {getIntegrationIcon(
                      link.connection?.integration_type || ""
                    )}
                    <code className="text-xs text-gray-600">
                      {(link.config as any)?.resourceType ||
                        (link.config as any)?.type ||
                        "Pages"}
                    </code>
                  </>
                ),
                statusIcon: getStatusIcon(
                  link.enabled && (link.connection?.enabled ?? false),
                  (link.connection as any)?.status
                ),
                statusText: getStatusText(
                  link.enabled && (link.connection?.enabled ?? false),
                  (link.connection as any)?.status,
                  (link.connection as any)?.status_message
                ),
                lastSyncedLabel: link.last_synced_at
                  ? formatDistanceToNow(link.last_synced_at, {
                      addSuffix: true,
                    })
                  : "Never",
                canSync: !!(link.enabled && link.connection?.enabled),
                onSync: () => handleSyncLink(link.id, link.name),
                onDelete: () => handleDeleteLink(link.id, link.name),
              }))}
            />
          ) : (
            <Card className="p-8 text-center">
              <div className="text-sm font-medium text-gray-700">
                No links configured yet
              </div>
              <div className="text-xs mt-1 text-gray-500">
                Add a link to start syncing documents.
              </div>
            </Card>
          )}
        </div>
      )}
      <DialogTrigger
        isOpen={isConnectionDialogOpen}
        onOpenChange={setIsConnectionDialogOpen}
      >
        <Modal isDismissable>
          <Dialog>
            {connectionDialogStep === "selectType" ? (
              // This step might be redundant if we only have WP here, but keeping structure
              <div className="p-4 flex flex-col gap-y-4">
                <Heading level={2}>Connect WordPress</Heading>
                <button
                  onClick={() => setConnectionDialogStep("configure")}
                  className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors text-left"
                >
                  {/* WP Icon */}
                  <div className="font-medium">WordPress Self-Hosted</div>
                </button>
              </div>
            ) : (
              <div className="p-4 flex flex-col gap-y-4 w-[400px]">
                <Heading level={2}>WordPress Configuration</Heading>
                <div className="flex flex-col gap-4">
                  <TextField
                    value={wpConfig.siteUrl}
                    onChange={(v) => setWpConfig({ ...wpConfig, siteUrl: v })}
                  >
                    <Label className="text-sm mb-1 block">Site URL</Label>
                    <Input
                      className="w-full px-3 py-2 border rounded-md"
                      placeholder="https://your-site.com"
                    />
                  </TextField>
                  <TextField
                    value={wpConfig.username}
                    onChange={(v) => setWpConfig({ ...wpConfig, username: v })}
                  >
                    <Label className="text-sm mb-1 block">Username</Label>
                    <Input
                      className="w-full px-3 py-2 border rounded-md"
                      placeholder="admin"
                    />
                  </TextField>
                  <TextField
                    value={wpConfig.applicationPassword}
                    onChange={(v) =>
                      setWpConfig({ ...wpConfig, applicationPassword: v })
                    }
                  >
                    <Label className="text-sm mb-1 block">
                      Application Password
                    </Label>
                    <Input
                      type="password"
                      className="w-full px-3 py-2 border rounded-md"
                      placeholder="xxxx xxxx xxxx xxxx"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Generate this in your WP User Profile settings.
                    </p>
                  </TextField>
                </div>
                <div className="flex justify-end gap-2 mt-2">
                  <Button intent="secondary" onPress={handleCloseDialog}>
                    Cancel
                  </Button>
                  <Button
                    onPress={handleConnectWordpress}
                    isDisabled={
                      !wpConfig.siteUrl ||
                      !wpConfig.username ||
                      !wpConfig.applicationPassword
                    }
                  >
                    Connect
                  </Button>
                </div>
              </div>
            )}
          </Dialog>
        </Modal>
      </DialogTrigger>
      {/* Show delete link dialog */}
      <DeleteLinkDialog
        isOpen={deleteLinkDialog.isOpen}
        linkId={deleteLinkDialog.linkId}
        linkName={deleteLinkDialog.linkName}
        documentCount={deleteLinkDialog.documentCount}
        onClose={() => {
          setDeleteLinkDialog({
            isOpen: false,
            linkId: null,
            linkName: null,
            documentCount: null,
          });
        }}
      />
    </div>
  );
}

// ... Helper functions (icons, status, etc.)
// Reusing/Duplicating helper functions for self-containment or could be shared utils
function getIntegrationIcon(integrationType: string) {
  // Just return generic or use utility
  const iconUrl = getIntegrationIconUrl(integrationType);
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt={`${integrationType} icon`}
        className="size-4 rounded-sm"
      />
    );
  }
  return null;
}

function getStatusIcon(enabled: boolean, _status: any) {
  if (!enabled) return <XCircle className="size-4 text-gray-400" />;
  return <CheckCircle2 className="size-4 text-green-500" />;
}

function getStatusText(enabled: boolean, _status: any, _msg: any) {
  if (!enabled) return "Disabled";
  return "Active";
}

type DeleteLinkDialogProps = {
  isOpen: boolean;
  linkId: string | null;
  linkName: string | null;
  documentCount: number | null;
  onClose: () => void;
};

function DeleteLinkDialog({
  isOpen,
  linkId,
  linkName,
  documentCount,
  onClose,
}: DeleteLinkDialogProps) {
  const { createClient } = useAuthenticatedApi();
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDocuments, setDeleteDocuments] = useState<"keep" | "delete">(
    "keep"
  );

  const handleDelete = async () => {
    if (!linkId) return;

    setIsDeleting(true);
    try {
      const client = await createClient();
      // @ts-expect-error - Dynamic route parameter type inference limitation
      await client.internal.integrations.links[":linkId"].$delete({
        param: { linkId },
        query: {
          deleteDocuments: deleteDocuments === "delete" ? "true" : "false",
        },
      });
      toast.success("Link deleted successfully");
      onClose();
    } catch (error) {
      toast.error("Failed to delete link");
      console.error("Delete link error:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Modal isDismissable>
        <Dialog>
          <div className="p-4 flex flex-col gap-y-4">
            <div>
              <Heading level={2}>Delete "{linkName}" Link</Heading>
              <p className="text-sm text-gray-600 mt-1">
                This action cannot be undone.
              </p>
            </div>

            {documentCount !== null && documentCount > 0 && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm font-medium text-amber-900 mb-3">
                  This link has {documentCount} synchronized document
                  {documentCount !== 1 ? "s" : ""}. What would you like to do
                  with them?
                </p>
                <RadioGroup
                  value={deleteDocuments}
                  onChange={(value: string) =>
                    setDeleteDocuments(value as "keep" | "delete")
                  }
                >
                  <Radio value="keep">
                    <div className="flex flex-col">
                      <span className="font-medium">Keep documents</span>
                      <span className="text-xs text-gray-600">
                        Documents will remain in your workspace but will no
                        longer be associated with this link
                      </span>
                    </div>
                  </Radio>
                  <Radio value="delete">
                    <div className="flex flex-col">
                      <span className="font-medium">Delete documents</span>
                      <span className="text-xs text-gray-600">
                        Permanently delete all {documentCount} document
                        {documentCount !== 1 ? "s" : ""} synced from this link
                      </span>
                    </div>
                  </Radio>
                </RadioGroup>
              </div>
            )}

            {documentCount === 0 && (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-700">
                  This link has no synchronized documents.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-1.5">
              <Button
                intent="secondary"
                onPress={onClose}
                type="button"
                size="sm"
                isDisabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onPress={handleDelete}
                isPending={isDeleting}
                isDisabled={isDeleting}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {isDeleting ? "Deleting..." : "Delete Link"}
              </Button>
            </div>
          </div>
        </Dialog>
      </Modal>
    </DialogTrigger>
  );
}
