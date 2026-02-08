import { AddRegular } from "@fluentui/react-icons";
import { Button } from "@lydie/ui/components/generic/Button";
import { Heading } from "@lydie/ui/components/generic/Heading";
import { SectionHeader } from "@lydie/ui/components/layout/SectionHeader";
import { Separator } from "@lydie/ui/components/layout/Separator";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Card } from "@/components/layout/Card";
import { ApiKeyDialog } from "@/components/settings/general/ApiKeyDialog";
import { ApiKeysList } from "@/components/settings/general/ApiKeysList";
import { DeleteOrganizationSection } from "@/components/settings/general/DeleteOrganizationSection";
import { InvitationsList } from "@/components/settings/general/InvitationsList";
import { InviteDialog } from "@/components/settings/general/InviteDialog";
import { MembersList } from "@/components/settings/general/MembersList";
import { WorkspaceForm } from "@/components/settings/general/WorkspaceForm";
import { useAuth } from "@/context/auth.context";
import { useOrganization } from "@/context/organization.context";
import { useAppForm } from "@/hooks/use-app-form";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useAuthenticatedApi } from "@/services/api";
import { useZero } from "@/services/zero";
import { confirmDialog } from "@/stores/confirm-dialog";
import { authClient } from "@/utils/auth";

type ApiKeyDialogStep = "create" | "success";

export const Route = createFileRoute("/__auth/w/$organizationSlug/settings/")({
  component: RouteComponent,
});

