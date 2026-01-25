import { ClockRegular, KeyRegular, MoreHorizontalRegular } from "@fluentui/react-icons";
import { formatDistanceToNow } from "date-fns";
import { MenuTrigger, Button as RACButton } from "react-aria-components";

import { Menu, MenuItem } from "@/components/generic/Menu";
import { Card } from "@/components/layout/Card";

type ApiKey = {
  id: string;
  name: string;
  partial_key: string;
  created_at: Date | string;
  last_used_at: Date | string | null;
};

type ApiKeysListProps = {
  keys: ApiKey[] | null | undefined;
  onRevokeKey: (keyId: string, keyName: string) => void;
};

export function ApiKeysList({ keys, onRevokeKey }: ApiKeysListProps) {
  if (!keys || keys.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="text-sm font-medium text-gray-700">No API keys created yet</div>
        <div className="text-xs mt-1 text-gray-500">Create your first API key to get started</div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-y-3">
      {keys.map((key) => (
        <Card key={key.id} className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-y-2 flex-1">
              <div className="flex items-center gap-2">
                <KeyRegular className="size-4 text-gray-500" />
                <span className="font-medium text-gray-900">{key.name}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                <div className="flex items-center gap-1.5">
                  <ClockRegular className="size-3.5" />
                  <span>
                    Created{" "}
                    {formatDistanceToNow(key.created_at, {
                      addSuffix: true,
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ClockRegular className="size-3.5" />
                  <span>
                    Last used:{" "}
                    {key.last_used_at
                      ? formatDistanceToNow(key.last_used_at, {
                          addSuffix: true,
                        })
                      : "Never"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <KeyRegular className="size-3.5" />
                  <code className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                    {key.partial_key}
                  </code>
                </div>
              </div>
            </div>
            <div className="ml-4">
              <MenuTrigger>
                <RACButton>
                  <MoreHorizontalRegular className="size-4 text-gray-500" />
                </RACButton>
                <Menu>
                  <MenuItem onAction={() => onRevokeKey(key.id, key.name)} className="text-red-600">
                    Revoke Key
                  </MenuItem>
                </Menu>
              </MenuTrigger>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
