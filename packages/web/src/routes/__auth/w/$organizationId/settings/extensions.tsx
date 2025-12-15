import { Button } from "@/components/generic/Button";
import { Separator } from "@/components/generic/Separator";
import { Heading } from "@/components/generic/Heading";
import { useQuery } from "@rocicorp/zero/react";
import { useState, useEffect } from "react";
import {
  DialogTrigger,
  Form,
  MenuTrigger,
  Button as RACButton,
  TableBody,
} from "react-aria-components";
import { Modal } from "@/components/generic/Modal";
import { Dialog } from "@/components/generic/Dialog";
import { Menu, MenuItem } from "@/components/generic/Menu";
import { Select, SelectItem } from "@/components/generic/Select";
import {
  Plus,
  MoreHorizontal,
  Github,
  CheckCircle2,
  XCircle,
  Link,
  FolderSync,
} from "lucide-react";
import { useZero } from "@/services/zero";
import { queries } from "@lydie/zero/queries";
import { mutators } from "@lydie/zero/mutators";
import { confirmDialog } from "@/stores/confirm-dialog";
import { useAppForm } from "@/hooks/use-app-form";
import { formatDistanceToNow } from "date-fns";
import {
  Table,
  TableHeader,
  Column,
  Row,
  Cell,
} from "@/components/generic/Table";
import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useOrganization } from "@/context/organization.context";
import { toast } from "sonner";
import { useAuthenticatedApi } from "@/services/api";

export const Route = createFileRoute(
  "/__auth/w/$organizationId/settings/extensions"
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      success: search.success === "true" || search.success === true,
      error: (search.error as string) || undefined,
      connectionId: (search.connectionId as string) || undefined,
    };
  },
});

type ExtensionType = "github" | "shopify" | "wordpress";

type ConnectionDialogStep = "selectType" | "configure";