function RouteComponent() {
  useDocumentTitle("Settings");

  const { createClient } = useAuthenticatedApi();
  const { organization } = useOrganization();
  const { user } = useAuth();
  const z = useZero();
  const navigate = useNavigate();
  const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false);
  const [apiKeyDialogStep, setApiKeyDialogStep] = useState<ApiKeyDialogStep>("create");
  const [newApiKey, setNewApiKey] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);

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

  const handleRevokeApiKey = async (keyId: string, keyName: string) => {
    confirmDialog({
      title: `Revoke API Key "${keyName}"`,
      message: "This action cannot be undone. The API key will be permanently revoked.",
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
    try {
      z.mutate(mutators.organization.delete({ organizationId: organization.id }));
      toast.success("Organization deleted successfully");
      navigate({ to: "/" });
    } catch (error) {
      toast.error("Failed to delete organization");
      console.error("Organization deletion error:", error);
    }
  };

  const [keys] = useQuery(queries.apiKeys.byOrganization({ organizationId: organization.id }));

  const [members] = useQuery(queries.members.byOrganization({ organizationId: organization.id }));

  const [invitations] = useQuery(
    queries.invitations.byOrganization({
      organizationId: organization.id,
    }),
  );

  const invitationForm = useAppForm({
    defaultValues: {
      email: "",
      role: "member" as "member" | "admin",
    },
    onSubmit: async (values) => {
      if (!values.value.email.trim()) {
        toast.error("Please enter an email address");
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(values.value.email.trim())) {
        toast.error("Please enter a valid email address");
        return;
      }

      try {
        await authClient.organization.inviteMember({
          organizationId: organization.id,
          email: values.value.email.trim(),
          role: values.value.role,
        });
        toast.success("Invitation sent successfully");
        invitationForm.reset();
        setIsInviteDialogOpen(false);
      } catch (error: any) {
        const errorMessage = error?.message?.includes("already")
          ? "This user is already a member or has a pending invitation"
          : "Failed to send invitation";
        toast.error(errorMessage);
        console.error("Invitation error:", error);
      }
    },
  });

  const handleCancelInvitation = async (invitationId: string, email: string) => {
    if (!organization) {
      toast.error("Organization not found");
      return;
    }

    confirmDialog({
      title: `Cancel Invitation`,
      message: `Are you sure you want to cancel the invitation for ${email}?`,
      onConfirm: async () => {
        try {
          await authClient.organization.cancelInvitation({
            organizationId: organization.id,
            invitationId,
          });
          toast.success("Invitation canceled");
        } catch (error) {
          toast.error("Failed to cancel invitation");
          console.error("Cancel invitation error:", error);
        }
      },
    });
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!organization) {
      toast.error("Organization not found");
      return;
    }

    // Check if this is a paid workspace
    const isPaidWorkspace =
      organization.subscriptionStatus === "active" &&
      (organization.subscriptionPlan === "monthly" || organization.subscriptionPlan === "yearly");

    let billingMessage = "";
    if (isPaidWorkspace) {
      const pricePerSeat =
        organization.subscriptionPlan === "yearly"
          ? 14 // PLAN_LIMITS[PLAN_TYPES.YEARLY].price
          : 18; // PLAN_LIMITS[PLAN_TYPES.MONTHLY].price
      billingMessage = `\n\nBilling Impact:\n• This will free 1 seat\n• Your next bill will be reduced by $${pricePerSeat} (prorated)`;
    }

    confirmDialog({
      title: `Remove Member`,
      message: `Are you sure you want to remove ${memberName} from this organization?${billingMessage}`,
      onConfirm: async () => {
        try {
          await authClient.organization.removeMember({
            organizationId: organization.id,
            memberIdOrEmail: memberId,
          });
          toast.success("Member removed successfully");
        } catch (error) {
          toast.error("Failed to remove member");
          console.error("Remove member error:", error);
        }
      },
    });
  };

  return (
    <div className="flex flex-col gap-y-6">
      <Heading level={1}>Settings</Heading>
      <Separator />
      <div className="flex flex-col gap-y-4">
        <SectionHeader heading="General" description="Update your workspace settings." />
        <WorkspaceForm organization={organization} />
      </div>
      <Separator />

      {/* Members & Invitations Section */}
      <div className="flex flex-col gap-y-4">
        <div className="flex justify-between items-start">
          <SectionHeader
            heading="Members & Invitations"
            description="Manage who has access to this workspace."
          />
          <Button onPress={() => setIsInviteDialogOpen(true)} size="sm" intent="secondary">
            <AddRegular className="size-3.5 mr-1" />
            Invite Member
          </Button>
        </div>

        <MembersList
          members={members}
          currentUserId={user?.id}
          onRemoveMember={handleRemoveMember}
        />
        <InvitationsList invitations={invitations} onCancelInvitation={handleCancelInvitation} />

        {(!members || members.length === 0) && (!invitations || invitations.length === 0) && (
          <Card className="p-8 text-center">
            <div className="text-sm font-medium text-gray-700">No members or invitations yet</div>
            <div className="text-xs mt-1 text-gray-500">
              Invite your first team member to get started
            </div>
          </Card>
        )}
      </div>

      <Separator />

      {/* API Keys Section */}
      <div className="flex flex-col gap-y-2">
        <div className="flex justify-between">
          <SectionHeader
            heading="API Key Management"
            description="Create an API key to access the API."
            descriptionClassName="text-sm/relaxed text-gray-700"
          />
          <Button
            onPress={() => {
              setIsApiKeyDialogOpen(true);
              setApiKeyDialogStep("create");
            }}
            size="sm"
            intent="secondary"
          >
            <AddRegular className="size-3.5 mr-1" />
            Create API Key
          </Button>
        </div>

        <ApiKeysList keys={keys} onRevokeKey={handleRevokeApiKey} />
      </div>

      <Separator />

      <DeleteOrganizationSection
        isDeleteDialogOpen={isDeleteDialogOpen}
        onDeleteDialogOpenChange={setIsDeleteDialogOpen}
        onDelete={handleDeleteOrganization}
      />

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

      <InviteDialog
        isOpen={isInviteDialogOpen}
        onOpenChange={setIsInviteDialogOpen}
        invitationForm={invitationForm}
      />
    </div>
  );
}
