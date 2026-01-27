import { DismissFilled } from "@fluentui/react-icons";
import { Button } from "react-aria-components";

import { DocumentMultiSelect } from "@/components/assistant/DocumentMultiSelect";

import { DocumentIcon } from "../icons/DocumentIcon";

export type ChatContextItem = {
  id: string;
  type: "document";
  label: string;
  source: "current" | "mention" | "manual";
  removable?: boolean;
};

interface ChatContextListProps {
  items: ChatContextItem[];
  onRemove?: (item: ChatContextItem) => void;
  availableDocuments?: Array<{ id: string; title: string }>;
  onAddDocument?: (documentId: string) => void;
}

export function ChatContextList({
  items,
  onRemove,
  availableDocuments,
  onAddDocument,
}: ChatContextListProps) {
  const showAddButton = availableDocuments && onAddDocument;

  if (items.length === 0 && !showAddButton) return null;

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {showAddButton && (
        <DocumentMultiSelect
          availableDocuments={availableDocuments}
          contextDocumentIds={items.map((item) => item.id)}
          onAddDocument={onAddDocument}
        />
      )}
      {items.map((item) => (
        <ContextChip
          key={`${item.type}-${item.id}-${item.source}`}
          item={item}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

function ContextChip({
  item,
  onRemove,
}: {
  item: ChatContextItem;
  onRemove?: (item: ChatContextItem) => void;
}) {
  const canRemove = item.removable && onRemove;
  const sourceLabel =
    item.source === "current" ? "Current" : item.source === "manual" ? "Selected" : "Mentioned";

  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-white/80 text-xs text-gray-700 px-1 py-0.5 ring ring-black/8">
      <DocumentIcon className="size-3 text-gray-500" />
      <span className="max-w-[180px] truncate">{item.label}</span>
      <span className="text-[10px] text-gray-500">{sourceLabel}</span>
      {canRemove && (
        <Button
          type="button"
          onPress={() => onRemove?.(item)}
          className="ml-0.5 rounded-full hover:bg-gray-200 p-0.5 flex"
          aria-label={`Remove ${item.label} from context`}
        >
          <DismissFilled className="size-3 text-gray-500" />
        </Button>
      )}
    </div>
  );
}
