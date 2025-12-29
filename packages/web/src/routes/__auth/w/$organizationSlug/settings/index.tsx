import { Button } from "@/components/generic/Button";
import { useAuthenticatedApi } from "@/services/api";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useOrganization } from "@/context/organization.context";
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
import { AlertDialog } from "@/components/generic/AlertDialog";
import { Menu, MenuItem } from "@/components/generic/Menu";
import { Copy, Eye, EyeOff, Plus, MoreHorizontal } from "lucide-react";
import { useZero } from "@/services/zero";
import { queries } from "@lydie/zero/queries";
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
import { mutators } from "@lydie/zero/mutators";
import { Card } from "@/components/layout/Card";
import { slugify } from "@lydie/core/utils";

type ApiKeyDialogStep = "create" | "success";

export const Route = createFileRoute("/__auth/w/$organizationSlug/settings/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { createClient } = useAuthenticatedApi();
  const { organization } = useOrganization();
  const z = useZero();
  const navigate = useNavigate();
  const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false);
  const [apiKeyDialogStep, setApiKeyDialogStep] =
    useState<ApiKeyDialogStep>("create");
  const [newApiKey, setNewApiKey] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Workspace name form
  const workspaceForm = useAppForm({
    defaultValues: {
      name: organization?.name || "",
      slug: organization?.slug || "",
    },
    onSubmit: async (values) => {
      if (!organization) {
        toast.error("Organization not found");
        return;
      }

      if (!values.value.name.trim()) {
        toast.error("Workspace name cannot be empty");
        return;
      }

      if (!values.value.slug.trim()) {
        toast.error("Workspace slug cannot be empty");
        return;
      }

      const slugified = slugify(values.value.slug.trim());
      if (slugified !== values.value.slug.trim()) {
        toast.error("Slug contains invalid characters. Only letters, numbers, and hyphens are allowed.");
        return;
      }

      const hasChanges =
        values.value.name.trim() !== organization.name ||
        slugified !== organization.slug;

      if (!hasChanges) {
        return;
      }

      try {
        z.mutate(
          mutators.organization.update({
            organizationId: organization.id,
            name: values.value.name.trim(),
            slug: slugified,
          })
        );
        toast.success("Workspace updated successfully");
      } catch (error: any) {
        const errorMessage =
          error?.message === "Slug is already taken"
            ? "This slug is already taken. Please choose a different one."
            : "Failed to update workspace";
        toast.error(errorMessage);
        console.error("Workspace update error:", error);
      }
    },
  });

  // API key creation form
  const apiKeyForm = useAppForm({
    defaultValues: {
      name: "",
    },
    onSubmit: async (values) => {
      if (!values.value.name.trim()) {
        toast.error("Please enter a name for the API key");
        return;
      }

      const client = await createClient();
      if (!organization) {
        toast.error("Organization not found");
        return;
      }

      try {
        const res = await client.internal.organization["api-key"]
          .$post({
            json: { name: values.value.name.trim() },
          })
          .then((res) => res.json());

        setNewApiKey(res.key);
        setApiKeyDialogStep("success");
        apiKeyForm.reset();
      } catch (error) {
        toast.error("Failed to create API key");
        console.error("API key creation error:", error);
      }
    },
  });

  // Sync workspace name and slug when organization changes
  useEffect(() => {
    if (organization?.name) {
      workspaceForm.setFieldValue("name", organization.name);
    }
    if (organization?.slug) {
      workspaceForm.setFieldValue("slug", organization.slug);
    }
  }, [organization?.name, organization?.slug]);

  const handleRevokeApiKey = async (keyId: string, keyName: string) => {
    if (!organization) {
      toast.error("Organization not found");
      return;
    }
    
    confirmDialog({
      title: `Revoke API Key "${keyName}"`,
      message:
        "This action cannot be undone. The API key will be permanently revoked.",
      onConfirm: () => {
        try {
          z.mutate(mutators.apiKey.revoke({ keyId, organizationId: organization.id }));
          toast.success("API key revoked successfully");
        } catch (error) {
          toast.error("Failed to revoke API key");
          console.error("API key revocation error:", error);
        }
      },
    });
  };

  const handleCopyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      toast.success("API key copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy API key");
      console.error("Copy error:", error);
    }
  };

  const handleCloseApiKeyDialog = () => {
    setIsApiKeyDialogOpen(false);
    setApiKeyDialogStep("create");
    setNewApiKey("");
    setCopied(false);
    setShowKey(false);
  };

  const handleDeleteOrganization = () => {
    if (!organization) {
      toast.error("Organization not found");
      return;
    }

    try {
      z.mutate(
        mutators.organization.delete({ organizationId: organization.id })
      );
      toast.success("Organization deleted successfully");
      // Navigate to home - the route will redirect appropriately
      navigate({ to: "/" });
    } catch (error) {
      toast.error("Failed to delete organization");
      console.error("Organization deletion error:", error);
    }
  };

  const [keys] = useQuery(
    queries.apiKeys.byOrganization({ organizationId: organization?.id || "" })
  );

  return (
    <div className="flex flex-col gap-y-6">
      <div>
        <Heading level={1}>Settings</Heading>
      </div>
      <Separator />

      <div className="flex flex-col gap-y-4">
        <div className="flex flex-col gap-y-0.5">
          <Heading level={2}>General</Heading>
          <p className="text-sm/relaxed text-gray-600">
            Update your workspace settings.
          </p>
        </div>
        <Form
          className="flex flex-col gap-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            workspaceForm.handleSubmit();
          }}
        >
          <workspaceForm.AppField
            name="name"
            children={(field) => <field.TextField label="Workspace Name" />}
          />
          <workspaceForm.AppField
            name="slug"
            listeners={{
              onBlur: (e) => {
                const slugified = slugify(e.value);
                workspaceForm.setFieldValue("slug", slugified);
              },
            }}
            children={(field) => (
              <field.TextField
                label="Workspace Slug"
                description="Used in URLs and API endpoints. Only letters, numbers, and hyphens are allowed."
              />
            )}
          />
          <div className="flex justify-end gap-x-1">
            <Button
              intent="secondary"
              size="sm"
              onPress={() => workspaceForm.reset()}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              type="submit"
              isPending={workspaceForm.state.isSubmitting}
            >
              {workspaceForm.state.isSubmitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </Form>
      </div>
      <Separator />

      {/* API Keys Section */}
      <div className="flex flex-col gap-y-2">
        <div className="flex justify-between">
          <div className="flex flex-col gap-y-0.5">
            <h2 className="text-md/none font-medium">API Key Management</h2>
            <p className="text-sm/relaxed text-gray-700">
              Create an API key to access the API.
            </p>
          </div>
          <Button
            onPress={() => {
              setIsApiKeyDialogOpen(true);
              setApiKeyDialogStep("create");
            }}
            size="sm"
            intent="secondary"
          >
            <Plus className="size-3.5 mr-1" />
            Create API Key
          </Button>
        </div>

        {keys && keys.length > 0 ? (
          <Table
            aria-label="API Keys"
            className="w-full max-h-none rounded-lg ring ring-black/8 bg-white"
          >
            <TableHeader>
              <Column>Name</Column>
              <Column>Created</Column>
              <Column>Last Used</Column>
              <Column>Key</Column>
              <Column width={48}>Actions</Column>
            </TableHeader>
            <TableBody items={keys}>
              {(key) => (
                <Row id={key.id}>
                  <Cell>{key.name}</Cell>
                  <Cell>
                    {formatDistanceToNow(key.created_at, {
                      addSuffix: true,
                    })}
                  </Cell>
                  <Cell>
                    {key.last_used_at
                      ? formatDistanceToNow(key.last_used_at, {
                          addSuffix: true,
                        })
                      : "Never used"}
                  </Cell>
                  <Cell>{key.partial_key}</Cell>
                  <Cell>
                    <MenuTrigger>
                      <RACButton>
                        <MoreHorizontal className="size-4 text-gray-500" />
                      </RACButton>
                      <Menu>
                        <MenuItem
                          onAction={() => handleRevokeApiKey(key.id, key.name)}
                          className="text-red-600"
                        >
                          Revoke Key
                        </MenuItem>
                      </Menu>
                    </MenuTrigger>
                  </Cell>
                </Row>
              )}
            </TableBody>
          </Table>
        ) : (
          <Card className="p-8 text-center">
            <div className="text-sm font-medium text-gray-700">
              No API keys created yet
            </div>
            <div className="text-xs mt-1 text-gray-500">
              Create your first API key to get started
            </div>
          </Card>
        )}
      </div>

      <Separator />

      {/* Danger Zone Section */}
      <div className="flex flex-col gap-y-4">
        <div className="flex flex-col gap-y-0.5">
          <Heading level={2}>Danger Zone</Heading>
          <p className="text-sm/relaxed text-gray-600">
            Irreversible and destructive actions.
          </p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex flex-col gap-y-2">
            <div className="flex flex-col gap-y-0.5">
              <h3 className="text-sm font-medium text-red-900">
                Delete Organization
              </h3>
              <p className="text-sm text-red-700">
                Once you delete an organization, there is no going back. This
                will permanently delete the organization and all associated
                data, including documents, folders, API keys, and settings.
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                intent="danger"
                size="sm"
                onPress={() => setIsDeleteDialogOpen(true)}
              >
                Delete Organization
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ApiKeyDialog
        isOpen={isApiKeyDialogOpen}
        onOpenChange={setIsApiKeyDialogOpen}
        step={apiKeyDialogStep}
        apiKeyForm={apiKeyForm}
        newApiKey={newApiKey}
        showKey={showKey}
        copied={copied}
        onShowKeyChange={setShowKey}
        onCopyKey={handleCopyKey}
        onClose={handleCloseApiKeyDialog}
      />

      <DialogTrigger
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <Modal isDismissable>
          <AlertDialog
            title="Delete Organization"
            variant="destructive"
            actionLabel="Delete Organization"
            cancelLabel="Cancel"
            onAction={handleDeleteOrganization}
          >
            Are you absolutely sure you want to delete this organization? This
            action cannot be undone. This will permanently delete the
            organization and all associated data, including:
            <ul className="mt-2 ml-4 list-disc text-sm">
              <li>All documents and folders</li>
              <li>All API keys</li>
              <li>All organization settings</li>
              <li>All conversations and messages</li>
              <li>All other associated data</li>
            </ul>
          </AlertDialog>
        </Modal>
      </DialogTrigger>
    </div>
  );
}

type ApiKeyDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  step: ApiKeyDialogStep;
  apiKeyForm: any; // Form type from useAppForm is complex to type properly
  newApiKey: string;
  showKey: boolean;
  copied: boolean;
  onShowKeyChange: (show: boolean) => void;
  onCopyKey: (key: string) => void;
  onClose: () => void;
};

function ApiKeyDialog({
  isOpen,
  onOpenChange,
  step,
  apiKeyForm,
  newApiKey,
  showKey,
  copied,
  onShowKeyChange,
  onCopyKey,
  onClose,
}: ApiKeyDialogProps) {
  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal isDismissable>
        <Dialog>
          {step === "create" ? (
            <Form
              onSubmit={(e) => {
                e.preventDefault();
                apiKeyForm.handleSubmit();
              }}
            >
              <div className="p-4 flex flex-col gap-y-4">
                <Heading level={2}>Create API Key</Heading>
                <apiKeyForm.AppField
                  name="name"
                  children={(field: any) => (
                    <field.TextField
                      placeholder="e.g., Production API, Development Key"
                      autoFocus
                      isRequired
                    />
                  )}
                />
                <div className="flex justify-end gap-1.5">
                  <Button
                    intent="secondary"
                    onPress={() => {
                      onOpenChange(false);
                      apiKeyForm.reset();
                    }}
                    type="button"
                    size="sm"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    type="submit"
                    isPending={apiKeyForm.state.isSubmitting}
                    isDisabled={apiKeyForm.state.isSubmitting}
                  >
                    {apiKeyForm.state.isSubmitting
                      ? "Creating..."
                      : "Create API Key"}
                  </Button>
                </div>
              </div>
            </Form>
          ) : (
            <div className="p-6">
              <Heading level={2} className="text-lg font-semibold mb-4">
                API Key Created Successfully
              </Heading>

              <div className="mb-6">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
                  <p className="text-sm text-amber-800">
                    <strong>Important:</strong> This is the only time you will
                    be able to see the full API key. Make sure to copy it and
                    store it securely before closing this dialog.
                  </p>
                </div>

                <div className="relative">
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border">
                    <code className="flex-1 font-mono text-sm break-all">
                      {showKey
                        ? newApiKey
                        : `${newApiKey.slice(0, 12)}${"•".repeat(24)}`}
                    </code>
                    <div className="flex gap-1">
                      <Button
                        intent="secondary"
                        size="sm"
                        onPress={() => onShowKeyChange(!showKey)}
                        className="px-2"
                      >
                        {showKey ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </Button>
                      <Button
                        intent="secondary"
                        size="sm"
                        onPress={() => onCopyKey(newApiKey)}
                        className="px-2"
                      >
                        <Copy className="size-4" />
                      </Button>
                    </div>
                  </div>
                  {copied && (
                    <div className="absolute -bottom-6 left-0 text-xs text-green-600">
                      Copied to clipboard!
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button onPress={onClose}>Done</Button>
              </div>
            </div>
          )}
        </Dialog>
      </Modal>
    </DialogTrigger>
  );
}