function RouteComponent() {
  const { organization } = useOrganization();
  const z = useZero();
  const navigate = useNavigate();
  const { createClient } = useAuthenticatedApi();
  const search = useSearch({
    from: "/__auth/w/$organizationId/settings/extensions",
  });
  const [isConnectionDialogOpen, setIsConnectionDialogOpen] = useState(false);
  const [connectionDialogStep, setConnectionDialogStep] =
    useState<ConnectionDialogStep>("selectType");
  const [selectedExtensionType, setSelectedExtensionType] =
    useState<ExtensionType | null>(null);
  const [linkDialogConnectionId, setLinkDialogConnectionId] = useState<
    string | null
  >(null);

  const [connections] = useQuery(
    queries.extensions.byOrganization({
      organizationId: organization?.id || "",
    })
  );

  // Query extension links
  const [extensionLinks] = useQuery(
    queries.extensionLinks.byOrganization({
      organizationId: organization?.id || "",
    })
  );

  // Handle OAuth callback - show toast messages
  useEffect(() => {
    if (search.success && search.connectionId) {
      toast.success("Extension connected successfully!");
      // Clear URL params
      navigate({
        to: "/w/$organizationId/settings/extensions",
        params: { organizationId: organization?.id || "" },
        search: { success: false, error: undefined, connectionId: undefined },
        replace: true,
      });
    } else if (search.error) {
      toast.error(`Failed to connect: ${search.error}`);
      // Clear error param from URL
      navigate({
        to: "/w/$organizationId/settings/extensions",
        params: { organizationId: organization?.id || "" },
        search: { success: false, error: undefined, connectionId: undefined },
        replace: true,
      });
    }
  }, [
    search.success,
    search.error,
    search.connectionId,
    organization?.id,
    navigate,
  ]);

  const handleSelectExtension = (type: ExtensionType) => {
    setSelectedExtensionType(type);
    setConnectionDialogStep("configure");
  };

  const handleCloseDialog = () => {
    setIsConnectionDialogOpen(false);
    setConnectionDialogStep("selectType");
    setSelectedExtensionType(null);
  };

  const handleSyncLink = async (linkId: string, linkName: string) => {
    try {
      const client = await createClient();

      toast.loading(`Syncing "${linkName}"...`, { id: `sync-${linkId}` });

      // @ts-expect-error - Dynamic route parameter type inference limitation
      const response = await client.internal.extensions.links[":linkId"].sync
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

  const handleDeleteLink = (linkId: string, linkName: string) => {
    confirmDialog({
      title: `Delete "${linkName}" Link`,
      message:
        "This action cannot be undone. Documents synced from this link will remain but will no longer be associated with this link.",
      onConfirm: async () => {
        try {
          const client = await createClient();
          // @ts-expect-error - Dynamic route parameter type inference limitation
          await client.internal.extensions.links[":linkId"].$delete({
            param: { linkId },
          });
          toast.success("Link deleted successfully");
        } catch (error) {
          toast.error("Failed to delete link");
          console.error("Delete link error:", error);
        }
      },
    });
  };

  const handleToggleConnection = (connectionId: string, enabled: boolean) => {
    try {
      z.mutate(
        mutators.extensionConnection.update({
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
          z.mutate(mutators.extensionConnection.delete({ connectionId }));
          toast.success("Connection deleted successfully");
        } catch (error) {
          toast.error("Failed to delete connection");
          console.error("Delete connection error:", error);
        }
      },
    });
  };

  const getStatusIcon = (enabled: boolean) => {
    if (!enabled) return <XCircle className="size-4 text-gray-400" />;
    return <CheckCircle2 className="size-4 text-green-600" />;
  };

  const getExtensionIcon = (type: string) => {
    switch (type) {
      case "github":
        return <Github className="size-4" />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-y-6">
      <div>
        <Heading level={1}>Extensions</Heading>
        <p className="text-sm/relaxed text-gray-600 mt-1">
          Connect external platforms to sync your documents when published.
        </p>
      </div>
      <Separator />

      <div className="flex flex-col gap-y-2">
        <div className="flex justify-between items-start">
          <div className="flex flex-col gap-y-0.5">
            <h2 className="text-md/none font-medium">Connected Extensions</h2>
            <p className="text-sm/relaxed text-gray-700">
              Manage your connected platforms for document syncing.
            </p>
          </div>
          <Button
            onPress={() => {
              setIsConnectionDialogOpen(true);
              setConnectionDialogStep("selectType");
            }}
            size="sm"
            intent="secondary"
          >
            <Plus className="size-3.5 mr-1" />
            Add Connection
          </Button>
        </div>

        {/* Show Extension Links */}
        {extensionLinks && extensionLinks.length > 0 ? (
          <Table
            aria-label="Extension Links"
            className="w-full max-h-none rounded-lg ring ring-black/8 bg-white"
          >
            <TableHeader>
              <Column>Name</Column>
              <Column>Source</Column>
              <Column>Status</Column>
              <Column>Last Synced</Column>
              <Column width={48}>Actions</Column>
            </TableHeader>
            <TableBody items={extensionLinks}>
              {(link) => (
                <Row id={link.id}>
                  <Cell>
                    <div className="flex items-center gap-2">
                      <Link className="size-4 text-blue-500" />
                      <span className="font-medium">{link.name}</span>
                    </div>
                  </Cell>
                  <Cell>
                    <div className="flex items-center gap-2">
                      {getExtensionIcon(link.connection?.extension_type || "")}
                      <code className="text-xs text-gray-600">
                        {(link.config as any).owner}/{(link.config as any).repo}
                        {(link.config as any).basePath &&
                          `/${(link.config as any).basePath}`}
                      </code>
                    </div>
                  </Cell>
                  <Cell>
                    <div className="flex items-center gap-1.5">
                      {getStatusIcon(
                        link.enabled && (link.connection?.enabled ?? false)
                      )}
                      <span className="text-sm">
                        {link.enabled && link.connection?.enabled
                          ? "Enabled"
                          : "Disabled"}
                      </span>
                    </div>
                  </Cell>
                  <Cell>
                    {link.last_synced_at
                      ? formatDistanceToNow(link.last_synced_at, {
                          addSuffix: true,
                        })
                      : "Never"}
                  </Cell>
                  <Cell>
                    <MenuTrigger>
                      <RACButton>
                        <MoreHorizontal className="size-4 text-gray-500" />
                      </RACButton>
                      <Menu>
                        {link.enabled && link.connection?.enabled && (
                          <MenuItem
                            onAction={() => handleSyncLink(link.id, link.name)}
                          >
                            <FolderSync className="size-4 mr-2" />
                            Sync Now
                          </MenuItem>
                        )}
                        <MenuItem
                          onAction={() => handleDeleteLink(link.id, link.name)}
                          className="text-red-600"
                        >
                          Delete
                        </MenuItem>
                      </Menu>
                    </MenuTrigger>
                  </Cell>
                </Row>
              )}
            </TableBody>
          </Table>
        ) : connections && connections.length > 0 ? (
          <div className="rounded-xl ring-1 ring-black/10 bg-white p-8 text-center flex flex-col items-center gap-3">
            <div>
              <div className="text-sm font-medium text-gray-700">
                No links configured yet
              </div>
              <div className="text-xs mt-1 text-gray-500">
                You have a connection set up. Add a link to start syncing
                documents from a specific path.
              </div>
            </div>
            {connections.find((c) => c.enabled) && (
              <Button
                onPress={() => {
                  const enabledConnection = connections.find((c) => c.enabled);
                  if (enabledConnection) {
                    setLinkDialogConnectionId(enabledConnection.id);
                  }
                }}
                size="sm"
              >
                <Link className="size-3.5 mr-1" />
                Add Your First Link
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-xl ring-1 ring-black/10 bg-white p-8 text-center">
            <div className="text-sm font-medium text-gray-700">
              No extensions connected yet
            </div>
            <div className="text-xs mt-1 text-gray-500">
              Connect your first extension to start syncing documents
            </div>
          </div>
        )}

        {/* Show Connected Extensions with their links */}
        {connections && connections.length > 0 && (
          <div className="mt-6">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-medium text-gray-700">
                Connected Accounts
              </h3>
            </div>
            <div className="flex flex-col gap-3">
              {connections.map((connection) => {
                const connectionLinks =
                  extensionLinks?.filter(
                    (link) => link.connection_id === connection.id
                  ) || [];

                return (
                  <div
                    key={connection.id}
                    className="rounded-lg ring-1 ring-black/10 bg-white p-4"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {getExtensionIcon(connection.extension_type)}
                        <span className="font-medium capitalize">
                          {connection.extension_type}
                        </span>
                        {getStatusIcon(connection.enabled)}
                        <span className="text-xs text-gray-500">
                          {connectionLinks.length} link
                          {connectionLinks.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <MenuTrigger>
                        <RACButton className="ml-1">
                          <MoreHorizontal className="size-4 text-gray-500" />
                        </RACButton>
                        <Menu>
                          {connection.enabled && (
                            <MenuItem
                              onAction={() =>
                                setLinkDialogConnectionId(connection.id)
                              }
                            >
                              <Link className="size-4 mr-2" />
                              Add Link
                            </MenuItem>
                          )}
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
                                connection.extension_type
                              )
                            }
                            className="text-red-600"
                          >
                            Delete
                          </MenuItem>
                        </Menu>
                      </MenuTrigger>
                    </div>
                    {connectionLinks.length > 0 && (
                      <div className="mt-2 pt-3 border-t border-gray-100">
                        <div className="flex flex-col gap-2">
                          {connectionLinks.map((link) => (
                            <div
                              key={link.id}
                              className="flex items-center justify-between text-sm"
                            >
                              <div className="flex items-center gap-2">
                                <Link className="size-3.5 text-blue-500" />
                                <span className="font-medium">{link.name}</span>
                                <code className="text-xs text-gray-500">
                                  {(link.config as any).owner}/
                                  {(link.config as any).repo}
                                  {(link.config as any).basePath &&
                                    `/${(link.config as any).basePath}`}
                                </code>
                              </div>
                              <div className="flex items-center gap-2">
                                {getStatusIcon(
                                  link.enabled &&
                                    (link.connection?.enabled ?? false)
                                )}
                                <MenuTrigger>
                                  <RACButton>
                                    <MoreHorizontal className="size-3 text-gray-400" />
                                  </RACButton>
                                  <Menu>
                                    {link.enabled &&
                                      link.connection?.enabled && (
                                        <MenuItem
                                          onAction={() =>
                                            handleSyncLink(link.id, link.name)
                                          }
                                        >
                                          <FolderSync className="size-4 mr-2" />
                                          Sync Now
                                        </MenuItem>
                                      )}
                                    <MenuItem
                                      onAction={() =>
                                        handleDeleteLink(link.id, link.name)
                                      }
                                      className="text-red-600"
                                    >
                                      Delete
                                    </MenuItem>
                                  </Menu>
                                </MenuTrigger>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {connectionLinks.length === 0 && connection.enabled && (
                      <div className="mt-2 pt-3 border-t border-gray-100">
                        <Button
                          onPress={() =>
                            setLinkDialogConnectionId(connection.id)
                          }
                          size="sm"
                          intent="secondary"
                          className="w-full"
                        >
                          <Link className="size-3.5 mr-1" />
                          Add Your First Link
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <ConnectionDialog
        isOpen={isConnectionDialogOpen}
        onOpenChange={setIsConnectionDialogOpen}
        step={connectionDialogStep}
        selectedType={selectedExtensionType}
        organizationId={organization?.id || ""}
        onSelectExtension={handleSelectExtension}
        onClose={handleCloseDialog}
      />

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
    </div>
  );
}

type ConnectionDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  step: ConnectionDialogStep;
  selectedType: ExtensionType | null;
  organizationId: string;
  onSelectExtension: (type: ExtensionType) => void;
  onClose: () => void;
};

function ConnectionDialog({
  isOpen,
  onOpenChange,
  step,
  selectedType,
  organizationId,
  onSelectExtension,
  onClose,
}: ConnectionDialogProps) {
  const extensions: Array<{
    type: ExtensionType;
    name: string;
    description: string;
    icon: any;
    comingSoon?: boolean;
  }> = [
    {
      type: "github",
      name: "GitHub",
      description: "Sync documents as Markdown files to a GitHub repository",
      icon: Github,
    },
    {
      type: "shopify",
      name: "Shopify Blog",
      description: "Publish documents to your Shopify blog",
      icon: null,
      comingSoon: true,
    },
    {
      type: "wordpress",
      name: "WordPress",
      description: "Publish documents to your WordPress site",
      icon: null,
      comingSoon: true,
    },
  ];

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal isDismissable>
        <Dialog>
          {step === "selectType" ? (
            <div className="p-4 flex flex-col gap-y-4">
              <Heading level={2}>Select Extension</Heading>
              <p className="text-sm text-gray-600">
                Choose a platform to connect for document syncing.
              </p>
              <div className="flex flex-col gap-2">
                {extensions.map((ext) => (
                  <button
                    key={ext.type}
                    onClick={() =>
                      !ext.comingSoon && onSelectExtension(ext.type)
                    }
                    disabled={ext.comingSoon}
                    className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:bg-white"
                  >
                    {ext.icon && <ext.icon className="size-5 mt-0.5" />}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-medium">{ext.name}</div>
                        {ext.comingSoon && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            Coming Soon
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600">
                        {ext.description}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex justify-end">
                <Button intent="secondary" onPress={onClose} size="sm">
                  Cancel
                </Button>
              </div>
            </div>
          ) : selectedType === "github" ? (
            <GitHubConfigForm
              organizationId={organizationId}
              onClose={onClose}
            />
          ) : null}
        </Dialog>
      </Modal>
    </DialogTrigger>
  );
}

type GitHubConfigFormProps = {
  organizationId: string;
  onClose: () => void;
};

function GitHubConfigForm({ onClose }: GitHubConfigFormProps) {
  const { createClient } = useAuthenticatedApi();
  const [isLoading, setIsLoading] = useState(false);

  const handleConnectGitHub = async () => {
    setIsLoading(true);
    try {
      const client = await createClient();

      // Get the current URL for redirect after OAuth
      const redirectUrl = window.location.pathname;

      // Call backend to initiate OAuth flow
      // @ts-expect-error - Dynamic route parameter type inference limitation
      const response = await client.internal.extensions[":type"].oauth.authorize
        .$post({
          param: { type: "github" },
          json: { redirectUrl },
        })
        .then((res: Response) => res.json());

      if ("authUrl" in response) {
        // Redirect to GitHub OAuth
        window.location.href = response.authUrl;
      } else {
        toast.error("Failed to initiate GitHub connection");
        setIsLoading(false);
      }
    } catch (error) {
      toast.error("Failed to connect to GitHub");
      console.error("GitHub OAuth error:", error);
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 flex flex-col gap-y-4">
      <div>
        <Heading level={2}>Connect GitHub</Heading>
        <p className="text-sm text-gray-600 mt-1">
          Connect your GitHub account to sync documents as Markdown files to
          your repositories.
        </p>
      </div>

      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <div className="flex items-start gap-3">
          <Github className="size-5 mt-0.5 shrink-0" />
          <div className="flex-1">
            <h3 className="text-sm font-medium mb-1">
              Authorize with GitHub OAuth
            </h3>
            <p className="text-sm text-gray-600 mb-3">
              You'll be redirected to GitHub to authorize access to your
              repositories. After authorization, you can select which repository
              to sync your documents to.
            </p>
            <ul className="text-xs text-gray-600 list-disc list-inside space-y-1">
              <li>Read and write access to repository contents</li>
              <li>Create and update files in selected repositories</li>
              <li>Commit changes on your behalf</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-1.5">
        <Button
          intent="secondary"
          onPress={onClose}
          type="button"
          size="sm"
          isDisabled={isLoading}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onPress={handleConnectGitHub}
          isPending={isLoading}
          isDisabled={isLoading}
        >
          <Github className="size-4 mr-1.5" />
          {isLoading ? "Connecting..." : "Connect with GitHub"}
        </Button>
      </div>
    </div>
  );
}

type ConfigureConnectionDialogProps = {
  connectionId: string;
  organizationId: string;
  onClose: () => void;
};

function ConfigureConnectionDialog({
  connectionId,
  organizationId,
  onClose,
}: ConfigureConnectionDialogProps) {
  const { createClient } = useAuthenticatedApi();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [repositories, setRepositories] = useState<
    Array<{ name: string; full_name: string; default_branch: string }>
  >([]);

  // Get connection info from Zero
  const [connection] = useQuery(
    queries.extensions.byId({
      connectionId,
      organizationId,
    })
  );

  const form = useAppForm({
    defaultValues: {
      name: "",
      repo: "",
      branch: "main",
      basePath: "",
    },
    onSubmit: async (values) => {
      setIsSaving(true);
      try {
        const client = await createClient();

        // Find the selected repository to get the owner
        const selectedRepo = repositories.find(
          (r) => r.name === values.value.repo
        );
        const owner = selectedRepo?.full_name.split("/")[0] || "";

        // Create a link instead of updating connection config
        // @ts-expect-error - Dynamic route parameter type inference limitation
        const linkResponse = await client.internal.extensions[
          ":connectionId"
        ].links
          .$post({
            param: { connectionId },
            json: {
              name: values.value.name || `${owner}/${values.value.repo}`,
              config: {
                owner,
                repo: values.value.repo,
                branch: values.value.branch || "main",
                basePath: values.value.basePath || undefined,
              },
            },
          })
          .then((res: Response) => res.json());

        if ("error" in linkResponse) {
          toast.error(`Failed to create link: ${linkResponse.error}`);
          setIsSaving(false);
          return;
        }

        const linkId = linkResponse.linkId;

        // Trigger initial sync for the link
        toast.loading("Starting initial sync...", { id: "initial-sync" });

        // @ts-expect-error - Dynamic route parameter type inference limitation
        const syncResponse = await client.internal.extensions.links[
          ":linkId"
        ].sync
          .$post({
            param: { linkId },
          })
          .then((res: Response) => res.json());

        if ("error" in syncResponse) {
          toast.error(`Link created, but sync failed: ${syncResponse.error}`, {
            id: "initial-sync",
            duration: 5000,
          });
          // Close dialog even if sync failed - link is created
          onClose();
        } else if ("imported" in syncResponse) {
          toast.success(
            `Link created! Imported ${syncResponse.imported} document(s).`,
            { id: "initial-sync", duration: 5000 }
          );
          // Close dialog on success
          onClose();
        }
      } catch (error) {
        toast.error("Failed to create link");
        console.error("Configuration error:", error);
      } finally {
        setIsSaving(false);
      }
    },
  });

  // Fetch repositories on mount
  useEffect(() => {
    const fetchRepositories = async () => {
      try {
        const client = await createClient();
        // @ts-expect-error - Dynamic route parameter type inference limitation
        const response = await client.internal.extensions[
          ":connectionId"
        ].repositories
          .$get({
            param: { connectionId },
          })
          .then((res: Response) => res.json());

        if ("repositories" in response) {
          setRepositories(response.repositories);
        }
      } catch (error) {
        console.error("Failed to fetch repositories:", error);
        toast.error("Failed to load repositories");
      } finally {
        setIsLoading(false);
      }
    };

    fetchRepositories();
  }, [connectionId]);

  return (
    <DialogTrigger
      isOpen={true}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <Modal isDismissable>
        <Dialog>
          {!connection ? (
            <div className="p-4">
              <div className="py-8 text-center text-sm text-gray-500">
                Loading connection...
              </div>
            </div>
          ) : (
            <Form
              onSubmit={(e) => {
                e.preventDefault();
                form.handleSubmit();
              }}
            >
              <div className="p-4 flex flex-col gap-y-4">
                <div>
                  <Heading level={2}>Add GitHub Link</Heading>
                  <p className="text-sm text-gray-600 mt-1">
                    Create a link to sync documents from a specific path in your
                    repository.
                  </p>
                </div>

                {isLoading ? (
                  <div className="py-8 text-center text-sm text-gray-500">
                    Loading repositories...
                  </div>
                ) : (
                  <>
                    <form.AppField
                      name="name"
                      children={(field) => (
                        <field.TextField
                          label="Link Name"
                          placeholder="e.g. Web Docs, API Reference"
                          description="A friendly name for this link (shown in the file tree)"
                        />
                      )}
                    />

                    <div>
                      <Select
                        label="Repository"
                        isRequired
                        placeholder="Select a repository"
                        selectedKey={form.state.values.repo}
                        onSelectionChange={(key) => {
                          if (key && typeof key === "string") {
                            form.setFieldValue("repo", key);
                            // Auto-fill branch from repo's default branch
                            const repo = repositories.find(
                              (r) => r.name === key
                            );
                            if (repo) {
                              form.setFieldValue("branch", repo.default_branch);
                              // Auto-fill name if empty
                              if (!form.state.values.name) {
                                form.setFieldValue("name", repo.full_name);
                              }
                            }
                          }
                        }}
                        items={repositories.map((repo) => ({
                          id: repo.name,
                          label: repo.full_name,
                          defaultBranch: repo.default_branch,
                        }))}
                      >
                        {(item) => (
                          <SelectItem id={item.id} textValue={item.label}>
                            {item.label}
                          </SelectItem>
                        )}
                      </Select>
                    </div>

                    <form.AppField
                      name="branch"
                      children={(field) => (
                        <field.TextField
                          label="Branch"
                          placeholder="main"
                          description="The branch to sync documents from"
                        />
                      )}
                    />

                    <form.AppField
                      name="basePath"
                      children={(field) => (
                        <field.TextField
                          label="Base Path (Optional)"
                          placeholder="docs or content/posts"
                          description="Directory within the repository to sync (leave empty for root)"
                        />
                      )}
                    />
                  </>
                )}

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                  <strong>Tip:</strong> You can create multiple links from the
                  same repository to sync different directories. Each link
                  appears as a separate folder in your file tree.
                </div>

                <div className="flex justify-end gap-1.5">
                  <Button
                    intent="secondary"
                    onPress={onClose}
                    type="button"
                    size="sm"
                    isDisabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    type="submit"
                    isPending={isSaving}
                    isDisabled={
                      isSaving || isLoading || !form.state.values.repo
                    }
                  >
                    {isSaving ? "Creating & Syncing..." : "Create Link & Sync"}
                  </Button>
                </div>
              </div>
            </Form>
          )}
        </Dialog>
      </Modal>
    </DialogTrigger>
  );
}
