import { File } from "lucide-react"

interface EmptyStateProps {
  hasSearch: boolean
}

export function EmptyState({ hasSearch }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <DocumentIcon className="size-16 text-gray-300 mb-4" />
      <p className="text-gray-600 mb-2">{hasSearch ? "No results found" : "No documents yet"}</p>
      <p className="text-sm text-gray-500 mb-4">
        {hasSearch ? "Try a different search term" : "Get started by creating your first document"}
      </p>
    </div>
  )
}
