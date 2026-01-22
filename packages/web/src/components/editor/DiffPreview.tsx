import { useMemo } from "react"
import { Button as RACButton } from "react-aria-components"
import { CheckmarkRegular, DismissRegular } from "@fluentui/react-icons"
import { Diff } from "./Diff"

type DiffPreviewProps = {
  changes: Array<{
    search: string
    replace: string
    explanation: string
  }>
  originalContent: string
  onAccept: () => void
  onReject: () => void
}

function generatePreviewContent(
  originalContent: string,
  changes: Array<{ search: string; replace: string }>,
): string {
  let previewContent = originalContent

  for (const change of changes) {
    if (change.search === "" && originalContent === "") {
      // Handle empty document case
      previewContent = change.replace
    } else if (previewContent.includes(change.search)) {
      previewContent = previewContent.replace(change.search, change.replace)
    }
  }

  return previewContent
}

function extractTextFromHtml(html: string): string {
  // Simple HTML to text conversion for diff display
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function DiffPreview({ changes, originalContent, onAccept, onReject }: DiffPreviewProps) {
  const { originalText, previewText } = useMemo(() => {
    const previewContent = generatePreviewContent(originalContent, changes)
    return {
      originalText: extractTextFromHtml(originalContent),
      previewText: extractTextFromHtml(previewContent),
    }
  }, [originalContent, changes])

  return (
    <div className="ring-1 ring-black/10 rounded-lg overflow-hidden bg-white shadow-sm w-full">
      <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <span className="text-xs text-gray-500">Preview Changes</span>
        <div className="flex items-center gap-2">
          <RACButton
            onPress={onReject}
            className="text-xs font-medium px-3 py-1 rounded-md text-gray-600 hover:bg-gray-100 flex items-center gap-1"
          >
            <DismissRegular className="size-3" />
            Reject
          </RACButton>
          <RACButton
            onPress={onAccept}
            className="text-xs font-medium px-3 py-1 rounded-md text-white bg-blue-600 hover:bg-blue-700 flex items-center gap-1"
          >
            <CheckmarkRegular className="size-3" />
            Accept
          </RACButton>
        </div>
      </div>
      <div className="p-3">
        <Diff oldValue={originalText} newValue={previewText} />
      </div>
    </div>
  )
}
