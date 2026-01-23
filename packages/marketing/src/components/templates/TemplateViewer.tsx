import { useState, useMemo, useEffect } from "react"
import { Sidebar, Editor, DocumentTree } from "@lydie/ui"
import type { DocumentTreeItem } from "@lydie/ui"
import { useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { Button } from "react-aria-components"

// Mock icons - replace with your actual icons
const DocumentIcon = () => (
  <svg className="size-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
    <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
  </svg>
)

const ChevronIcon = ({ isExpanded }: { isExpanded: boolean }) => (
  <svg
    className={`size-3 text-gray-500 transition-transform ${isExpanded ? "rotate-90" : ""}`}
    fill="currentColor"
    viewBox="0 0 20 20"
  >
    <path
      fillRule="evenodd"
      d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
      clipRule="evenodd"
    />
  </svg>
)

const FolderIcon = () => (
  <svg className="size-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
  </svg>
)

type TemplateDocument = {
  id: string
  title: string
  content: string
  children?: TemplateDocument[]
}

type TemplateViewerProps = {
  documents: TemplateDocument[]
  className?: string
}

export function TemplateViewer({ documents, className = "" }: TemplateViewerProps) {
  const [selectedDocId, setSelectedDocId] = useState<string>(documents[0]?.id || "")
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())

  // Convert template documents to tree items
  const treeItems = useMemo((): DocumentTreeItem[] => {
    const convertToTreeItem = (doc: TemplateDocument): DocumentTreeItem => ({
      id: doc.id,
      name: doc.title,
      type: "document" as const,
      children: doc.children?.map(convertToTreeItem),
      isLocked: false,
    })

    return documents.map(convertToTreeItem)
  }, [documents])

  // Find currently selected document
  const selectedDoc = useMemo(() => {
    const findDoc = (docs: TemplateDocument[]): TemplateDocument | null => {
      for (const doc of docs) {
        if (doc.id === selectedDocId) return doc
        if (doc.children) {
          const found = findDoc(doc.children)
          if (found) return found
        }
      }
      return null
    }
    return findDoc(documents)
  }, [documents, selectedDocId])

  // Title editor (read-only)
  const titleEditor = useEditor({
    extensions: [StarterKit],
    content: selectedDoc?.title || "",
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose prose-lg max-w-none focus:outline-none font-semibold text-4xl",
      },
    },
  })

  // Content editor (read-only)
  const contentEditor = useEditor({
    extensions: [StarterKit],
    content: selectedDoc?.content || "",
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose prose-lg max-w-none focus:outline-none",
      },
    },
  })

  // Update editor content when selected document changes
  useEffect(() => {
    if (titleEditor && selectedDoc) {
      titleEditor.commands.setContent(selectedDoc.title || "")
    }
  }, [titleEditor, selectedDoc?.title])

  useEffect(() => {
    if (contentEditor && selectedDoc) {
      contentEditor.commands.setContent(selectedDoc.content || "")
    }
  }, [contentEditor, selectedDoc?.content])

  const handleItemAction = (itemId: string) => {
    setSelectedDocId(itemId)
  }

  const renderItemIcon = (item: DocumentTreeItem, isExpanded: boolean, hasChildren: boolean) => {
    if (!hasChildren) {
      return (
        <div className="text-gray-500 p-1 -ml-1">
          <DocumentIcon />
        </div>
      )
    }

    return (
      <Button slot="chevron" className="text-gray-400 hover:text-gray-700 p-1 -ml-1 group/chevron relative">
        <FolderIcon />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/chevron:opacity-100">
          <ChevronIcon isExpanded={isExpanded} />
        </div>
      </Button>
    )
  }

  return (
    <div
      className={`flex gap-x-1 bg-[#f8f8f8] rounded-xl border border-black/8 shadow-inner p-1 ${className}`}
    >
      <div className="shrink-0 flex w-[240px]">
        <Sidebar
          isCollapsed={false}
          onToggle={() => {}}
          documentSection={
            <div className="flex flex-col grow min-h-0">
              <div className="flex items-center justify-between shrink-0 px-3">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Documents</span>
              </div>
              <div className="min-h-0 overflow-y-auto scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar scrollbar-thumb-gray-200 scrollbar-track-white px-2 py-2">
                <DocumentTree
                  items={treeItems}
                  expandedKeys={expandedKeys}
                  onExpandedChange={(keys) => setExpandedKeys(keys as Set<string>)}
                  onItemAction={handleItemAction}
                  currentDocumentId={selectedDocId}
                  renderItemIcon={renderItemIcon}
                />
              </div>
            </div>
          }
        />
      </div>

      {/* Editor */}
      <div className="bg-white ring ring-black/6 rounded-lg w-full grow overflow-hidden">
        <Editor
          titleEditor={titleEditor}
          contentEditor={contentEditor}
          showPanelGroup={false}
          className="h-full"
        />
      </div>
    </div>
  )
}
