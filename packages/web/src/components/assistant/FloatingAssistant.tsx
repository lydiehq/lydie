import { motion, AnimatePresence } from "motion/react"
import { useCallback, useState, useMemo } from "react"
import { createPortal } from "react-dom"
import { EditorContent } from "@tiptap/react"
import { Form, Button as RACButton, Button } from "react-aria-components"
import {
  CircleArrowUpIcon,
  SquareIcon,
  AsteriskIcon,
  MinusIcon,
  ArrowShrinkIcon,
  ArrowExpandIcon,
} from "@/icons"
import { ChatMessages } from "@/components/chat/ChatMessages"
import { ChatContextList, type ChatContextItem } from "@/components/chat/ChatContextList"
import { ChatAlert } from "@/components/editor/ChatAlert"
import { useFloatingAssistant } from "@/context/floating-assistant.context"
import { useOrganization } from "@/context/organization.context"
import { AssistantProvider, useAssistant } from "@/context/assistant.context"
import { useChatComposer } from "@/components/chat/useChatComposer"
import { useQuery } from "@rocicorp/zero/react"
import { queries } from "@lydie/zero/queries"
import { getReferenceDocumentIds } from "@/utils/parse-references"

export function FloatingAssistant({ currentDocumentId }: { currentDocumentId: string | null }) {
  const { isOpen, close, toggle, isDocked, dock, undock, initialPrompt, clearPrompt } = useFloatingAssistant()
  const { organization } = useOrganization()

  // Get portal containers
  const floatingContainer = typeof document !== "undefined" ? document.getElementById("floating-assistant-container") : null
  const dockedContainer = typeof document !== "undefined" ? document.getElementById("docked-assistant-container") : null

  // Render floating button when not docked and not open
  if (!isDocked && !isOpen) {
    return (
      <motion.div
        layoutId="assistant"
        className="fixed right-4 bottom-4 z-30"
        initial={false}
        transition={{ type: "spring", stiffness: 450, damping: 35 }}
      >
        <RACButton
          onPress={toggle}
          aria-label="Open AI Assistant"
          className="bg-white shadow-surface rounded-full size-10 justify-center items-center flex hover:bg-gray-50 transition-colors"
        >
          <AsteriskIcon className="size-4 text-gray-600" aria-hidden="true" />
        </RACButton>
      </motion.div>
    )
  }

  // Render assistant content (either floating or docked)
  const shouldShow = isDocked || isOpen
  if (!shouldShow) return null

  const targetContainer = isDocked ? dockedContainer : floatingContainer
  if (!targetContainer) return null

  const content = (
    <motion.div
      layoutId="assistant"
      initial={false}
      transition={{ type: "spring", stiffness: 400, damping: 35, mass: 1 }}
      role="region"
      aria-label="AI Assistant"
      aria-labelledby="assistant-title"
      className={
        isDocked
          ? "w-full h-full bg-white flex flex-col overflow-hidden"
          : "fixed right-4 bottom-4 w-[400px] h-[540px] bg-white rounded-xl ring ring-black/8 shadow-lg flex flex-col overflow-hidden z-30"
      }
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 id="assistant-title" className="text-sm font-medium text-gray-900">
          AI Assistant
        </h2>
        <div className="flex items-center gap-1">
          <Button
            onPress={isDocked ? undock : dock}
            className="p-1 hover:bg-gray-200 rounded-md transition-colors"
            aria-label={isDocked ? "Undock assistant" : "Dock assistant"}
          >
            {isDocked ? (
              <ArrowShrinkIcon className="size-4 text-gray-600" aria-hidden="true" />
            ) : (
              <ArrowExpandIcon className="size-4 text-gray-600" aria-hidden="true" />
            )}
          </Button>
          {!isDocked && (
            <Button
              onPress={close}
              aria-label="Close assistant"
              className="p-1 hover:bg-gray-200 rounded-md transition-colors"
            >
              <MinusIcon className="size-4 text-gray-600" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <AssistantProvider organizationId={organization.id}>
          <FloatingAssistantChatContent
            organizationId={organization.id}
            currentDocumentId={currentDocumentId}
            initialPrompt={initialPrompt}
            onPromptUsed={clearPrompt}
          />
        </AssistantProvider>
      </div>
    </motion.div>
  )

  return createPortal(content, targetContainer)
}

function FloatingAssistantChatContent({
  organizationId,
  currentDocumentId,
  initialPrompt,
  onPromptUsed,
}: {
  organizationId: string
  currentDocumentId: string | null
  initialPrompt?: string
  onPromptUsed?: () => void
}) {
  const { messages, sendMessage, stop, status, alert, setAlert } = useAssistant()
  const { organization } = useOrganization()
  const [hasUsedInitialPrompt, setHasUsedInitialPrompt] = useState(false)
  const [mentionedDocumentIds, setMentionedDocumentIds] = useState<string[]>([])
  const [isCurrentDocumentDismissed, setIsCurrentDocumentDismissed] = useState(false)

  const [documents] = useQuery(queries.documents.byUpdated({ organizationId: organization.id }))
  const [currentDocument] = useQuery(
    currentDocumentId
      ? queries.documents.byId({
        organizationId: organization.id,
        documentId: currentDocumentId,
      })
      : null,
  )

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

  const chatEditor = useChatComposer({
    documents: availableDocuments,
    onEnter: () => {
      const textContent = chatEditor.getTextContent()
      if (textContent.trim()) {
        handleSubmit()
      }
    },
    onChange: (editor) => {
      const textContent = editor.getText()
      setMentionedDocumentIds(getReferenceDocumentIds(textContent))
    },
    placeholder: "Ask anything. Use @ to refer to documents",
    autoFocus: true,
    initialContent: initialPrompt && !hasUsedInitialPrompt ? initialPrompt : "",
  })

  const contextItems = useMemo(() => {
    const items: ChatContextItem[] = []

    if (currentDocument && !isCurrentDocumentDismissed) {
      items.push({
        id: currentDocument.id,
        type: "document",
        label: currentDocument.title || "Untitled document",
        source: "current",
        removable: true,
      })
    }

    for (const documentId of mentionedDocumentIds) {
      if (documentId === currentDocument?.id) continue
      items.push({
        id: documentId,
        type: "document",
        label: documentTitleById.get(documentId) || "Untitled document",
        source: "mention",
      })
    }

    return items
  }, [currentDocument, documentTitleById, isCurrentDocumentDismissed, mentionedDocumentIds])

  const contextDocumentIds = useMemo(() => {
    const ids = new Set<string>()
    if (currentDocument && !isCurrentDocumentDismissed) {
      ids.add(currentDocument.id)
    }
    for (const id of mentionedDocumentIds) {
      ids.add(id)
    }
    return Array.from(ids)
  }, [currentDocument, isCurrentDocumentDismissed, mentionedDocumentIds])

  const handleSubmit = useCallback(
    (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault()
      const textContent = chatEditor.getTextContent()
      if (!textContent.trim()) return

      sendMessage({
        text: textContent,
        metadata: {
          createdAt: new Date().toISOString(),
          contextDocumentIds,
          currentDocument:
            currentDocument && currentDocumentId
              ? {
                id: currentDocumentId,
                wordCount: 0,
              }
              : undefined,
        },
      })

      chatEditor.clearContent()
      setIsCurrentDocumentDismissed(false)

      // Clear the initial prompt after first submission
      if (initialPrompt && !hasUsedInitialPrompt) {
        setHasUsedInitialPrompt(true)
        onPromptUsed?.()
      }
    },
    [
      sendMessage,
      chatEditor,
      initialPrompt,
      hasUsedInitialPrompt,
      onPromptUsed,
      contextDocumentIds,
      currentDocument,
      currentDocumentId,
    ],
  )

  const canStop = status === "submitted" || status === "streaming"

  return (
    <div className="flex flex-col overflow-hidden grow h-full">
      <ChatMessages
        messages={messages}
        status={status as "submitted" | "streaming" | "ready" | "error"}
        editor={null}
        organizationId={organizationId}
      />
      <div className="p-1.5 relative">
        <div className="top-0 absolute inset-x-0 h-6 bg-linear-to-t from-gray-50 via-gray-50" />
        <div className="rounded-lg p-2 flex flex-col gap-y-2 z-10 relative bg-gray-100 ring ring-black/8">
          <AnimatePresence mode="sync">
            {alert && (
              <motion.div
                className=""
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  duration: 0.4,
                  ease: [0.175, 0.885, 0.32, 1.1],
                }}
              >
                <ChatAlert alert={alert} onDismiss={() => setAlert(null)} />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-col">
            <Form className="relative flex flex-col" onSubmit={handleSubmit}>
              <ChatContextList
                items={contextItems}
                onRemove={(item) => {
                  if (item.source === "current") {
                    setIsCurrentDocumentDismissed(true)
                  }
                }}
              />
              <EditorContent editor={chatEditor.editor} />
              <RACButton
                type={canStop ? "button" : "submit"}
                onPress={canStop ? stop : undefined}
                className="p-1 hover:bg-gray-50 rounded-md bottom-0 right-0 absolute"
                isDisabled={false}
              >
                {canStop ? (
                  <SquareIcon className="size-4 text-gray-900 fill-gray-900" />
                ) : (
                  <CircleArrowUpIcon className="size-4.5 text-gray-500" />
                )}
              </RACButton>
            </Form>
          </div>
        </div>
      </div>
    </div>
  )
}
