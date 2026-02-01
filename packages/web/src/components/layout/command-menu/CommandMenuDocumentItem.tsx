import { DocumentIcon } from "@lydie/ui/components/icons/DocumentIcon";
import { Command } from "cmdk";

import type { MenuItem } from "./CommandMenuItem";

interface DocumentItem extends MenuItem {
  documentId: string;
}

interface CommandMenuDocumentItemProps {
  item: DocumentItem;
  onSelect?: (item: DocumentItem) => void;
}

export function CommandMenuDocumentItem({ item, onSelect }: CommandMenuDocumentItemProps) {
  return (
    <Command.Item
      key={item.id}
      value={`${item.label} ${item.id}`}
      onSelect={() => onSelect?.(item)}
      className="relative flex cursor-pointer select-none items-center rounded-lg px-3 py-3 text-sm outline-none data-[selected=true]:bg-gray-100 data-[selected=true]:text-gray-950 text-gray-800 transition-colors duration-150"
    >
      <DocumentIcon className="size-4 text-gray-400 mr-2" />
      <div className="flex flex-col flex-1 min-w-0 items-start gap-y-0.5">
        <span className="truncate">{item.label}</span>
      </div>
    </Command.Item>
  );
}
