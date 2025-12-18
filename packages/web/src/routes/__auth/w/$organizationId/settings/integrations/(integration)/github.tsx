import { Button } from "@/components/generic/Button";
import { Card } from "@/components/layout/Card";
import { Separator } from "@/components/generic/Separator";
import { Heading } from "@/components/generic/Heading";
import { mutators } from "@lydie/zero/mutators";
import { confirmDialog } from "@/stores/confirm-dialog";
import { formatDistanceToNow } from "date-fns";
import { getIntegrationIconUrl } from "@/utils/integration-icons";
import { createFileRoute } from "@tanstack/react-router";
import { DialogTrigger } from "react-aria-components";
import { Modal } from "@/components/generic/Modal";
import { Dialog } from "@/components/generic/Dialog";
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
import { useAuthenticatedApi } from "@/services/api";
import { IntegrationLinkList } from "@/components/integrations/IntegrationLinkList";
import { createId } from "@lydie/core/id";

export const Route = createFileRoute(
  "/__auth/w/$organizationId/settings/integrations/(integration)/github"
)({
  component: RouteComponent,
});

type IntegrationType = "github" | "shopify" | "wordpress";
type ConnectionDialogStep = "selectType" | "configure";

function RouteComponent() {
  const zero = useZero();
  const { createClient } = useAuthenticatedApi();
  const { organizationId } = Route.useParams();

  const [isConnectionDialogOpen, setIsConnectionDialogOpen] = useState(false);
  const [connectionDialogStep, setConnectionDialogStep] =
    useState<ConnectionDialogStep>("selectType");
  const [selectedIntegrationType, setSelectedIntegrationType] =
    useState<IntegrationType | null>(null);
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

  // TODO: maybe a query that gets all resources for the specific integration.
  const [allConnections] = useQuery(
    queries.integrations.byOrganization({
      organizationId: organizationId || "",
    })
  );

  const [allIntegrationLinks] = useQuery(
    queries.integrationLinks.byOrganization({
      organizationId: organizationId || "",
    })
  );

  const connections =
    allConnections?.filter(
      (connection) => connection.integration_type === "github"
    ) ?? undefined;

  const integrationLinks =
    allIntegrationLinks?.filter(
      (link) => link.connection?.integration_type === "github"
    ) ?? undefined;

  const connect = async () => {
    try {
      const client = await createClient();
      const redirectUrl = `/w/${organizationId}/settings/integrations/github`;
      const response = await client.internal.integrations[
        ":type"
      ].oauth.authorize
        .$post({
          param: { type: "github" },
          json: { redirectUrl },
        })
        .then((res: Response) => res.json());
      window.location.href = response.authUrl;
    } catch (error) {
      console.error("GitHub OAuth error:", error);
      toast.error("Failed to start GitHub connection");
    }
  };

  const handleSyncLink = async (linkId: string, linkName: string) => {
    try {
      const client = await createClient();

      toast.loading(`Syncing "${linkName}"...`, { id: `sync-${linkId}` });

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
      zero.mutate(
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

  const disconnect = async () => {
    handleDeleteConnection(connections?.[0]?.id || "", "GitHub");
  };

  const iconUrl = getIntegrationIconUrl("github");

  // TODO: we may support multiple connections in the future, so we need to
  // check if any are enabled
  const isEnabled = connections?.some((c) => c.enabled);

  return (
    <div className="flex flex-col gap-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-x-2">
          <img src={iconUrl} alt="GitHub icon" className="size-8 rounded-sm" />
          <div>
            <Heading level={1}>GitHub Integration</Heading>
            <p className="text-sm/relaxed text-gray-600 mt-1">
              Sync your documents to a GitHub repository.
            </p>
          </div>
        </div>
        {isEnabled ? (
          <Button onPress={disconnect} intent="secondary">
            Disable Integration
          </Button>
        ) : (
          <Button onPress={connect}>Enable Integration</Button>
        )}
      </div>

      <Separator />
      {connections && connections.find((c) => c.enabled) && (
        <div className="flex flex-col gap-y-2">
          <div className="flex justify-between items-start">
            <div className="flex flex-col gap-y-0.5">
              <Heading level={2}>Synced Links</Heading>
              <p className="text-sm/relaxed text-gray-700">
                Manage specific repositories and folders being synced.
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
              Add Link
            </Button>
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
                      {(link.config as any).owner}/{(link.config as any).repo}
                      {(link.config as any).basePath &&
                        `/${(link.config as any).basePath}`}
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
                Add a link to start syncing documents from a specific path.
              </div>
            </Card>
          )}
        </div>
      )}

      {/* <ConnectionDialog
        isOpen={isConnectionDialogOpen}
        onOpenChange={setIsConnectionDialogOpen}
        step={connectionDialogStep}
        selectedType={selectedIntegrationType}
        organizationId={organization?.id || ""}
        onSelectIntegration={handleSelectIntegration}
        onClose={handleCloseDialog}
      /> */}

      {/* Show link configuration dialog */}
      {linkDialogConnectionId && (
        <ConfigureConnectionDialog
          connectionId={linkDialogConnectionId}
          organizationId={organizationId}
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
  organizationId: _organizationId,
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
      metadata?: { defaultBranch?: string };
    }>
  >([]);
  const [selectedResourceId, setSelectedResourceId] = useState<string>("");
  const [branch, setBranch] = useState<string>("");
  const [basePath, setBasePath] = useState<string>("");
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
              ? `Failed to load repositories: ${res.error}`
              : "Failed to load repositories"
          );
          return;
        }

        const resourcesList = (res.resources || []) as Array<{
          id: string;
          name: string;
          fullName: string;
          metadata?: { defaultBranch?: string };
        }>;

        setResources(resourcesList);

        if (resourcesList.length > 0) {
          const first = resourcesList[0];
          setSelectedResourceId(first.id);
          setBranch(first.metadata?.defaultBranch || "main");
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load resources:", error);
          toast.error("Failed to load repositories");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadResources();

    return () => {
      cancelled = true;
    };
  }, [connectionId, createClient]);

  const handleClose = () => {
    setIsOpen(false);
    onClose();
  };

  const zero = useZero();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!selectedResourceId) {
      toast.error("Please select a repository");
      return;
    }

    const selectedResource = resources.find((r) => r.id === selectedResourceId);
    if (!selectedResource) {
      toast.error("Selected repository not found");
      return;
    }

    const [owner, repo] = selectedResource.fullName.split("/");
    const normalizedBasePath = basePath.trim().replace(/^\/+|\/+$/g, "");
    const branchName =
      branch.trim() || selectedResource.metadata?.defaultBranch || "main";

    const name =
      linkName.trim() ||
      `${repo}${normalizedBasePath ? `/${normalizedBasePath}` : ""}`;

    zero.mutate(
      mutators.integrations.createLink({
        id: createId(),
        connectionId,
        organizationId: _organizationId,
        name,
        config: {
          owner,
          repo,
          branch: branchName,
          basePath: normalizedBasePath || "",
        },
      })
    );

    toast.success("Link created successfully");
    handleClose();
  };

  return (
    <DialogTrigger
      isOpen={isOpen}
      onOpenChange={(open) => !open && handleClose()}
    >
      <Modal isDismissable>
        <Dialog>
          <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-y-4">
            <div>
              <Heading level={2}>Add GitHub Link</Heading>
              <p className="text-sm text-gray-600 mt-1">
                Select a repository and folder to sync documents from GitHub.
              </p>
            </div>

            <div className="flex flex-col gap-y-3">
              <div className="flex flex-col gap-y-1">
                <label className="text-sm font-medium text-gray-900">
                  Repository
                </label>
                <select
                  className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                  value={selectedResourceId}
                  onChange={(e) => setSelectedResourceId(e.target.value)}
                  disabled={isLoading}
                >
                  {isLoading && (
                    <option value="">Loading repositories...</option>
                  )}
                  {!isLoading && resources.length === 0 && (
                    <option value="">No repositories available</option>
                  )}
                  {!isLoading &&
                    resources.map((repo) => (
                      <option key={repo.id} value={repo.id}>
                        {repo.fullName}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex flex-col gap-y-1">
                <label className="text-sm font-medium text-gray-900">
                  Branch
                </label>
                <input
                  type="text"
                  className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                />
                <p className="text-xs text-gray-500">
                  Use the branch you want to sync documents from.
                </p>
              </div>

              <div className="flex flex-col gap-y-1">
                <label className="text-sm font-medium text-gray-900">
                  Folder path (optional)
                </label>
                <input
                  type="text"
                  className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                  value={basePath}
                  onChange={(e) => setBasePath(e.target.value)}
                  placeholder="docs/guides"
                />
                <p className="text-xs text-gray-500">
                  Relative path inside the repository. Leave empty to sync from
                  the repository root.
                </p>
              </div>

              <div className="flex flex-col gap-y-1">
                <label className="text-sm font-medium text-gray-900">
                  Link name (optional)
                </label>
                <input
                  type="text"
                  className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                  value={linkName}
                  onChange={(e) => setLinkName(e.target.value)}
                  placeholder="Web Docs"
                />
                <p className="text-xs text-gray-500">
                  Display name for this link. Defaults to the repository and
                  folder path.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-1.5 mt-2">
              <Button
                intent="secondary"
                type="button"
                size="sm"
                onPress={handleClose}
              >
                Cancel
              </Button>
              <Button size="sm" type="submit">
                Create Link
              </Button>
            </div>
          </form>
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
