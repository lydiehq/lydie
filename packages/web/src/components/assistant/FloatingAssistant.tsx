import { motion } from "motion/react"
import { useCallback, useState, useMemo, useEffect } from "react"
import { createPortal } from "react-dom"
import { EditorContent } from "@tiptap/react"
import {
  Form,
  Button as RACButton,
  Button,
  TooltipTrigger,
} from "react-aria-components"
import {
  CircleArrowUpIcon,
  SquareIcon,
  AsteriskIcon,
  MinusIcon,
  ArrowShrinkIcon,
  ArrowExpandIcon,
  DocumentIcon,
  DocumentsIcon,
  CreateIcon,
  HelpCircleIcon,
  PlusIcon,
} from "@/icons"
import { ChatMessages } from "@/components/chat/ChatMessages"
import { ChatContextList, type ChatContextItem } from "@/components/chat/ChatContextList"
import { useFloatingAssistant } from "@/context/floating-assistant.context"
import { useOrganization } from "@/context/organization.context"
import { useChatComposer } from "@/hooks/use-chat-composer"
import { useQuery } from "@rocicorp/zero/react"
import { queries } from "@lydie/zero/queries"
import { getReferenceDocumentIds } from "@/utils/parse-references"
import { useDocumentContext } from "@/hooks/use-document-context"
import { createId } from "@lydie/core/id"
import { useAssistantChat } from "@/hooks/use-assistant-chat"
import { ConversationDropdown } from "@/components/assistant/ConversationDropdown"
import { Tooltip } from "@/components/generic/Tooltip"
import { PlusCircle } from "lucide-react"

const FLOATING_ASSISTANT_CONVERSATION_KEY = "floating-assistant-conversation-id"

export function FloatingAssistant({ currentDocumentId }: { currentDocumentId: string | null }) {
  const { isOpen, close, toggle, isDocked, dock, undock } = useFloatingAssistant()
  const { organization } = useOrganization()

  const [conversationId, setConversationId] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(FLOATING_ASSISTANT_CONVERSATION_KEY)
      if (saved) {
        return saved
      }
    }
    return createId()
  })

  const [currentConversation] = useQuery(
    conversationId
      ? queries.assistant.byId({
        organizationId: organization.id,
        conversationId,
      })
      : null,
  )

  const {
    messages,
    sendMessage,
    stop,
    status,
    setMessages,
  } = useAssistantChat({
    conversationId,
    initialMessages:
      currentConversation?.messages?.map((msg: any) => ({
        id: msg.id,
        role: msg.role as "user" | "system" | "assistant",
        parts: msg.parts,
        metadata: msg.metadata,
      })) || [],
  })

  useEffect(() => {
    if (currentConversation?.messages) {
      setMessages(
        currentConversation.messages.map((msg: any) => ({
          id: msg.id,
          role: msg.role as "user" | "system" | "assistant",
          parts: msg.parts,
          metadata: msg.metadata,
        })),
      )
    } else if (currentConversation === null && conversationId) {
      setMessages([])
    }
  }, [currentConversation?.id, conversationId, setMessages])

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(FLOATING_ASSISTANT_CONVERSATION_KEY, conversationId)
    }
  }, [conversationId])

  const handleNewChat = useCallback(() => {
    const newId = createId()
    setConversationId(newId)
    setMessages([])
  }, [setMessages])

  const handleSelectConversation = useCallback(
    (id: string) => {
      setConversationId(id)
    },
    [],
  )

  const headerButtons = useMemo(() => {
    const buttons = [
      {
        onPress: isDocked ? undock : dock,
        ariaLabel: isDocked ? "Undock assistant" : "Dock assistant",
        tooltip: isDocked ? "Undock assistant" : "Dock assistant",
        icon: isDocked ? ArrowShrinkIcon : ArrowExpandIcon,
        show: true,
      },
      {
        onPress: handleNewChat,
        ariaLabel: "New chat",
        tooltip: "New chat",
        icon: PlusIcon,
        show: !isDocked,
      },
      {
        onPress: close,
        ariaLabel: "Close assistant",
        tooltip: "Close assistant",
        icon: MinusIcon,
        show: !isDocked,
      },
    ]

    return buttons.filter((button) => button.show)
  }, [isDocked, dock, undock, handleNewChat, close])

  const floatingContainer = typeof document !== "undefined" ? document.getElementById("floating-assistant-container") : null
  const dockedContainer = typeof document !== "undefined" ? document.getElementById("docked-assistant-container") : null

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
          : "fixed right-4 bottom-4 w-[400px] h-[540px] bg-white rounded-xl ring ring-black/6 shadow-lg flex flex-col overflow-hidden z-30"
      }
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <ConversationDropdown
          conversationId={conversationId}
          onNewChat={handleNewChat}
          onSelectConversation={handleSelectConversation}
        />
        <div className="flex items-center gap-1">
          {headerButtons.map((button) => {
            const Icon = button.icon
            return (
              <TooltipTrigger key={button.ariaLabel} delay={500}>
                <Button
                  onPress={button.onPress}
                  className="p-1 hover:bg-gray-200 rounded-md transition-colors"
                  aria-label={button.ariaLabel}
                >
                  <Icon className="size-4 text-gray-600" aria-hidden="true" />
                </Button>
                <Tooltip placement="top">{button.tooltip}</Tooltip>
              </TooltipTrigger>
            )
          })}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <FloatingAssistantChatContent
          organizationId={organization.id}
          currentDocumentId={currentDocumentId}
          messages={messages}
          sendMessage={sendMessage}
          stop={stop}
          status={status}
        />
      </div>
    </motion.div>
  )

  return createPortal(content, targetContainer)
}

