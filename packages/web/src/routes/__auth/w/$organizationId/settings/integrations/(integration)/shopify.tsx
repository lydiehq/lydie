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
import { useState, useEffect } from "react";
import { useQuery } from "@rocicorp/zero/react";
import { useZero } from "@/services/zero";
import { queries } from "@lydie/zero/queries";
import { useOrganization } from "@/context/organization.context";
import { useAuthenticatedApi } from "@/services/api";
import { Input, Label } from "@/components/generic/Field";
import { IntegrationLinkList } from "@/components/integrations/IntegrationLinkList";
import { IntegrationActivityLog } from "@/components/integrations/IntegrationActivityLog";
import { SettingsSectionLayout } from "@/components/settings/SettingsSectionLayout";

export const Route = createFileRoute(
  "/__auth/w/$organizationId/settings/integrations/(integration)/shopify"
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>) => ({
    success: search.success === "true" || search.success === true,
    error: (search.error as string) || undefined,
    connectionId: (search.connectionId as string) || undefined,
  }),
});

function RouteComponent() {
  const { organization } = useOrganization();
  const z = useZero();
  const { createClient } = useAuthenticatedApi();

  const [isConnectionDialogOpen, setIsConnectionDialogOpen] = useState(false);
  const [shopUrl, setShopUrl] = useState("");
  const [linkDialogConnectionId, setLinkDialogConnectionId] = useState<
    string | null
  >(null);
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
      (connection) => connection.integration_type === "shopify"
    ) ?? undefined;

  const integrationLinks =
    allIntegrationLinks?.filter(
      (link) => link.connection?.integration_type === "shopify"
    ) ?? undefined;

  const handleConnectShopify = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!shopUrl) {
      toast.error("Please enter your Shopify store URL");
      return;
    }

    if (!organization?.id) {
      toast.error("Organization not found");
      return;
    }

    try {
      const client = await createClient();
      const redirectUrl = `/w/${organization.id}/settings/integrations/shopify`;

      // @ts-expect-error - Dynamic route parameter type inference limitation
      const response = await client.internal.integrations[
        ":type"
      ].oauth.authorize
        .$post({
          param: { type: "shopify" },
          json: {
            redirectUrl,
            shop: shopUrl,
          },
        })
        .then((res: Response) => res.json());

      if (!response || "error" in response) {
        toast.error(
          "error" in response
            ? `Failed to start Shopify connection: ${response.error}`
            : "Failed to start Shopify connection"
        );
        return;
      }

      setIsConnectionDialogOpen(false);
      setShopUrl("");

      window.location.href = response.authUrl as string;
    } catch (error) {
      console.error("Shopify OAuth error:", error);
      toast.error("Failed to start Shopify connection");
    }
  };

  const handleCloseDialog = () => {
    setIsConnectionDialogOpen(false);
    setShopUrl("");
  };

  const handleSyncLink = async (linkId: string, linkName: string) => {
    try {
      const client = await createClient();

      toast.loading(`Syncing "${linkName}"...`, { id: `sync-${linkId}` });

      // @ts-expect-error - Dynamic route parameter type inference limitation
      const response = await client.internal.integrations.links[":linkId"].sync
        .$post({
          param: { linkId },
        })
        .then((res: Response) => res.json());

      if ("error" in response) {
        toast.error(response.error, { id: `sync-${linkId}` });
      } else if ("imported" in response) {
        toast.success(
          `Synced ${response.imported} document(s) from "${linkName}"`,
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

  const handleToggleConnection = (connectionId: string, enabled: boolean) => {
    try {
      z.mutate(
        mutators.integrationConnection.update({
          connectionId,
          enabled: !enabled,
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

  const [activityLogs] = useQuery(
    queries.integrationActivityLogs.byConnection({
      // TODO: is it even possible to have more than one connection?
      connectionId: connections?.[0]?.id || "",
      organizationId: organization?.id || "",
    })
  );

  return (
    <div className="flex flex-col gap-y-6">
      <div className="flex flex-col gap-y-2">
        <Heading level={1}>Shopify Integration</Heading>
        <p className="text-sm/relaxed text-gray-600 mt-1">
          Sync your documents to your Shopify store as Pages or Blog Posts.
        </p>
      </div>
      <Separator />

      {/* 1. Connection Management */}
      <div className="flex flex-col gap-y-2">
        <div className="flex justify-between items-start">
          <SettingsSectionLayout heading="Connection" />
          {(!connections || connections.length === 0) && (
            <Button
              onPress={() => {
                setIsConnectionDialogOpen(true);
              }}
              size="sm"
            >
              <Plus className="size-3.5 mr-1" />
              Connect Shopify
            </Button>
          )}
        </div>

        {connections && connections.length > 0 ? (
          <div className="flex flex-col gap-3">
            {connections.map((connection) => (
              <Card key={connection.id} className="p-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getIntegrationIcon("shopify")}
                    <span className="font-medium capitalize">
                      {(connection.config as any)?.shop || "Shopify Store"}
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
                          handleDeleteConnection(connection.id, "Shopify")
                        }
                        className="text-red-600"
                      >
                        Delete
                      </MenuItem>
                    </Menu>
                  </MenuTrigger>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <div className="text-sm font-medium text-gray-700">
              Not connected
            </div>
            <div className="text-xs mt-1 text-gray-500">
              Connect your Shopify store to start syncing.
            </div>
          </Card>
        )}
      </div>
      <div className="flex flex-col gap-y-4">
        <SettingsSectionLayout
          heading="Activity Logs"
          description="View the activity logs for your Shopify connection."
        />
        <IntegrationActivityLog logs={activityLogs} />
      </div>

      {connections && connections.find((c) => c.enabled) && (
        <div className="flex flex-col gap-y-2">
          <div className="flex justify-between items-start">
            <div className="flex flex-col gap-y-0.5">
              <Heading level={2}>Synced Resources</Heading>
              <p className="text-sm/relaxed text-gray-700">
                Manage which Pages or Blogs are being synced.
              </p>
            </div>

            <Button
              onPress={() => {
                const enabledConnection = connections.find((c) => c.enabled);
                if (enabledConnection) {
                  setLinkDialogConnectionId(enabledConnection.id);
                }
              }}
              size="sm"
              intent="secondary"
            >
              <LinkIcon className="size-3.5 mr-1" />
              Add Resource
            </Button>
          </div>

          {integrationLinks && integrationLinks.length > 0 ? (
            <IntegrationLinkList
              items={integrationLinks.map((link) => ({
                id: link.id,
                name: link.name,
                nameIcon: <LinkIcon className="size-4 text-green-500" />,
                secondaryText: (
                  <span className="capitalize text-xs text-gray-600">
                    {(link.config as any)?.resourceFullName || "Unknown"}
                  </span>
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
                No resources configured yet
              </div>
              <div className="text-xs mt-1 text-gray-500">
                Add a resource to start syncing documents.
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Connection Dialog */}
      <DialogTrigger
        isOpen={isConnectionDialogOpen}
        onOpenChange={setIsConnectionDialogOpen}
      >
        <Modal isDismissable>
          <Dialog>
            <div className="p-4 flex flex-col gap-y-4 w-[400px]">
              <Heading level={2}>Connect Shopify</Heading>
              <form
                onSubmit={handleConnectShopify}
                className="flex flex-col gap-y-4"
              >
                <div className="flex flex-col gap-y-2">
                  <Label htmlFor="shop-url">myShopify URL</Label>
                  <Input
                    id="shop-url"
                    placeholder="your-store.myshopify.com"
                    value={shopUrl}
                    onChange={(e) => setShopUrl(e.target.value)}
                    autoFocus
                  />
                  <p className="text-xs text-gray-500">
                    Enter your store's myshopify.com URL (e.g.
                    my-store.myshopify.com) or custom domain.
                  </p>
                </div>

                <div className="flex justify-end gap-x-2">
                  <Button
                    intent="secondary"
                    onPress={handleCloseDialog}
                    size="sm"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm">
                    Connect
                  </Button>
                </div>
              </form>
            </div>
          </Dialog>
        </Modal>
      </DialogTrigger>

      {/* Show link configuration dialog */}
      {linkDialogConnectionId && (
        <ConfigureConnectionDialog
          connectionId={linkDialogConnectionId}
          organizationId={organization?.id || ""}
          onClose={() => {
            setLinkDialogConnectionId(null);
          }}
        />
      )}

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

function getIntegrationIcon(integrationType: string) {
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

function getStatusIcon(enabled: boolean, status?: string | null) {
  if (!enabled) {
    return <XCircle className="size-4 text-gray-400" aria-hidden="true" />;
  }

  if (!status || status === "active") {
    return (
      <CheckCircle2 className="size-4 text-green-500" aria-hidden="true" />
    );
  }

  if (status === "error" || status === "revoked") {
    return <XCircle className="size-4 text-red-500" aria-hidden="true" />;
  }

  // suspended or any other status
  return <XCircle className="size-4 text-amber-500" aria-hidden="true" />;
}

function getStatusText(
  enabled: boolean,
  status?: string | null,
  statusMessage?: string | null
) {
  if (!enabled) return "Disabled";
  if (statusMessage) return statusMessage;

  switch (status) {
    case "error":
      return "Error";
    case "revoked":
      return "Revoked";
    case "suspended":
      return "Suspended";
    case "active":
    default:
      return "Active";
  }
}

type ConfigureConnectionDialogProps = {
  connectionId: string;
  organizationId: string;
  onClose: () => void;
};

function ConfigureConnectionDialog({
  connectionId,
  onClose,
}: ConfigureConnectionDialogProps) {
  const { createClient } = useAuthenticatedApi();
  const [isOpen, setIsOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [resources, setResources] = useState<
    Array<{
      id: string;
      name: string;
      fullName: string;
      metadata?: { type?: string };
    }>
  >([]);
  const [selectedResourceId, setSelectedResourceId] = useState<string>("");

  // Shopify specific: For now we don't have extra config like branch/basePath for each resource,
  // but we might want to let them rename the link.
  const [linkName, setLinkName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    const loadResources = async () => {
      setIsLoading(true);
      try {
        const client = await createClient();
        // @ts-expect-error - Dynamic route parameter type inference limitation
        const res = await client.internal.integrations[
          ":connectionId"
        ].resources
          .$get({
            param: { connectionId },
          })
          .then((r: Response) => r.json());

        if (cancelled) return;

        if (!res || ("error" in res && res.error)) {
          toast.error(
            "error" in res
              ? `Failed to load resources: ${res.error}`
              : "Failed to load resources"
          );
          return;
        }

        const resourcesList = (res.resources || []) as Array<{
          id: string;
          name: string;
          fullName: string;
          metadata?: { type?: string };
        }>;

        setResources(resourcesList);

        // Use the first one by default if available? No, force selection.
      } catch (error) {
        console.error("Failed to load resources:", error);
        toast.error("Failed to load available resources from Shopify");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    if (connectionId) {
      loadResources();
    }

    return () => {
      cancelled = true;
    };
  }, [connectionId, createClient]);

  const handleSave = async () => {
    if (!selectedResourceId) {
      toast.error("Please select a resource to sync");
      return;
    }

    const selectedResource = resources.find((r) => r.id === selectedResourceId);
    if (!selectedResource) return; // Should not happen

    setIsSaving(true);
    try {
      const client = await createClient();
      const finalLinkName = linkName || selectedResource.name;

      const config = {
        resourceType: selectedResource.metadata?.type || "unknown",
        resourceId: selectedResource.id,
        resourceFullName: selectedResource.fullName,
      };

      // @ts-expect-error - Dynamic route parameter type inference limitation
      const response = await client.internal.integrations[":connectionId"].links
        .$post({
          param: { connectionId },
          json: {
            name: finalLinkName,
            config,
          },
        })
        .then((res: Response) => res.json());

      if ("error" in response) {
        toast.error(`Failed to create link: ${response.error}`);
        return;
      }

      toast.success("Resource connected successfully");
      setIsOpen(false);
      onClose();
    } catch (error) {
      console.error("Failed to save link:", error);
      toast.error("Failed to save resource configuration");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DialogTrigger
      isOpen={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) onClose();
      }}
    >
      <Modal isDismissable>
        <Dialog>
          <div className="p-4 flex flex-col gap-y-4 w-[500px]">
            <Heading level={2}>Add Resource</Heading>
            <p className="text-sm text-gray-600">
              Select a Shopify resource to sync documents to.
            </p>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Resource Type</Label>
                  <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto border rounded-md p-2">
                    {resources.length === 0 ? (
                      <div className="text-sm text-gray-500 text-center py-4">
                        No syncable resources found.
                      </div>
                    ) : (
                      <RadioGroup
                        value={selectedResourceId}
                        onChange={(val) => {
                          setSelectedResourceId(val);
                          const res = resources.find((r) => r.id === val);
                          if (res && !linkName) {
                            setLinkName(res.name);
                          }
                        }}
                      >
                        {resources.map((resource) => (
                          <Radio
                            key={resource.id}
                            value={resource.id}
                            className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer"
                          >
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">
                                {resource.name}
                              </span>
                              <span className="text-xs text-gray-500 capitalize">
                                {resource.metadata?.type?.replace("_", " ") ||
                                  resource.fullName}
                              </span>
                            </div>
                          </Radio>
                        ))}
                      </RadioGroup>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="link-name">Name (Optional)</Label>
                  <Input
                    id="link-name"
                    value={linkName}
                    onChange={(e) => setLinkName(e.target.value)}
                    placeholder="e.g. Store Pages"
                  />
                  <p className="text-xs text-gray-500">
                    A friendly name for this sync connection.
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 mt-2">
              <Button
                intent="secondary"
                onPress={() => {
                  setIsOpen(false);
                  onClose();
                }}
                size="sm"
              >
                Cancel
              </Button>
              <Button
                onPress={handleSave}
                isDisabled={isLoading || isSaving || !selectedResourceId}
                size="sm"
              >
                {isSaving ? "Saving..." : "Add Resource"}
              </Button>
            </div>
          </div>
        </Dialog>
      </Modal>
    </DialogTrigger>
  );
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
