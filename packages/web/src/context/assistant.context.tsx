import { createContext, useContext, useState, useMemo, useCallback, useEffect, useRef } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import type { DocumentChatAgentUIMessage } from "@lydie/core/ai/agents/document-agent/index"
import { createId } from "@lydie/core/id"
import { parseChatError, isUsageLimitError } from "@/utils/chat-error-handler"
import type { ChatAlertState } from "@/components/editor/ChatAlert"
import type { QueryResultType } from "@rocicorp/zero"
import type { queries } from "@lydie/zero/queries"
import { trackEvent } from "@/lib/posthog"

interface AssistantContextValue {
  conversationId: string
  messages: any[]
  sendMessage: (options: { text: string; metadata?: any }) => void
  stop: () => void
  status: string
  alert: ChatAlertState | null
  setAlert: (alert: ChatAlertState | null) => void
  addToolOutput: (options: { toolCallId: string; tool: string; output: string }) => void
  resetConversation: () => void
  setConversation: (conversation: any) => void
}

const AssistantContext = createContext<AssistantContextValue | null>(null)

export function useAssistant() {
  const context = useContext(AssistantContext)
  if (!context) {
    throw new Error("useAssistant must be used within AssistantProvider")
  }
  return context
}

interface AssistantProviderProps {
  children: React.ReactNode
  organizationId: string
  conversation?: NonNullable<QueryResultType<typeof queries.assistant.byId>>
}

export function AssistantProvider({
  children,
  conversation: _conversation,
  organizationId,
}: AssistantProviderProps) {
  const [conversationId, setConversationId] = useState(() => _conversation?.id ?? createId())
  const [alert, setAlert] = useState<ChatAlertState | null>(null)
  const [conversation, setConversation] = useState<any>(_conversation)
  const messageStartTimeRef = useRef<number>(0)

  const {
    messages,
    sendMessage: originalSendMessage,
    stop,
    status,
    addToolOutput,
    setMessages,
  } = useChat<DocumentChatAgentUIMessage>({
    id: conversationId,
    messages:
      conversation?.messages?.map((msg: any) => ({
        id: msg.id,
        role: msg.role as "user" | "system" | "assistant",
        parts: msg.parts,
        metadata: msg.metadata,
      })) || [],
    transport: new DefaultChatTransport({
      api: import.meta.env.VITE_API_URL.replace(/\/+$/, "") + "/internal/assistant",
      credentials: "include",
      body: {
        conversationId,
      },
      headers: {
        "X-Organization-Id": organizationId,
      },
    }),
    onError: (error) => {
      console.error("Assistant chat error:", error)
      const { message } = parseChatError(error)

      if (isUsageLimitError(error)) {
        setAlert({
          show: true,
          type: "error",
          title: "Daily Limit Reached",
          message,
        })
      } else {
        setAlert({
          show: true,
          type: "error",
          title: "Something went wrong",
          message,
        })
      }
    },
    onFinish: () => {
      // Track when AI response is received
      const responseTime = messageStartTimeRef.current ? Date.now() - messageStartTimeRef.current : undefined

      trackEvent("assistant_response_received", {
        conversationId,
        organizationId,
        responseTimeMs: responseTime,
      })
    },
  })

  // Wrapped sendMessage to track message sent events
  const sendMessage = useCallback(
    (options: { text: string; metadata?: any }) => {
      messageStartTimeRef.current = Date.now()

      // Track message sent
      trackEvent("assistant_message_sent", {
        conversationId,
        organizationId,
        messageLength: options.text.length,
      })

      return originalSendMessage(options)
    },
    [originalSendMessage, conversationId, organizationId],
  )

  // Handle conversation prop changes (when navigating to a different conversation)
  useEffect(() => {
    if (_conversation && _conversation.id !== conversationId) {
      setConversationId(_conversation.id)
      setConversation(_conversation)
      const formattedMessages =
        _conversation.messages?.map((msg: any) => ({
          id: msg.id,
          role: msg.role as "user" | "system" | "assistant",
          parts: msg.parts,
          metadata: msg.metadata,
        })) || []
      setMessages(formattedMessages)
    }
  }, [_conversation, conversationId, setMessages])

  const resetConversation = useCallback(() => {
    const newId = createId()
    setConversationId(newId)
    setConversation(null)
    setMessages([])
  }, [setMessages])

  const handleSetConversation = useCallback(
    (conv: any) => {
      setConversation(conv)
      if (conv?.id) {
        setConversationId(conv.id)
      }
      if (conv?.messages) {
        const formattedMessages = conv.messages.map((msg: any) => ({
          id: msg.id,
          role: msg.role as "user" | "system" | "assistant",
          parts: msg.parts,
          metadata: msg.metadata,
        }))
        setMessages(formattedMessages)
      }
    },
    [setMessages],
  )

  const value = useMemo(
    () => ({
      conversationId,
      messages,
      sendMessage,
      stop,
      status,
      alert,
      setAlert,
      addToolOutput,
      resetConversation,
      setConversation: handleSetConversation,
    }),
    [
      conversationId,
      messages,
      sendMessage,
      stop,
      status,
      alert,
      addToolOutput,
      resetConversation,
      handleSetConversation,
    ],
  )

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>
}
