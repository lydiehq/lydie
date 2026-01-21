import { XIcon } from "lucide-react"
import { DocumentIcon } from "@/icons"

export type ChatContextItem = {
  id: string
  type: "document"
  label: string
  source: "current" | "mention"
  removable?: boolean
}

interface ChatContextListProps {
  items: ChatContextItem[]
  onRemove?: (item: ChatContextItem) => void
}

export function ChatContextList({ items, onRemove }: ChatContextListProps) {
  if (items.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <ContextChip key={`${item.type}-${item.id}-${item.source}`} item={item} onRemove={onRemove} />
      ))}
    </div>
  )
}

function ContextChip({
  item,
  onRemove,
}: {
  item: ChatContextItem
  onRemove?: (item: ChatContextItem) => void
}) {
  const canRemove = item.removable && onRemove
  const sourceLabel = item.source === "current" ? "Current" : "Mentioned"

  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-white/80 text-xs text-gray-700 px-2 py-1 ring ring-black/8">
      <DocumentIcon className="size-3 text-gray-500" />
      <span className="max-w-[180px] truncate">{item.label}</span>
      <span className="text-[10px] text-gray-500">{sourceLabel}</span>
      {canRemove && (
        <button
          type="button"
          onClick={() => onRemove?.(item)}
          className="ml-0.5 rounded-full hover:bg-gray-200 p-0.5"
          aria-label={`Remove ${item.label} from context`}
        >
          <XIcon className="size-3 text-gray-500" />
        </button>
      )}
    </div>
  )
}
