import { EditorContent } from "@tiptap/react"
import type { Editor as TiptapEditor } from "@tiptap/core"
import { Panel, PanelGroup } from "react-resizable-panels"
import type { ReactNode } from "react"

export type EditorProps = {
  titleEditor: TiptapEditor | null
  contentEditor: TiptapEditor | null
  toolbar?: ReactNode
  coverImage?: ReactNode
  metadata?: ReactNode
  isLocked?: boolean
  lockMessage?: string
  className?: string
  showPanelGroup?: boolean
}

export function Editor({
  titleEditor,
  contentEditor,
  toolbar,
  coverImage,
  metadata,
  isLocked = false,
  lockMessage = "This page is managed by an integration and cannot be edited.",
  className = "",
  showPanelGroup = true,
}: EditorProps) {
  if (!contentEditor || !titleEditor) {
    return null
  }

  const editorContent = (
    <>
      {toolbar}
      {isLocked && (
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
          {lockMessage}
        </div>
      )}
      <div className="flex py-8 overflow-y-auto grow flex-col scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar scrollbar-thumb-gray-200 scrollbar-track-white relative px-4">
        <div className="mx-auto w-full h-full max-w-[65ch] pb-8 flex flex-col">
          {coverImage}
          <EditorContent
            editor={titleEditor}
            aria-label="Document title"
            className="mb-6 editor-content prose prose-lg max-w-none focus:outline-none font-semibold text-4xl"
          />
          {metadata}
          <EditorContent
            aria-label="Document content"
            editor={contentEditor}
            className="block grow editor-content"
          />
        </div>
      </div>
    </>
  )

  if (!showPanelGroup) {
    return (
      <div className={`h-full flex flex-col overflow-hidden ${className}`}>
        <div className="overflow-hidden flex flex-col grow">{editorContent}</div>
      </div>
    )
  }

  return (
    <div className={`h-screen py-1 pr-1 flex flex-col pl-1 ${className}`}>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <PanelGroup autoSaveId="editor-panel-group" direction="horizontal">
          <Panel minSize={20} defaultSize={100} className="flex flex-col grow relative">
            {editorContent}
          </Panel>
        </PanelGroup>
      </div>
    </div>
  )
}
