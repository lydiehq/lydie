import React from "react"
import { useEditor, EditorContent, type Editor, type UseEditorOptions } from "@tiptap/react"
import { StarterKit } from "@tiptap/starter-kit"
import type { Extension } from "@tiptap/core"
import { twMerge } from "tailwind-merge"
import { TipTapToolbar } from "./TipTapToolbar"

interface TipTapEditorProps {
  content?: string
  extensions?: Extension[]
  editorProps?: UseEditorOptions["editorProps"]
  onUpdate?: (editor: Editor) => void
  className?: string
  placeholder?: string
  minHeight?: string
  showToolbar?: boolean
}

export function TipTapEditor({
  content = "",
  extensions = [],
  editorProps,
  onUpdate,
  className,
  placeholder = "Start typing...",
  minHeight = "400px",
  showToolbar = false,
}: TipTapEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, ...extensions],
    content,
    editorProps: {
      attributes: {
        class: twMerge("focus:outline-none p-3 text-sm/relaxed", className),
        style: `min-height: ${minHeight};`,
        "data-placeholder": placeholder,
      },
      ...editorProps,
    },
    onUpdate: ({ editor }) => {
      onUpdate?.(editor)
    },
  })

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden bg-white">
      {showToolbar && editor && <TipTapToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  )
}
