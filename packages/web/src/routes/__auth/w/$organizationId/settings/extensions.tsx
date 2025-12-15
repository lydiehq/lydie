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

  const [connections] = useQuery(
    queries.extensions.byOrganization({
      organizationId: organization?.id || "",
    })
  );

  // Handle OAuth callback - show toast messages and clear error params
  useEffect(() => {
    if (search.success && search.connectionId) {
      toast.success(
        "Extension connected successfully! Please configure your repository."
      );
    } else if (search.error) {
      toast.error(`Failed to connect: ${search.error}`);
      // Clear error param from URL
      navigate({
        to: "/w/$organizationId/settings/extensions",
        params: { organizationId: organization?.id || "" },
        search: undefined,
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

  const handleSyncFromGitHub = async (connectionId: string) => {
    try {
      const client = await createClient();

      toast.loading("Syncing from GitHub...", { id: "sync-github" });

      // @ts-expect-error - Dynamic route parameter type inference limitation
      const response = await client.internal.extensions[":connectionId"].sync
        .$post({
          param: { connectionId },
        })
        .then((res: Response) => res.json());

      if ("error" in response) {
        toast.error(response.error, { id: "sync-github" });
      } else if ("imported" in response) {
        toast.success(`Synced ${response.imported} document(s) from GitHub`, {
          id: "sync-github",
        });
      }
    } catch (error) {
      toast.error("Failed to sync from GitHub", { id: "sync-github" });
      console.error("Sync error:", error);
    }
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

        {connections && connections.length > 0 ? (
          <Table
            aria-label="Extension Connections"
            className="w-full max-h-none rounded-lg ring ring-black/8 bg-white"
          >
            <TableHeader>
              <Column>Type</Column>
              <Column>Status</Column>
              <Column>Created</Column>
              <Column>Config</Column>
              <Column width={48}>Actions</Column>
            </TableHeader>
            <TableBody items={connections}>
              {(connection) => (
                <Row id={connection.id}>
                  <Cell>
                    <div className="flex items-center gap-2">
                      {getExtensionIcon(connection.extension_type)}
                      <span className="capitalize">
                        {connection.extension_type}
                      </span>
                    </div>
                  </Cell>
                  <Cell>
                    <div className="flex items-center gap-1.5">
                      {getStatusIcon(connection.enabled)}
                      <span className="text-sm">
                        {connection.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                  </Cell>
                  <Cell>
                    {formatDistanceToNow(connection.created_at, {
                      addSuffix: true,
                    })}
                  </Cell>
                  <Cell>
                    {connection.extension_type === "github" && (
                      <code className="text-xs text-gray-600">
                        {(connection.config as any).owner}/
                        {(connection.config as any).repo}
                      </code>
                    )}
                  </Cell>
                  <Cell>
                    <MenuTrigger>
                      <RACButton>
                        <MoreHorizontal className="size-4 text-gray-500" />
                      </RACButton>
                      <Menu>
                        {connection.extension_type === "github" &&
                          connection.enabled && (
                            <MenuItem
                              onAction={() =>
                                handleSyncFromGitHub(connection.id)
                              }
                            >
                              Pull from GitHub
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
                  </Cell>
                </Row>
              )}
            </TableBody>
          </Table>
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

      {/* Show configuration dialog after OAuth success */}
      {search.success && search.connectionId && (
        <ConfigureConnectionDialog
          connectionId={search.connectionId}
          organizationId={organization?.id || ""}
          onClose={() => {
            // Clear URL params when dialog closes
            navigate({
              to: "/w/$organizationId/settings/extensions",
              params: { organizationId: organization?.id || "" },
              search: undefined,
              replace: true,
            });
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
  const z = useZero();
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
      repo: (connection?.config as any)?.repo || "",
      branch: (connection?.config as any)?.branch || "main",
      basePath: (connection?.config as any)?.basePath || "",
    },
    onSubmit: async (values) => {
      setIsSaving(true);
      try {
        const client = await createClient();

        // Save configuration
        // @ts-expect-error - Dynamic route parameter type inference limitation
        await client.internal.extensions[":connectionId"].config.$patch({
          param: { connectionId },
          json: {
            config: {
              repo: values.value.repo,
              branch: values.value.branch || "main",
              basePath: values.value.basePath || undefined,
            },
          },
        });

        // Update via Zero to refresh UI
        z.mutate(
          mutators.extensionConnection.update({
            connectionId,
            config: {
              repo: values.value.repo,
              branch: values.value.branch || "main",
              basePath: values.value.basePath || undefined,
            },
          })
        );

        // Trigger initial sync
        toast.loading("Starting initial sync...", { id: "initial-sync" });

        // @ts-expect-error - Dynamic route parameter type inference limitation
        const syncResponse = await client.internal.extensions[
          ":connectionId"
        ].sync
          .$post({
            param: { connectionId },
          })
          .then((res: Response) => res.json());

        if ("error" in syncResponse) {
          toast.error(
            `Configuration saved, but sync failed: ${syncResponse.error}`,
            {
              id: "initial-sync",
              duration: 5000,
            }
          );
          // Close dialog even if sync failed - connection is configured
          onClose();
        } else if ("imported" in syncResponse) {
          toast.success(
            `Configuration saved! Imported ${syncResponse.imported} document(s) from GitHub.`,
            { id: "initial-sync", duration: 5000 }
          );
          // Close dialog on success
          onClose();
        }
      } catch (error) {
        toast.error("Failed to configure connection");
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

  // Update form when connection loads
  useEffect(() => {
    if (connection?.config) {
      const config = connection.config as any;
      form.setFieldValue("repo", config.repo || "");
      form.setFieldValue("branch", config.branch || "main");
      form.setFieldValue("basePath", config.basePath || "");
    }
  }, [connection]);

  if (!connection) {
    return null;
  }

  return (
    <DialogTrigger isOpen={true} onOpenChange={onClose}>
      <Modal isDismissable>
        <Dialog>
          <Form
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
          >
            <div className="p-4 flex flex-col gap-y-4">
              <div>
                <Heading level={2}>Configure GitHub Sync</Heading>
                <p className="text-sm text-gray-600 mt-1">
                  Select the repository and configure where to sync your
                  documents.
                </p>
              </div>

              {isLoading ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  Loading repositories...
                </div>
              ) : (
                <>
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
                          const repo = repositories.find((r) => r.name === key);
                          if (repo && !form.state.values.branch) {
                            form.setFieldValue("branch", repo.default_branch);
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
                        description="The branch to commit documents to"
                      />
                    )}
                  />

                  <form.AppField
                    name="basePath"
                    children={(field) => (
                      <field.TextField
                        label="Base Path (Optional)"
                        placeholder="docs or content/posts"
                        description="Directory within the repository to store documents"
                      />
                    )}
                  />
                </>
              )}

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                <strong>Note:</strong> After saving, an initial sync will pull
                all Markdown/MDX files from the repository into your workspace.
                Configuration cannot be changed later - disable and reconnect to
                reconfigure.
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
                  isDisabled={isSaving || isLoading || !form.state.values.repo}
                >
                  {isSaving ? "Saving & Syncing..." : "Save & Sync"}
                </Button>
              </div>
            </div>
          </Form>
        </Dialog>
      </Modal>
    </DialogTrigger>
  );
}
