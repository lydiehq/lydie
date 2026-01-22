import { motion } from "motion/react"
import { useCallback, useState, useMemo, useEffect } from "react"
import { createPortal } from "react-dom"
import { Button as RACButton, Button, TooltipTrigger } from "react-aria-components"
import {
  TextAsteriskRegular,
  SubtractFilled,
  DocumentFilled,
  DocumentCopyFilled,
  EditRegular,
  QuestionCircleRegular,
  TextBulletListSquareEditRegular,
  LayoutColumnTwoFocusRightFilled,
  PictureInPictureEnterRegular,
} from "@fluentui/react-icons"
import { ChatMessages } from "@/components/chat/ChatMessages"
import { useFloatingAssistant } from "@/context/floating-assistant.context"
import { useOrganization } from "@/context/organization.context"
import { useQuery } from "@rocicorp/zero/react"
import { queries } from "@lydie/zero/queries"
import { createId } from "@lydie/core/id"
import { useAssistantChat } from "@/hooks/use-assistant-chat"
import { ConversationDropdown } from "@/components/assistant/ConversationDropdown"
import { Tooltip } from "@/components/generic/Tooltip"
import { AssistantInput } from "@/components/assistant/AssistantInput"

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

  const { messages, sendMessage, stop, status, setMessages } = useAssistantChat({
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

  const handleSelectConversation = useCallback((id: string) => {
    setConversationId(id)
  }, [])

  const headerButtons = useMemo(() => {
    return [
      {
        onPress: handleNewChat,
        ariaLabel: "New chat",
        tooltip: "New chat",
        icon: TextBulletListSquareEditRegular,
      },
      {
        onPress: isDocked ? undock : dock,
        ariaLabel: isDocked ? "Undock assistant" : "Dock assistant",
        tooltip: isDocked ? "Undock assistant" : "Dock assistant",
        icon: isDocked ? PictureInPictureEnterRegular : LayoutColumnTwoFocusRightFilled,
      },
      {
        onPress: close,
        ariaLabel: "Close assistant",
        tooltip: "Close assistant",
        icon: SubtractFilled,
      },
    ]
  }, [isDocked, dock, undock, handleNewChat, close])

  const floatingContainer =
    typeof document !== "undefined" ? document.getElementById("floating-assistant-container") : null
  const dockedContainer =
    typeof document !== "undefined" ? document.getElementById("docked-assistant-container") : null

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
          <TextAsteriskRegular className="size-4 text-gray-600" aria-hidden="true" />
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
          ? "w-full h-full bg-white ring ring-black/6 rounded-lg flex flex-col overflow-hidden"
          : "fixed right-4 bottom-4 w-[400px] h-[540px] bg-white rounded-xl ring ring-black/6 shadow-lg flex flex-col overflow-hidden z-30"
      }
    >
      <div className="flex items-center justify-between p-1.5 border-b border-gray-200">
        <ConversationDropdown
          conversationId={conversationId}
          onSelectConversation={handleSelectConversation}
        />
        <div className="flex items-center gap-x-0.5">
          {headerButtons.map((button) => {
            const Icon = button.icon
            return (
              <TooltipTrigger key={button.ariaLabel} delay={500}>
                <Button
                  onPress={button.onPress}
                  className="size-6 justify-center items-center hover:bg-black/4 rounded-md transition-colors duration-75 flex"
                  aria-label={button.ariaLabel}
                >
                  <Icon className="size-4.5 text-gray-500" aria-hidden="true" />
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
  const [pendingContent, setPendingContent] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (_pendingMessage) {
      setPendingContent(_pendingMessage)
      _clearPendingMessage()
    }
  }, [_pendingMessage, _clearPendingMessage])

  const handleSubmit = useCallback(
    (text: string, contextDocumentIds: string[]) => {
      sendMessage({
        text,
        metadata: {
          createdAt: new Date().toISOString(),
          contextDocumentIds,
          currentDocumentId: currentDocumentId || undefined,
        },
      })
      setPendingContent(undefined)
    },
    [sendMessage, currentDocumentId],
  )

  const canStop = status === "submitted" || status === "streaming"

  const suggestions = useMemo(() => {
    if (currentDocumentId) {
      return [
        {
          text: "Summarize this document",
          icon: DocumentFilled,
        },
        {
          text: "Help me write a draft",
          icon: EditRegular,
        },
        {
          text: "Explain this in simpler terms",
          icon: QuestionCircleRegular,
        },
      ]
    } else {
      return [
        {
          text: "Summarize my 3 last documents",
          icon: DocumentCopyFilled,
        },
        {
          text: "Help me write a draft",
          icon: EditRegular,
        },
        {
          text: "What can you help me with?",
          icon: QuestionCircleRegular,
        },
      ]
    }
  }, [currentDocumentId])

  const handleSuggestionClick = useCallback(
    (suggestionText: string) => {
      sendMessage({
        text: suggestionText,
        metadata: {
          createdAt: new Date().toISOString(),
          contextDocumentIds: currentDocumentId ? [currentDocumentId] : [],
          currentDocumentId: currentDocumentId || undefined,
        },
      })
    },
    [sendMessage, currentDocumentId],
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
        <AssistantInput
          onSubmit={handleSubmit}
          onStop={stop}
          placeholder="Ask anything. Use @ to refer to documents"
          canStop={canStop}
          currentDocumentId={currentDocumentId}
          variant="flat"
          editorClassName="focus:outline-none min-h-[80px] max-h-[200px] overflow-y-auto text-sm text-gray-700"
          content={pendingContent}
        />
      </div>
    </div>
  )
}
