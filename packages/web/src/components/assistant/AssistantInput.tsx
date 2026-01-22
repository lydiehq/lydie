import { EditorContent } from "@tiptap/react"
import { Button, Form } from "react-aria-components"
import { motion } from "motion/react"
import { ChevronUpIcon, SquareIcon } from "@/icons"
import { useChatComposer } from "@/hooks/use-chat-composer"
import { useCallback, useRef, useMemo, useEffect, useState } from "react"
import { useOrganization } from "@/context/organization.context"
import { useQuery } from "@rocicorp/zero/react"
import { queries } from "@lydie/zero/queries"
import { ChatContextList, type ChatContextItem } from "@/components/chat/ChatContextList"
import { getReferenceDocumentIds } from "@/utils/parse-references"

export interface AssistantInputProps {
  onSubmit: (text: string, contextDocumentIds: string[]) => void
  onStop?: () => void
  placeholder?: string
  canStop?: boolean
  initialPrompt?: string
}

export function AssistantInput({
  onSubmit,
  onStop,
  placeholder = "Ask anything. Use @ to refer to documents",
  canStop = false,
  initialPrompt,
}: AssistantInputProps) {
  const { organization } = useOrganization()
  const [documents] = useQuery(queries.documents.byUpdated({ organizationId: organization.id }))
  const [mentionedDocumentIds, setMentionedDocumentIds] = useState<string[]>([])

  const availableDocuments = useMemo(
    () =>
      (documents ?? []).map((doc) => ({
        id: doc.id,
        title: doc.title,
      })),
    [documents],
  )

  const documentTitleById = useMemo(() => {
    return new Map(availableDocuments.map((doc) => [doc.id, doc.title || "Untitled document"]))
  }, [availableDocuments])

  const handleSubmitRef = useRef<() => void>(() => {})

  const chatEditor = useChatComposer({
    documents: availableDocuments,
    placeholder,
    editorClassName: "focus:outline-none text-sm text-gray-700 px-5 py-3.5",
    onEnter: () => {
      const textContent = chatEditor.getTextContent()
      if (textContent.trim()) {
        handleSubmitRef.current()
      }
    },
  })

  useEffect(() => {
    const editor = chatEditor.editor
    if (!editor) return

    const updateMentions = () => {
      const textContent = chatEditor.getTextContent()
      setMentionedDocumentIds(getReferenceDocumentIds(textContent))
    }

    updateMentions()
    editor.on("update", updateMentions)

    return () => {
      editor.off("update", updateMentions)
    }
  }, [chatEditor.editor, chatEditor.getTextContent])

  useEffect(() => {
    if (initialPrompt && chatEditor.editor && !chatEditor.getTextContent()) {
      chatEditor.setContent(initialPrompt)
    }
  }, [initialPrompt, chatEditor])

  const contextItems = useMemo(() => {
    return Array.from(new Set(mentionedDocumentIds)).map<ChatContextItem>((documentId) => ({
      id: documentId,
      type: "document",
      label: documentTitleById.get(documentId) || "Untitled document",
      source: "mention",
    }))
  }, [documentTitleById, mentionedDocumentIds])

  const handleSubmit = useCallback(
    (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault()
      const textContent = chatEditor.getTextContent()
      if (!textContent.trim()) return

      onSubmit(textContent, contextItems.map((item) => item.id))
      chatEditor.clearContent()
    },
    [chatEditor, onSubmit, contextItems],
  )

  handleSubmitRef.current = handleSubmit

  return (
    <motion.div
      layoutId="assistant-input"
      className="rounded-full bg-white text-sm shadow-surface flex flex-col gap-y-2 relative w-full"
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      initial={false}
    >
      <Form className="relative flex flex-col" onSubmit={handleSubmit}>
        <ChatContextList items={contextItems} />
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
