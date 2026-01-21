import { useEditor, Editor } from "@tiptap/react"
import { getTitleExtensions } from "@lydie/editor/title"
import { useCallback, useMemo } from "react"

export type TitleEditorHookResult = {
  editor: Editor | null
  setContent: (title: string) => void
}

export interface UseTitleEditorOptions {
  initialTitle?: string
  onUpdate?: (title: string) => void
  onEnter?: () => void
  editable?: boolean
  placeholder?: string
}

export function useTitleEditor({
  initialTitle = "",
  onUpdate,
  onEnter,
  editable = true,
  placeholder,
}: UseTitleEditorOptions): TitleEditorHookResult {
  const extensions = useMemo(() => getTitleExtensions({ onEnter, placeholder }), [onEnter, placeholder])

  const editor = useEditor({
    autofocus: editable,
    editable,
    extensions,
    content: initialTitle
      ? {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 1 },
              content: [{ type: "text", text: initialTitle }],
            },
          ],
        }
      : {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 1 },
              content: [],
            },
          ],
        },
    onUpdate: ({ editor }) => {
      onUpdate?.(editor.state.doc.textContent)
    },
    editorProps: {
      attributes: {
        class: "focus:outline-none text-3xl font-medium text-gray-950",
      },
    },
  })

  const setContent = useCallback(
    (title: string) => {
      if (!editor) return
      editor.commands.setContent({
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 1 },
            content: title ? [{ type: "text", text: title }] : [],
          },
        ],
      })
    },
    [editor],
  )

  return { editor, setContent }
}
