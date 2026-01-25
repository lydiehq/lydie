import {
  ClockRegular,
  MailRegular,
  MoreHorizontalRegular,
  PersonRegular,
  ShieldRegular,
} from "@fluentui/react-icons";
import { formatDistanceToNow } from "date-fns";
import { MenuTrigger, Button as RACButton } from "react-aria-components";

import { Menu, MenuItem } from "@/components/generic/Menu";
import { Card } from "@/components/layout/Card";

type Member = {
  id: string;
  role: string;
  created_at: Date | string;
  user?: {
    name?: string | null;
    email?: string | null;
  } | null;
};

type MembersListProps = {
  members: Member[] | null | undefined;
  onRemoveMember: (memberId: string, memberName: string) => void;
};

export function MembersList({ members, onRemoveMember }: MembersListProps) {
  if (!members || members.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-y-2">
      <h3 className="text-sm font-medium text-gray-700">Members</h3>
      <div className="flex flex-col gap-y-3">
        {members.map((member) => (
          <Card key={member.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-y-2 flex-1">
                <div className="flex items-center gap-2">
                  <PersonRegular className="size-4 text-gray-500" />
                  <span className="font-medium text-gray-900">
                    {member.user?.name || "Unknown"}
                  </span>
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
                <MenuTrigger>
                  <RACButton>
                    <MoreHorizontalRegular className="size-4 text-gray-500" />
                  </RACButton>
                  <Menu>
                    <MenuItem
                      onAction={() =>
                        onRemoveMember(
                          member.id,
                          member.user?.name || member.user?.email || "this member",
                        )
                      }
                      className="text-red-600"
                    >
                      Remove Member
                    </MenuItem>
                  </Menu>
                </MenuTrigger>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
