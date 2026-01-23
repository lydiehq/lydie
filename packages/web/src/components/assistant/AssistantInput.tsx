import { EditorContent } from "@tiptap/react"
import { Form } from "react-aria-components"
import { motion } from "motion/react"
import { ChevronUpRegular, SquareFilled, ArrowCircleUpRegular } from "@fluentui/react-icons"
import { Button } from "@/components/generic/Button"
import { useChatComposer } from "@/hooks/use-chat-composer"
import { useCallback, useRef, useEffect, useState } from "react"
import { ChatContextList, type ChatContextItem } from "@/components/chat/ChatContextList"
import { getReferenceDocumentIds } from "@/utils/parse-references"
import { useDocumentContext } from "@/hooks/use-document-context"
import { AgentSelector } from "@/components/assistant/AgentSelector"

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
  selectedAgentId?: string | null
  onSelectAgent?: (agentId: string) => void
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
  selectedAgentId,
  onSelectAgent,
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

  const editorWrapperClassName =
    variant === "rounded"
      ? "text-sm text-start"
      : "flex flex-col bg-white ring ring-black/8 rounded-[6px] p-2 relative"

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
          {variant === "flat" ? (
            <div className="flex items-center justify-end gap-x-1 mt-2">
              {selectedAgentId !== undefined && onSelectAgent && (
                <AgentSelector selectedAgentId={selectedAgentId} onSelectAgent={onSelectAgent} />
              )}
              <Button
                type={canStop ? "button" : "submit"}
                onPress={canStop ? onStop : undefined}
                intent="ghost"
                size="icon-sm"
              >
                {canStop ? (
                  <SquareFilled className="size-4 text-gray-900 fill-gray-900" />
                ) : (
                  <ArrowCircleUpRegular className="size-4.5 text-gray-500" />
                )}
              </Button>
            </div>
          ) : (
            <Button
              type={canStop ? "button" : "submit"}
              onPress={canStop ? onStop : undefined}
              intent="primary"
              size="icon-lg"
              rounded
              className="bottom-1.5 right-1.5 absolute"
            >
              {canStop ? (
                <SquareFilled className="size-3 text-white fill-white" />
              ) : (
                <ChevronUpRegular className="size-4 text-white" />
              )}
            </Button>
          )}
        </Form>
      </div>
    </motion.div>
  )
}
