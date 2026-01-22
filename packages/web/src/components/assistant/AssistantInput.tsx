import { EditorContent } from "@tiptap/react"
import { Button, Form } from "react-aria-components"
import { motion } from "motion/react"
import { ChevronUpRegular, SquareRegular, ArrowCircleUpRegular } from "@fluentui/react-icons"
import { useChatComposer } from "@/hooks/use-chat-composer"
import { useCallback, useRef, useEffect, useState } from "react"
import { ChatContextList, type ChatContextItem } from "@/components/chat/ChatContextList"
import { getReferenceDocumentIds } from "@/utils/parse-references"
import { useDocumentContext } from "@/hooks/use-document-context"

export interface AssistantInputProps {
  onSubmit: (text: string, contextDocumentIds: string[]) => void
  onStop?: () => void
  placeholder?: string
  canStop?: boolean
  initialPrompt?: string
  currentDocumentId?: string | null
  onRemoveContext?: (item: ChatContextItem) => void
  editorClassName?: string
  variant?: "rounded" | "flat"
  content?: string
}

export function AssistantInput({
  onSubmit,
  onStop,
  placeholder = "Ask anything. Use @ to refer to documents",
  canStop = false,
  initialPrompt,
  currentDocumentId,
  onRemoveContext,
  editorClassName = "focus:outline-none text-sm text-gray-700 px-5 py-3.5",
  variant = "rounded",
  content,
}: AssistantInputProps) {
  const [mentionedDocumentIds, setMentionedDocumentIds] = useState<string[]>([])

  const {
    availableDocuments,
    contextItems,
    contextDocumentIds,
    handleRemoveContext: defaultHandleRemoveContext,
    resetDismissal,
  } = useDocumentContext({
    currentDocumentId,
    mentionedDocumentIds,
  })

  const handleSubmitRef = useRef<() => void>(() => {})

  const chatEditor = useChatComposer({
    documents: availableDocuments,
    placeholder,
    editorClassName,
    onChange: (editor) => {
      const textContent = editor.getText()
      setMentionedDocumentIds(getReferenceDocumentIds(textContent))
    },
    onEnter: () => {
      const textContent = chatEditor.getTextContent()
      if (textContent.trim()) {
        handleSubmitRef.current()
      }
    },
  })

  useEffect(() => {
    if (initialPrompt && chatEditor.editor && !chatEditor.getTextContent()) {
      chatEditor.setContent(initialPrompt)
    }
  }, [initialPrompt, chatEditor])

  useEffect(() => {
    if (content !== undefined && content !== null && chatEditor.editor) {
      const currentContent = chatEditor.getTextContent()
      if (content !== currentContent) {
        chatEditor.setContent(content)
      }
    }
  }, [content, chatEditor])

  const handleRemoveContext = onRemoveContext || defaultHandleRemoveContext

  const handleSubmit = useCallback(
    (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault()
      const textContent = chatEditor.getTextContent()
      if (!textContent.trim()) return

      onSubmit(textContent, contextDocumentIds)
      chatEditor.clearContent()
      resetDismissal()
    },
    [chatEditor, onSubmit, contextDocumentIds, resetDismissal],
  )

  handleSubmitRef.current = handleSubmit

  const containerClassName =
    variant === "rounded"
      ? "rounded-full bg-white text-sm shadow-surface flex flex-col gap-y-2 relative w-full"
      : "rounded-lg flex flex-col p-1 z-10 relative bg-gray-100"

  const formClassName = variant === "rounded" ? "relative flex flex-col" : "relative flex flex-col"

  const buttonClassName =
    variant === "rounded"
      ? "size-9 justify-center items-center flex bottom-1.5 right-1.5 absolute rounded-full border border-black shadow-[0_1px_--theme(--color-white/0.25)_inset,0_1px_3px_--theme(--color-black/0.2)] before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-full active:before:bg-white/0 hover:before:bg-white/6 after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:rounded-full after:bg-linear-to-b after:from-white/14 bg-gray-800 text-white after:mix-blend-overlay"
      : "p-1 hover:bg-gray-50 rounded-md bottom-0 right-0 absolute"

  const editorWrapperClassName =
    variant === "rounded"
      ? "text-sm text-start"
      : "flex flex-col bg-white ring ring-black/8 rounded-[6px] p-2"

  return (
    <motion.div
      layoutId={variant === "rounded" ? "assistant-input" : undefined}
      className={containerClassName}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      initial={false}
    >
      {variant === "flat" && (
        <div className="flex p-1.5">
          <ChatContextList items={contextItems} onRemove={handleRemoveContext} />
        </div>
      )}
      <div className={variant === "flat" ? editorWrapperClassName : ""}>
        <Form className={formClassName} onSubmit={handleSubmit}>
          {variant === "rounded" && <ChatContextList items={contextItems} onRemove={handleRemoveContext} />}
          <EditorContent
            editor={chatEditor.editor}
            className={variant === "rounded" ? "text-sm text-start" : ""}
          />
          <Button
            type={canStop ? "button" : "submit"}
            onPress={canStop ? onStop : undefined}
            className={buttonClassName}
            isDisabled={false}
          >
            {canStop ? (
              <SquareRegular
                className={
                  variant === "rounded"
                    ? "size-3 text-white fill-white"
                    : "size-4 text-gray-900 fill-gray-900"
                }
              />
            ) : variant === "rounded" ? (
              <ChevronUpRegular className="size-4 text-white" />
            ) : (
              <ArrowCircleUpRegular className="size-4.5 text-gray-500" />
            )}
          </Button>
        </Form>
      </div>
    </motion.div>
  )
}
