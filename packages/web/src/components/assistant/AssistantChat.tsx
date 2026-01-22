import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { ChatMessages } from "@/components/chat/ChatMessages"
import { ChatAlert } from "@/components/editor/ChatAlert"
import { AssistantInput } from "@/components/assistant/AssistantInput"
import type { ChatAlertState } from "@/components/editor/ChatAlert"

interface AssistantChatProps {
  organizationId: string
  initialPrompt?: string
  onPromptUsed?: () => void
  showEmptyState?: boolean
  messages: any[]
  sendMessage: (options: { text: string; metadata?: any }) => void
  stop: () => void
  status: string
  alert: ChatAlertState | null
  setAlert: (alert: ChatAlertState | null) => void
  conversationId: string
}

export function AssistantChat({
  organizationId,
  initialPrompt,
  onPromptUsed,
  showEmptyState = true,
  messages,
  sendMessage,
  stop,
  status,
  alert,
  setAlert,
  conversationId,
}: AssistantChatProps) {
  const navigate = useNavigate()
  const [currentInitialPrompt, setCurrentInitialPrompt] = useState<string | undefined>(initialPrompt)

  useEffect(() => {
    if (currentInitialPrompt && initialPrompt !== currentInitialPrompt) {
      setCurrentInitialPrompt(initialPrompt)
    }
  }, [initialPrompt, currentInitialPrompt])

  const handleSubmit = useCallback(
    (text: string, contextDocumentIds: string[]) => {
      sendMessage({
        text,
        metadata: {
          createdAt: new Date().toISOString(),
          contextDocumentIds,
        },
      })

      navigate({
        to: "/w/$organizationSlug/assistant/$chatId",
        params: (prev) => ({ ...prev, chatId: conversationId }),
        replace: true,
      })

      if (currentInitialPrompt) {
        setCurrentInitialPrompt(undefined)
        onPromptUsed?.()
      }
    },
    [sendMessage, navigate, conversationId, currentInitialPrompt, onPromptUsed],
  )

  const canStop = status === "submitted" || status === "streaming"

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col flex-1 min-h-0">
        {messages.length === 0 && showEmptyState ? (
          <div className="mt-[34svh] flex flex-col gap-y-4 items-center px-4">
            <h1 className="text-2xl font-medium text-gray-900">Ask anything</h1>
            <AssistantInput
              onSubmit={handleSubmit}
              onStop={stop}
              placeholder="Ask anything. Use @ to refer to documents"
              initialPrompt={currentInitialPrompt}
            />
          </div>
        ) : (
          <>
            <ChatMessages
              messages={messages}
              status={status as "submitted" | "streaming" | "ready" | "error"}
              organizationId={organizationId}
            />
            <div className="p-3 relative shrink-0">
              <div className="top-0 absolute inset-x-0 h-6 bg-linear-to-t from-gray-50 via-gray-50" />
              <div className="z-10 relative">
                <ChatAlert
                  alert={alert}
                  onDismiss={() => setAlert(alert ? { ...alert, show: false } : null)}
                />
                <AssistantInput
                  onSubmit={handleSubmit}
                  onStop={stop}
                  placeholder="Ask anything. Use @ to refer to documents"
                  canStop={canStop}
                  initialPrompt={currentInitialPrompt}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