function ChatInputArea({
  onSubmit,
  contextItems,
  onRemoveContext,
  editor,
  canStop,
  stop,
}: {
  onSubmit: (e?: React.FormEvent<HTMLFormElement>) => void
  contextItems: ChatContextItem[]
  onRemoveContext: (item: ChatContextItem) => void
  editor: any
  canStop: boolean
  stop: () => void
}) {
  return (
    <div className="rounded-lg flex flex-col p-1 z-10 relative bg-gray-100">
      {/* <AnimatePresence mode="sync">
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
            <ChatAlert alert={alert} onDismiss={onDismissAlert} />
          </motion.div>
        )}
      </AnimatePresence> */}
      <div className="flex p-1.5">
        <RACButton>
          <PlusCircle className="size-4 text-gray-500" />
        </RACButton>
        <ChatContextList items={contextItems} onRemove={onRemoveContext} />
      </div>
      <div className="flex flex-col bg-white ring ring-black/8 rounded-[6px] p-2">
        <Form className="relative flex flex-col" onSubmit={onSubmit}>
          <EditorContent editor={editor} />
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
  )
}

function FloatingAssistantChatContent({
  organizationId,
  currentDocumentId,
  messages,
  sendMessage,
  stop,
  status,
}: {
  organizationId: string
  currentDocumentId: string | null
  messages: any[]
  sendMessage: (options: { text: string; metadata?: any }) => void
  stop: () => void
  status: string
}) {
  const { _pendingMessage, _clearPendingMessage } = useFloatingAssistant() as any
  const [mentionedDocumentIds, setMentionedDocumentIds] = useState<string[]>([])

  const {
    availableDocuments,
    currentDocument,
    contextItems,
    contextDocumentIds,
    handleRemoveContext,
    resetDismissal,
  } = useDocumentContext({
    currentDocumentId,
    mentionedDocumentIds,
  })

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
  })

  useEffect(() => {
    if (_pendingMessage && chatEditor.editor) {
      chatEditor.setContent(_pendingMessage)
      _clearPendingMessage()
    }
  }, [_pendingMessage, chatEditor, _clearPendingMessage])

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
      resetDismissal()
    },
    [
      sendMessage,
      chatEditor,
      contextDocumentIds,
      currentDocument,
      currentDocumentId,
      resetDismissal,
    ],
  )

  const canStop = status === "submitted" || status === "streaming"

  const suggestions = useMemo(
    () => {
      if (currentDocumentId) {
        return [
          {
            text: "Summarize this document",
            icon: DocumentIcon,
          },
          {
            text: "Help me write a draft",
            icon: CreateIcon,
          },
          {
            text: "Explain this in simpler terms",
            icon: HelpCircleIcon,
          },
        ]
      } else {
        return [
          {
            text: "Summarize my 3 last documents",
            icon: DocumentsIcon,
          },
          {
            text: "Help me write a draft",
            icon: CreateIcon,
          },
          {
            text: "What can you help me with?",
            icon: HelpCircleIcon,
          },
        ]
      }
    },
    [currentDocumentId],
  )

  const handleSuggestionClick = useCallback(
    (suggestionText: string) => {
      sendMessage({
        text: suggestionText,
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
      resetDismissal()
    },
    [
      sendMessage,
      chatEditor,
      contextDocumentIds,
      currentDocument,
      currentDocumentId,
      resetDismissal,
    ],
  )

  const isChatEmpty = messages.length === 0

  return (
    <div className="flex flex-col overflow-hidden grow h-full">
      <ChatMessages
        messages={messages}
        status={status as "submitted" | "streaming" | "ready" | "error"}
        editor={null}
        organizationId={organizationId}
      />
      <div className="p-1.5 relative">
        {isChatEmpty && (
          <div className="flex flex-col gap-y-1 pb-3">
            {suggestions.map((suggestion, index) => {
              const Icon = suggestion.icon
              return (
                <>
                  <RACButton
                    key={suggestion.text}
                    onPress={() => handleSuggestionClick(suggestion.text)}
                    className="flex items-center gap-x-2 p-1.5 bg-white rounded-lg hover:bg-gray-50 transition-colors duration-75"
                  >
                    <Icon className="size-4 text-gray-400" aria-hidden="true" />
                    <span className="text-gray-500 text-xs">{suggestion.text}</span>
                  </RACButton>
                  {index < suggestions.length - 1 && <div className="h-px bg-black/6 ml-8" />}
                </>

              )
            })}
          </div>
        )}
        <ChatInputArea
          onSubmit={handleSubmit}
          contextItems={contextItems}
          onRemoveContext={handleRemoveContext}
          editor={chatEditor.editor}
          canStop={canStop}
          stop={stop}
        />
      </div>
    </div>
  )
}
