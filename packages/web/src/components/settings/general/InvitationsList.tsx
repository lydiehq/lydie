import {
  ClockRegular,
  DismissRegular,
  MailRegular,
  PersonRegular,
  ShieldRegular,
} from "@fluentui/react-icons";
import { formatDistanceToNow } from "date-fns";

import { Button } from "@/components/generic/Button";
import { Card } from "@/components/layout/Card";

type Invitation = {
  id: string;
  email: string;
  role: string | null;
  expires_at: Date | string;
  inviter?: {
    name?: string | null;
    email?: string | null;
  } | null;
};

type InvitationsListProps = {
  invitations: Invitation[] | null | undefined;
  onCancelInvitation: (invitationId: string, email: string) => void;
};

export function InvitationsList({ invitations, onCancelInvitation }: InvitationsListProps) {
  if (!invitations || invitations.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-y-2">
      <h3 className="text-sm font-medium text-gray-700">Pending Invitations</h3>
      <div className="flex flex-col gap-y-3">
        {invitations.map((invitation) => (
          <Card key={invitation.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-y-2 flex-1">
                <div className="flex items-center gap-2">
                  <MailRegular className="size-4 text-gray-500" />
                  <span className="font-medium text-gray-900">{invitation.email}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                  <div className="flex items-center gap-1.5">
                    <ShieldRegular className="size-3.5" />
                    <span>
                      Role:{" "}
                      <span className="capitalize font-medium">{invitation.role || "member"}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <PersonRegular className="size-3.5" />
                    <span>
                      Invited by:{" "}
                      {invitation.inviter?.name || invitation.inviter?.email || "Unknown"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ClockRegular className="size-3.5" />
                    <span>
                      Expires{" "}
                      {formatDistanceToNow(invitation.expires_at, {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </div>
              </div>
              <div className="ml-4">
                <Button
                  intent="secondary"
                  size="sm"
                  onPress={() => onCancelInvitation(invitation.id, invitation.email)}
                >
                  <DismissRegular className="size-3.5 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
