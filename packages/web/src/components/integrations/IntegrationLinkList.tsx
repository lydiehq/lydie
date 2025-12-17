import { Menu, MenuItem } from "@/components/generic/Menu";
import { Button as RACButton, MenuTrigger } from "react-aria-components";
import { FolderSync, MoreHorizontal } from "lucide-react";

export type IntegrationLinkListItemProps = {
  id: string;
  name: string;
  nameIcon?: React.ReactNode;
  secondaryText?: React.ReactNode;
  statusIcon: React.ReactNode;
  statusText: string;
  lastSyncedLabel: string;
  canSync: boolean;
  onSync?: () => void;
  onDelete: () => void;
};

export function IntegrationLinkList({
  items,
}: {
  items: IntegrationLinkListItemProps[];
}) {
  if (!items.length) return null;

  return (
    <div className="w-full max-h-none rounded-lg ring ring-black/8 bg-white divide-y divide-gray-100">
      {items.map((item) => (
        <IntegrationLinkListItem key={item.id} {...item} />
      ))}
    </div>
  );
}

export function IntegrationLinkListItem({
  name,
  nameIcon,
  secondaryText,
  statusIcon,
  statusText,
  lastSyncedLabel,
  canSync,
  onSync,
  onDelete,
}: IntegrationLinkListItemProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          {nameIcon}
          <span className="font-medium">{name}</span>
        </div>
        {secondaryText && (
          <div className="flex items-center gap-2 text-xs text-gray-600">
            {secondaryText}
          </div>
        )}
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-1.5 min-w-[120px]">
          {statusIcon}
          <span className="text-sm">{statusText}</span>
        </div>
        <div className="text-sm text-gray-600 min-w-[120px]">
          {lastSyncedLabel}
        </div>
        <MenuTrigger>
          <RACButton>
            <MoreHorizontal className="size-4 text-gray-500" />
          </RACButton>
          <Menu>
            {canSync && onSync && (
              <MenuItem onAction={onSync}>
                <FolderSync className="size-4 mr-2" />
                Sync Now
              </MenuItem>
            )}
            <MenuItem onAction={onDelete} className="text-red-600">
              Delete
            </MenuItem>
          </Menu>
        </MenuTrigger>
      </div>
    </div>
  );
}
