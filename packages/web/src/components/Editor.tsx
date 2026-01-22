import { EditorContent } from "@tiptap/react"
import { useZero } from "@/services/zero"
import { Panel, PanelGroup } from "react-resizable-panels"
import { useRef, useState, useCallback, useEffect } from "react"
import { EditorToolbar } from "./editor/EditorToolbar"
import { useTitleEditor } from "@/lib/editor/title-editor"
import { SelectedContentProvider, useSelectedContent } from "@/context/selected-content.context"
import { LinkPopover } from "./editor/LinkPopover"
import { BubbleMenu } from "./editor/BubbleMenu"
import type { QueryResultType } from "@rocicorp/zero"
import { queries } from "@lydie/zero/queries"
import { Surface } from "./layout/Surface"
import { mutators } from "@lydie/zero/mutators"
import { useDocumentEditor } from "@/lib/editor/document-editor"
import { DocumentMetadataTabs } from "./editor/DocumentMetadataTabs"

type Props = {
  doc: NonNullable<QueryResultType<typeof queries.documents.byId>>
}

export function Editor({ doc }: Props) {
  return (
    <SelectedContentProvider>
      <EditorContainer doc={doc} />
    </SelectedContentProvider>
  )
}

function EditorContainer({ doc }: Props) {
  const z = useZero()
  const [title, setTitle] = useState(doc.title || "")
  const { setFocusedContent } = useSelectedContent()
  const openLinkDialogRef = useRef<(() => void) | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isLocked = doc.is_locked ?? false

  const handleTitleUpdate = (newTitle: string) => {
    const finalTitle = newTitle.trim()
    setTitle(finalTitle)
  }

  const handleOpenLinkDialog = useCallback(() => {
    if (openLinkDialogRef.current) {
      openLinkDialogRef.current()
    }
  }, [])

  const registerLinkDialogCallback = useCallback((callback: () => void) => {
    openLinkDialogRef.current = callback
  }, [])

  const selectText = (selectedText: string) => {
    setFocusedContent(selectedText)
  }

  const contentEditor = useDocumentEditor({
    doc,
    onTextSelect: selectText,
    onAddLink: handleOpenLinkDialog,
  })

  const titleEditor = useTitleEditor({
    initialTitle: doc.title || "",
    onUpdate: handleTitleUpdate,
    onEnter: () => {
      if (contentEditor.editor) {
        contentEditor.editor.commands.focus(0)
      }
    },
    editable: !isLocked,
  })

  useEffect(() => {
    if (!titleEditor.editor) return

    const handleBlur = () => {
      const finalTitle = title.trim()
      z.mutate(
        mutators.document.update({
          documentId: doc.id,
          title: finalTitle,
          indexStatus: "outdated",
          organizationId: doc.organization_id,
        }),
      )
    }

    const editorElement = titleEditor.editor.view.dom
    editorElement.addEventListener("blur", handleBlur)

    return () => {
      editorElement.removeEventListener("blur", handleBlur)
    }
  }, [titleEditor.editor, title, z, doc.id, doc.organization_id])

  if (!contentEditor.editor || !titleEditor.editor) {
    return null
  }

  return (
    <div className="h-screen py-1 pr-1 flex flex-col pl-1">
      <Surface className="overflow-hidden">
        <PanelGroup autoSaveId="editor-panel-group" direction="horizontal">
          <Panel minSize={20} defaultSize={75} className="flex flex-col grow relative">
            <EditorToolbar editor={contentEditor.editor} doc={doc} onAddLink={handleOpenLinkDialog} />
            {isLocked && (
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                This page is managed by an integration and cannot be edited.
              </div>
            )}
            <div
              ref={scrollContainerRef}
              className="flex py-8 overflow-y-auto grow flex-col scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar scrollbar-thumb-gray-200 scrollbar-track-white relative px-4"
            >
              <div className="mx-auto w-full h-full max-w-[65ch] pb-8 flex flex-col">
                <EditorContent editor={titleEditor.editor} aria-label="Document title" className="mb-6" />
                <DocumentMetadataTabs
                  doc={doc}
                  initialFields={(doc.custom_fields as Record<string, string | number>) || {}}
                />
                <LinkPopover editor={contentEditor.editor} onOpenLinkDialog={registerLinkDialogCallback} />
                <BubbleMenu editor={contentEditor.editor} onAddLink={handleOpenLinkDialog} />
                <EditorContent
                  aria-label="Document content"
                  editor={contentEditor.editor}
                  className="block grow"
                />
              </div>
            </div>
            <BottomBar editor={contentEditor.editor} lastSaved={new Date(doc.updated_at)} />
          </Panel>
        </PanelGroup>
      </Surface>
    </div>
  )
}
