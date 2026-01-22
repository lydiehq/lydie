import { createFileRoute, useSearch } from "@tanstack/react-router"
import { Surface } from "@/components/layout/Surface"
import { useRef, useState, useCallback } from "react"
import { useOrganization } from "@/context/organization.context"
import { Panel, PanelGroup, type ImperativePanelHandle } from "react-resizable-panels"
import { PanelResizer } from "@/components/panels/PanelResizer"
import { AssistantSidebar } from "@/components/assistant/AssistantSidebar"
import { useTrackOnMount } from "@/hooks/use-posthog-tracking"
import { z } from "zod"
import { AssistantChat } from "@/components/assistant/AssistantChat"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import type { DocumentChatAgentUIMessage } from "@lydie/core/ai/agents/document-agent/index"
import { createId } from "@lydie/core/id"
import { parseChatError, isUsageLimitError } from "@/utils/chat-error-handler"
import type { ChatAlertState } from "@/components/editor/ChatAlert"
import { trackEvent } from "@/lib/posthog"

const assistantSearchSchema = z.object({
  prompt: z.string().optional(),
})

export const Route = createFileRoute("/__auth/w/$organizationSlug/assistant/")({
  component: PageComponent,
  ssr: false,
  validateSearch: assistantSearchSchema,
})

const COLLAPSED_SIZE = 3.5

function PageComponent() {
  const { organization } = useOrganization()
  const [sidebarSize, setSidebarSize] = useState(25)
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null)
  const search = useSearch({ from: "/__auth/w/$organizationSlug/assistant/" })
  const initialPrompt = (search as { prompt?: string })?.prompt
  const [conversationId] = useState(() => createId())
  const [alert, setAlert] = useState<ChatAlertState | null>(null)
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
    (options: { text: string; metadata?: any }) => {
      messageStartTimeRef.current = Date.now()

      trackEvent("assistant_message_sent", {
        conversationId,
        organizationId: organization.id,
        messageLength: options.text.length,
      })

      return originalSendMessage(options)
    },
    [originalSendMessage, conversationId, organization.id],
  )

  const resetConversation = useCallback(() => {
    setMessages([])
  }, [setMessages])

  // Track assistant opened
  useTrackOnMount("assistant_opened", {
    organizationId: organization.id,
  })

  const toggleSidebar = () => {
    const panel = sidebarPanelRef.current
    if (!panel) return
    panel.isCollapsed() ? panel.expand() : panel.collapse()
  }

  return (
    <div className="h-screen py-1 pr-1 flex flex-col pl-1">
      <Surface className="overflow-hidden size-full">
        <PanelGroup autoSaveId="assistant-panel-group" direction="horizontal">
          <Panel minSize={20} defaultSize={75} className="flex flex-col grow">
            <div className="flex flex-col h-full mx-auto w-full max-w-xl">
              <AssistantChat
                organizationId={organization.id}
                initialPrompt={initialPrompt}
                showEmptyState={true}
                messages={messages}
                sendMessage={sendMessage}
                stop={stop}
                status={status}
                alert={alert}
                setAlert={setAlert}
                conversationId={conversationId}
              />
            </div>
          </Panel>
          <PanelResizer />
          <Panel
            ref={sidebarPanelRef}
            id="assistant-sidebar"
            collapsible={true}
            collapsedSize={COLLAPSED_SIZE}
            minSize={12}
            defaultSize={25}
            onResize={setSidebarSize}
          >
            <AssistantSidebar
              isCollapsed={sidebarSize === COLLAPSED_SIZE}
              onToggle={toggleSidebar}
              conversationId={conversationId}
              onNewConversation={resetConversation}
            />
          </Panel>
        </PanelGroup>
      </Surface>
    </div>
  )
}
