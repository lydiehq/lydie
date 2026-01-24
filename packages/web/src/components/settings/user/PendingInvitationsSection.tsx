import { Card } from "@/components/layout/Card"
import { Button } from "@/components/generic/Button"
import { BuildingRegular, PersonRegular, ClockRegular, CheckmarkRegular, DismissRegular } from "@fluentui/react-icons"
import { formatDistanceToNow } from "date-fns"
import { authClient } from "@/utils/auth"
import { toast } from "sonner"
import { useNavigate } from "@tanstack/react-router"

type Invitation = {
  id: string
  role: string | null
  expires_at: Date | string
  organization?: {
    name?: string | null
    slug?: string | null
  } | null
  inviter?: {
    name?: string | null
    email?: string | null
  } | null
}

type PendingInvitationsSectionProps = {
  invitations: Invitation[] | null | undefined
}

export function PendingInvitationsSection({ invitations }: PendingInvitationsSectionProps) {
  const navigate = useNavigate()

  const handleAcceptInvitation = async (invitationId: string, organizationSlug: string) => {
    try {
      await authClient.organization.acceptInvitation({
        invitationId,
      })
      toast.success("Invitation accepted successfully")
      // Navigate to the organization
      navigate({
        to: "/w/$organizationSlug",
        params: { organizationSlug },
      })
    } catch (error: any) {
      const errorMessage = error?.message || "Failed to accept invitation"
      toast.error(errorMessage)
      console.error("Accept invitation error:", error)
    }
  }

  const handleRejectInvitation = async (invitationId: string) => {
    try {
      await authClient.organization.rejectInvitation({
        invitationId,
      })
      toast.success("Invitation rejected")
    } catch (error: any) {
      const errorMessage = error?.message || "Failed to reject invitation"
      toast.error(errorMessage)
      console.error("Reject invitation error:", error)
    }
  }

  if (!invitations || invitations.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="text-sm font-medium text-gray-700">No pending invitations</div>
        <div className="text-xs mt-1 text-gray-500">
          You don't have any pending organization invitations
        </div>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-y-3">
      {invitations.map((invitation) => (
        <Card key={invitation.id} className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-y-2 flex-1">
              <div className="flex items-center gap-2">
                <BuildingRegular className="size-4 text-gray-500" />
                <span className="font-medium text-gray-900">
                  {invitation.organization?.name || "Unknown Organization"}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                <div className="flex items-center gap-1.5">
                  <PersonRegular className="size-3.5" />
                  <span>
                    Role: <span className="capitalize font-medium">{invitation.role || "member"}</span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <PersonRegular className="size-3.5" />
                  <span>
                    Invited by: {invitation.inviter?.name || invitation.inviter?.email || "Unknown"}
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
            <div className="flex gap-2 ml-4">
              <Button
                size="sm"
                onPress={() =>
                  handleAcceptInvitation(invitation.id, invitation.organization?.slug || "")
                }
              >
                <CheckmarkRegular className="size-3.5 mr-1" />
                Accept
              </Button>
              <Button intent="secondary" size="sm" onPress={() => handleRejectInvitation(invitation.id)}>
                <DismissRegular className="size-3.5 mr-1" />
                Decline
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
