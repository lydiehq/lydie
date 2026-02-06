import {
  ClockRegular,
  MailRegular,
  MoreHorizontalRegular,
  PersonRegular,
  ShieldRegular,
  CrownRegular,
} from "@fluentui/react-icons";
import { Menu, MenuItem } from "@lydie/ui/components/generic/Menu";
import { Tooltip, TooltipTrigger } from "@lydie/ui/components/generic/Tooltip";
import { formatDistanceToNow } from "date-fns";
import { MenuTrigger, Button as RACButton } from "react-aria-components";

import { Card } from "@/components/layout/Card";

type Member = {
  id: string;
  role: string;
  user_id: string;
  created_at: Date | string | number;
  user?: {
    name?: string | null;
    email?: string | null;
  } | null;
};

type MembersListProps = {
  members: Member[] | null | undefined;
  currentUserId: string | undefined;
  onRemoveMember: (memberId: string, memberName: string) => void;
};

export function MembersList({ members, currentUserId, onRemoveMember }: MembersListProps) {
  if (!members || members.length === 0) {
    return null;
  }

  // Sort members: owner first, then by name
  const sortedMembers = [...members].sort((a, b) => {
    // Owner always first
    if (a.role === "owner" && b.role !== "owner") return -1;
    if (b.role === "owner" && a.role !== "owner") return 1;
    // Then sort by name
    const nameA = a.user?.name || a.user?.email || "";
    const nameB = b.user?.name || b.user?.email || "";
    return nameA.localeCompare(nameB);
  });

  return (
    <div className="flex flex-col gap-y-2">
      <h3 className="text-sm font-medium text-gray-700">Members</h3>
      <div className="flex flex-col gap-y-3">
        {sortedMembers.map((member) => {
          const isCurrentUser = member.user_id === currentUserId;
          const isOwner = member.role === "owner";
          const displayName = member.user?.name || "Unknown";
          const memberNameForAction = member.user?.name || member.user?.email || "this member";

          return (
            <Card key={member.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <PersonRegular className="size-4 text-gray-500" />
                    <span className="font-medium text-gray-900">
                      {displayName}
                    </span>
                    {isCurrentUser && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                        you
                      </span>
                    )}
                    {isOwner && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                        <CrownRegular className="size-3" />
                        owner
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                    <div className="flex items-center gap-1.5">
                      <MailRegular className="size-3.5" />
                      <span>{member.user?.email || "Unknown"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ShieldRegular className="size-3.5" />
                      <span>
                        Role: <span className="capitalize font-medium">{member.role}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ClockRegular className="size-3.5" />
                      <span>
                        Joined{" "}
                        {formatDistanceToNow(member.created_at, {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="ml-4">
                  {isOwner ? (
                    <TooltipTrigger>
                      <RACButton isDisabled className="opacity-50 cursor-not-allowed">
                        <MoreHorizontalRegular className="size-4 text-gray-400" />
                      </RACButton>
                      <Tooltip>Workspace owner cannot be removed</Tooltip>
                    </TooltipTrigger>
                  ) : (
                    <MenuTrigger>
                      <RACButton>
                        <MoreHorizontalRegular className="size-4 text-gray-500" />
                      </RACButton>
                      <Menu>
                        <MenuItem
                          onAction={() =>
                            onRemoveMember(
                              member.id,
                              memberNameForAction,
                            )
                          }
                          className="text-red-600"
                        >
                          Remove Member
                        </MenuItem>
                      </Menu>
                    </MenuTrigger>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
