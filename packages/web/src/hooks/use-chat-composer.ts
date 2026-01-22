import { useEditor, type Editor } from "@tiptap/react"
import { Placeholder } from "@tiptap/extension-placeholder"
import { Mention } from "@tiptap/extension-mention"
import { Extension } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { useMemo, useCallback } from "react"
import tippy from "tippy.js"
import { MentionList } from "@/lib/editor/MentionList"

export type ChatComposerDocument = {
  id: string
  title?: string | null
}

export interface UseChatComposerOptions {
  documents: ChatComposerDocument[]
  onEnter?: () => void
  onChange?: (editor: Editor) => void
  placeholder?: string
  autoFocus?: boolean
  initialContent?: string
  editorClassName?: string
}

export interface ChatComposerHandle {
  editor: Editor | null
  getTextContent: () => string
  getHTMLContent: () => string
  clearContent: () => void
  setContent: (content: string) => void
}

/**
 * Unified chat composer hook for TipTap editor with mention support
 * Handles @ mentions for documents and provides a consistent interface
 * for all chat inputs across the application
 */
export function useChatComposer({
  documents,
  onEnter,
  onChange,
  placeholder = "Ask anything. Use @ to refer to documents",
  autoFocus = false,
  initialContent = "",
  editorClassName = "focus:outline-none min-h-[100px] max-h-[200px] overflow-y-auto text-sm text-gray-700",
}: UseChatComposerOptions): ChatComposerHandle {
  const mentionItems = useMemo(() => {
    return documents.map((doc) => ({
      id: doc.id,
      label: doc.title || "Untitled document",
      type: "document",
    }))
  }, [documents])

  const enterExtension = useMemo(() => {
    return Extension.create({
      addKeyboardShortcuts() {
        return {
          Enter: () => {
            onEnter?.()
            return true
          },
          "Shift-Enter": () => {
            return this.editor.commands.setHardBreak()
          },
        }
      },
    })
  }, [onEnter])

  const mentionSuggestion = useMemo(() => createMentionSuggestion(mentionItems), [mentionItems])

  const extensions = useMemo(() => {
    return [
      StarterKit,
      Placeholder.configure({
        placeholder,
      }),
      Mention.configure({
        HTMLAttributes: {
          class: "mention bg-blue-100 text-blue-800 px-1 rounded",
        },
        renderText({ node }) {
          return `[reference_document:id:${node.attrs.id}]`
        },
        suggestion: mentionSuggestion,
      }),
      enterExtension,
    ]
  }, [placeholder, mentionSuggestion, enterExtension])

  const editor = useEditor({
    extensions,
    content: initialContent,
    autofocus: autoFocus,
    editorProps: {
      attributes: {
        class: editorClassName,
      },
    },
    onUpdate: onChange ? ({ editor }) => onChange(editor) : undefined,
  })

  const getTextContent = useCallback(() => {
    if (!editor) return ""
    return editor.getText()
  }, [editor])

  const getHTMLContent = useCallback(() => {
    if (!editor) return ""
    return editor.getHTML()
  }, [editor])

  const clearContent = useCallback(() => {
    if (!editor) return
    editor.commands.clearContent()
  }, [editor])

  const setContent = useCallback(
    (content: string) => {
      if (!editor) return
      editor.commands.setContent(content)
    },
    [editor],
  )

  return {
    editor,
    getTextContent,
    getHTMLContent,
    clearContent,
    setContent,
  }
}

function createMentionSuggestion(items: Array<{ id: string; label: string }>) {
  return {
    allowSpaces: true,
    char: "@",
    items: ({ query }: { query: string }) => {
      return items.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())).slice(0, 10)
    },
    render() {
      let component: MentionList | null = null
      let popup: any = null

      return {
        onStart: (props: any) => {
          component = new MentionList({
            items: props.items,
            command: props.command,
          })

          if (!props.clientRect) {
            return
          }

          popup = tippy("body", {
            getReferenceClientRect: props.clientRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
          })
        },

        onUpdate(props: any) {
          component?.updateProps(props)

          if (!props.clientRect) {
            return
          }

          if (popup && popup[0]) {
            popup[0].setProps({
              getReferenceClientRect: props.clientRect,
            })
          }
        },

        onKeyDown(props: { event: KeyboardEvent }) {
          if (props.event.key === "Escape") {
            popup?.[0]?.hide()
            return true
          }

          return component?.onKeyDown(props) ?? false
        },

        onExit() {
          popup?.[0]?.destroy()
          component?.destroy()
        },
      }
    },
  }
}
