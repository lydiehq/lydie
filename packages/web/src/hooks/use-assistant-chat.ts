import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import type { DocumentChatAgentUIMessage } from "@lydie/core/ai/agents/document-agent/index"
import { useCallback, useRef, useState } from "react"
import { useOrganization } from "@/context/organization.context"
import { parseChatError, isUsageLimitError } from "@/utils/chat-error-handler"
import type { ChatAlertState } from "@/components/editor/ChatAlert"
import { trackEvent } from "@/lib/posthog"

interface UseAssistantChatOptions {
  conversationId: string
  initialMessages?: DocumentChatAgentUIMessage[]
  experimental_throttle?: number
}

export function useAssistantChat({
  conversationId,
  initialMessages = [],
  experimental_throttle,
}: UseAssistantChatOptions) {
  const { organization } = useOrganization()
  const [alert, setAlert] = useState<ChatAlertState | null>(null)
  const messageStartTimeRef = useRef<number>(0)

  const {
    messages,
    sendMessage: originalSendMessage,
    stop,
    status,
    setMessages,
  } = useChat<DocumentChatAgentUIMessage>({
    id: conversationId,
    messages: initialMessages,
    experimental_throttle,
    transport: new DefaultChatTransport({
      api: import.meta.env.VITE_API_URL.replace(/\/+$/, "") + "/internal/assistant",
      credentials: "include",
      body: {
        conversationId,
      },
      headers: {
        "X-Organization-Id": organization.id,
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
      const responseTime = messageStartTimeRef.current ? Date.now() - messageStartTimeRef.current : undefined

      trackEvent("assistant_response_received", {
        conversationId,
        organizationId: organization.id,
        responseTimeMs: responseTime,
      })
    },
  })

  const sendMessage = useCallback(
    (options: { text: string; metadata?: any; agentId?: string | null }) => {
      messageStartTimeRef.current = Date.now()

      trackEvent("assistant_message_sent", {
        conversationId,
        organizationId: organization.id,
        messageLength: options.text.length,
      })

      // Pass agentId in the body
      const transport = new DefaultChatTransport({
        api: import.meta.env.VITE_API_URL.replace(/\/+$/, "") + "/internal/assistant",
        credentials: "include",
        body: {
          conversationId,
          agentId: options.agentId || null,
        },
        headers: {
          "X-Organization-Id": organization.id,
        },
      })

      return originalSendMessage({ ...options, transport })
    },
    [originalSendMessage, conversationId, organization.id],
  )

  return {
    messages,
    sendMessage,
    stop,
    status,
    alert,
    setAlert,
    setMessages,
  }
}
