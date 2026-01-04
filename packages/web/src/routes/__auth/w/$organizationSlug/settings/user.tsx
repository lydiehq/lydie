import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Separator } from "@/components/generic/Separator";
import { Heading } from "@/components/generic/Heading";
import { useQuery } from "@rocicorp/zero/react";
import { queries } from "@lydie/zero/queries";
import { useZero } from "@/services/zero";
import { Switch } from "@/components/generic/Switch";
import { toast } from "sonner";
import { Label } from "@/components/generic/Field";
import { useAtom } from "jotai";
import {
  rootFontSizeAtom,
  FONT_SIZE_MAP,
  type FontSizeOption,
} from "@/stores/font-size";
import { Select, SelectItem } from "@/components/generic/Select";
import { mutators } from "@lydie/zero/mutators";
import { Card } from "@/components/layout/Card";
import { authClient } from "@/utils/auth";
import { Button } from "@/components/generic/Button";
import { formatDistanceToNow } from "date-fns";
import { Check, X, Building2, User as UserIcon, Clock } from "lucide-react";
import { useAuth } from "@/context/auth.context";

export const Route = createFileRoute(
  "/__auth/w/$organizationSlug/settings/user"
)({
  component: RouteComponent,
});

function RouteComponent() {
  const z = useZero();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [userSettings] = useQuery(queries.settings.user({}));
  const [fontSize, setFontSize] = useAtom(rootFontSizeAtom);
  const [userInvitations] = useQuery(
    queries.invitations.byUser({
      email: user.email,
    })
  );

  const handleTogglePersistDocumentTreeExpansion = async (
    isSelected: boolean
  ) => {
    try {
      z.mutate(
        mutators.userSettings.update({
          persistDocumentTreeExpansion: isSelected,
        })
      );
      toast.success(
        isSelected
          ? "Document tree expansion will be saved"
          : "Document tree expansion will not be saved"
      );
    } catch (error) {
      toast.error("Failed to update preference");
      console.error("Settings update error:", error);
    }
  };

  const handleAcceptInvitation = async (
    invitationId: string,
    organizationSlug: string
  ) => {
    try {
      await authClient.organization.acceptInvitation({
        invitationId,
      });
      toast.success("Invitation accepted successfully");
      // Navigate to the organization
      navigate({
        to: "/w/$organizationSlug",
        params: { organizationSlug },
      });
    } catch (error: any) {
      const errorMessage = error?.message || "Failed to accept invitation";
      toast.error(errorMessage);
      console.error("Accept invitation error:", error);
    }
  };

  const handleRejectInvitation = async (invitationId: string) => {
    try {
      await authClient.organization.rejectInvitation({
        invitationId,
      });
      toast.success("Invitation rejected");
    } catch (error: any) {
      const errorMessage = error?.message || "Failed to reject invitation";
      toast.error(errorMessage);
      console.error("Reject invitation error:", error);
    }
  };

  if (!userSettings) {
    return (
      <div className="flex flex-col gap-y-6">
        <div>
          <Heading level={1}>User Settings</Heading>
        </div>
        <Separator />
        <div className="text-sm text-gray-500">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-y-6">
      <div>
        <Heading level={1}>User Settings</Heading>
      </div>
      <Separator />

      {/* Preferences Section */}
      <div className="flex flex-col gap-y-6">
        <div className="flex flex-col gap-y-0.5">
          <h2 className="text-md/none font-medium">Preferences</h2>
          <p className="text-sm/relaxed text-gray-700">
            Customize your personal preferences and settings.
          </p>
        </div>

        <Card className="p-4 flex flex-col gap-y-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-y-1">
              <Label
                id="persist-document-tree-expansion-label"
                className="text-sm font-medium text-gray-900"
              >
                Persist Document Tree Expansion
              </Label>
              <p className="text-xs text-gray-500">
                Save the expanded state of documents in the document tree to
                local storage. When enabled, your expanded folders will remain
                open after refreshing the page.
              </p>
            </div>
            <Switch
              aria-labelledby="persist-document-tree-expansion-label"
              isSelected={userSettings.persist_document_tree_expansion ?? true}
              onChange={handleTogglePersistDocumentTreeExpansion}
            />
          </div>

          <div className="flex flex-col gap-y-4">
            <div className="flex flex-col gap-y-1">
              <Label
                id="root-font-size-label"
                className="text-sm font-medium text-gray-900"
              >
                Root Font Size
              </Label>
              <p className="text-xs text-gray-500">
                Adjust the base font size for the entire application. This
                affects all text sizes since they use REM units. Changes are
                saved locally and persist across sessions.
              </p>
            </div>
            <div className="w-48">
              <Select
                label=""
                selectedKey={fontSize}
                onSelectionChange={(key) => {
                  if (key && typeof key === "string") {
                    setFontSize(key as FontSizeOption);
                  }
                }}
                items={Object.keys(FONT_SIZE_MAP).map((size) => ({
                  id: size,
                  label: size === "default" ? "Default" : size.toUpperCase(),
                }))}
              >
                {(item) => (
                  <SelectItem id={item.id} textValue={item.label}>
                    {item.label}
                  </SelectItem>
                )}
              </Select>
            </div>
          </div>
        </Card>
      </div>

      <Separator />

      {/* Pending Invitations Section */}
      <div className="flex flex-col gap-y-4">
        <div className="flex flex-col gap-y-0.5">
          <Heading level={2}>Pending Invitations</Heading>
          <p className="text-sm/relaxed text-gray-600">
            You have been invited to join these organizations.
          </p>
        </div>

        {userInvitations && userInvitations.length > 0 ? (
          <div className="flex flex-col gap-y-3">
            {userInvitations.map((invitation) => (
              <Card key={invitation.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex flex-col gap-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <Building2 className="size-4 text-gray-500" />
                      <span className="font-medium text-gray-900">
                        {invitation.organization?.name ||
                          "Unknown Organization"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                      <div className="flex items-center gap-1.5">
                        <UserIcon className="size-3.5" />
                        <span>
                          Role:{" "}
                          <span className="capitalize font-medium">
                            {invitation.role || "member"}
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <UserIcon className="size-3.5" />
                        <span>
                          Invited by:{" "}
                          {invitation.inviter?.name ||
                            invitation.inviter?.email ||
                            "Unknown"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="size-3.5" />
                        <span>
                          Expires{" "}
                          {formatDistanceToNow(invitation.expires_at, {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      size="sm"
                      onPress={() =>
                        handleAcceptInvitation(
                          invitation.id,
                          invitation.organization?.slug || ""
                        )
                      }
                    >
                      <Check className="size-3.5 mr-1" />
                      Accept
                    </Button>
                    <Button
                      intent="secondary"
                      size="sm"
                      onPress={() => handleRejectInvitation(invitation.id)}
                    >
                      <X className="size-3.5 mr-1" />
                      Decline
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <div className="text-sm font-medium text-gray-700">
              No pending invitations
            </div>
            <div className="text-xs mt-1 text-gray-500">
              You don't have any pending organization invitations
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
