import { EditorContent } from "@tiptap/react"
import { Button, Form } from "react-aria-components"
import { motion } from "motion/react"
import { ChevronUpIcon, SquareIcon } from "@/icons"
import { useChatEditor } from "@/lib/editor/chat-editor"
import { useCallback, useRef, useMemo } from "react"
import { useOrganization } from "@/context/organization.context"
import { useQuery } from "@rocicorp/zero/react"
import { queries } from "@lydie/zero/queries"
import tippy from "tippy.js"

export interface AssistantInputProps {
  onSubmit: (text: string) => void
  onStop?: () => void
  placeholder?: string
  canStop?: boolean
}

class MentionList {
  items: any[]
  command: any
  element: HTMLElement
  selectedIndex: number

  constructor({ items, command }: { items: any[]; command: any }) {
    this.items = items
    this.command = command
    this.selectedIndex = 0

    this.element = document.createElement("div")
    this.element.className =
      "bg-white border border-gray-200 rounded-lg shadow-lg p-1 max-h-60 overflow-y-auto z-50"
    this.render()
  }

  render() {
    this.element.innerHTML = ""

    this.items.forEach((item, index) => {
      const itemElement = document.createElement("div")
      itemElement.className = `px-3 py-2 cursor-pointer rounded text-sm ${
        index === this.selectedIndex ? "bg-blue-100 text-blue-800" : "text-gray-700 hover:bg-gray-100"
      }`
      itemElement.textContent = item.label
      itemElement.addEventListener("click", () => {
        this.command(item)
      })
      this.element.appendChild(itemElement)
    })
  }

  updateProps(props: any) {
    this.items = props.items
    this.selectedIndex = 0
    this.render()
  }

  onKeyDown({ event }: { event: KeyboardEvent }) {
    if (event.key === "ArrowUp") {
      this.selectedIndex = (this.selectedIndex + this.items.length - 1) % this.items.length
      this.render()
      return true
    }

    if (event.key === "ArrowDown") {
      this.selectedIndex = (this.selectedIndex + 1) % this.items.length
      this.render()
      return true
    }

    if (event.key === "Enter") {
      this.command(this.items[this.selectedIndex])
      return true
    }

    return false
  }

  destroy() {
    this.element.remove()
  }
}

export function AssistantInput({
  onSubmit,
  onStop,
  placeholder = "Ask anything. Use @ to refer to documents",
  canStop = false,
}: AssistantInputProps) {
  const { organization } = useOrganization()
  const [documents] = useQuery(queries.documents.byUpdated({ organizationId: organization.id }))

  const mentionDocuments = useMemo(
    () =>
      (documents ?? []).map((doc) => ({
        id: doc.id,
        title: doc.title,
      })),
    [documents],
  )

  const mentionSuggestion = useMemo(() => {
    const mentionItems = mentionDocuments.map((doc) => ({
      id: doc.id,
      label: doc.title || "Untitled document",
      type: "document",
    }))

    return {
      allowSpaces: true,
      char: "@",
      items: ({ query }: { query: string }) => {
        return mentionItems
          .filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 10)
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
  }, [mentionDocuments])

  const handleSubmitRef = useRef<() => void>(() => {})

  const chatEditor = useChatEditor({
    placeholder,
    mentionSuggestion,
    onEnter: () => {
      const textContent = chatEditor.getTextContent()
      if (textContent.trim()) {
        handleSubmitRef.current()
      }
    },
  })

  const handleSubmit = useCallback(
    (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault()
      const textContent = chatEditor.getTextContent()
      if (!textContent.trim()) return

      onSubmit(textContent)
      chatEditor.clearContent()
    },
    [chatEditor, onSubmit],
  )

  // Assign to ref so it can be called from onEnter callback
  handleSubmitRef.current = handleSubmit

  return (
    <motion.div
      layoutId="assistant-input"
      className="rounded-full bg-white text-sm shadow-surface flex flex-col gap-y-2 relative w-full"
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      initial={false}
    >
      <Form className="relative flex flex-col" onSubmit={handleSubmit}>
        <EditorContent editor={chatEditor.editor} className="text-sm text-start" />
        <Button
          type={canStop ? "button" : "submit"}
          onPress={canStop ? onStop : undefined}
          className="size-9 justify-center items-center flex bottom-1.5 right-1.5 absolute rounded-full border border-black shadow-[0_1px_--theme(--color-white/0.25)_inset,0_1px_3px_--theme(--color-black/0.2)] before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-full active:before:bg-white/0 hover:before:bg-white/6 after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:rounded-full after:bg-linear-to-b after:from-white/14 bg-gray-800 text-white after:mix-blend-overlay"
          isDisabled={false}
        >
          {canStop ? (
            <SquareIcon className="size-3 text-white fill-white" />
          ) : (
            <ChevronUpIcon className="size-4 text-white" />
          )}
        </Button>
      </Form>
    </motion.div>
  )
}
