import { createFileRoute, useSearch } from "@tanstack/react-router"
import { Surface } from "@/components/layout/Surface"
import { useRef, useState, useCallback, useEffect } from "react"
import { useOrganization } from "@/context/organization.context"
import { Panel, PanelGroup, type ImperativePanelHandle } from "react-resizable-panels"
import { PanelResizer } from "@/components/panels/PanelResizer"
import { AssistantSidebar } from "@/components/assistant/AssistantSidebar"
import { useTrackOnMount } from "@/hooks/use-posthog-tracking"
import { queries } from "@lydie/zero/queries"
import { z } from "zod"
import { AssistantChat } from "@/components/assistant/AssistantChat"
import { Button } from "@/components/generic/Button"
import { useQuery } from "@rocicorp/zero/react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import type { DocumentChatAgentUIMessage } from "@lydie/core/ai/agents/document-agent/index"
import { parseChatError, isUsageLimitError } from "@/utils/chat-error-handler"
import type { ChatAlertState } from "@/components/editor/ChatAlert"
import { trackEvent } from "@/lib/posthog"

const assistantSearchSchema = z.object({
  prompt: z.string().optional(),
})

export const Route = createFileRoute("/__auth/w/$organizationSlug/assistant/$chatId/")({
  component: PageComponent,
  ssr: false,
  validateSearch: assistantSearchSchema,
  loader: async ({ context, params }) => {
    const { zero, organization } = context
    const { chatId } = params

    const conversation = await zero.run(
      queries.assistant.byId({
        organizationId: organization.id,
        conversationId: chatId,
      }),
      { type: "complete" },
    )

    return { conversation }
  },
})

const COLLAPSED_SIZE = 3.5

function PageComponent() {
  const { chatId } = Route.useParams()
  const { organization } = useOrganization()
  const [sidebarSize, setSidebarSize] = useState(25)
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null)
  const search = useSearch({ from: "/__auth/w/$organizationSlug/assistant/$chatId/" })
  const initialPrompt = (search as { prompt?: string })?.prompt
  const [alert, setAlert] = useState<ChatAlertState | null>(null)
  const messageStartTimeRef = useRef<number>(0)

  // Also query the conversation reactively
  const [conv, status] = useQuery(
    queries.assistant.byId({
      organizationId: organization.id,
      conversationId: chatId,
    }),
  )

  const {
    messages,
    sendMessage: originalSendMessage,
    stop,
    status: chatStatus,
    addToolOutput,
    setMessages,
  } = useChat<DocumentChatAgentUIMessage>({
    id: chatId,
    messages:
      conv?.messages?.map((msg: any) => ({
        id: msg.id,
        role: msg.role as "user" | "system" | "assistant",
        parts: msg.parts,
        metadata: msg.metadata,
      })) || [],
    transport: new DefaultChatTransport({
      api: import.meta.env.VITE_API_URL.replace(/\/+$/, "") + "/internal/assistant",
      credentials: "include",
      body: {
        conversationId: chatId,
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
        conversationId: chatId,
        organizationId: organization.id,
        responseTimeMs: responseTime,
      })
    },
  })

  const sendMessage = useCallback(
    (options: { text: string; metadata?: any }) => {
      messageStartTimeRef.current = Date.now()

      trackEvent("assistant_message_sent", {
        conversationId: chatId,
        organizationId: organization.id,
        messageLength: options.text.length,
      })

      return originalSendMessage(options)
    },
    [originalSendMessage, chatId, organization.id],
  )

  const resetConversation = useCallback(() => {
    setMessages([])
  }, [setMessages])

  // Update messages when conversation changes
  useEffect(() => {
    if (conv?.messages) {
      const formattedMessages = conv.messages.map((msg: any) => ({
        id: msg.id,
        role: msg.role as "user" | "system" | "assistant",
        parts: msg.parts,
        metadata: msg.metadata,
      }))
      setMessages(formattedMessages)
    }
  }, [conv, setMessages])

  // Track assistant opened
  useTrackOnMount("assistant_opened", {
    organizationId: organization.id,
    conversationId: chatId,
  })

  const toggleSidebar = () => {
    const panel = sidebarPanelRef.current
    if (!panel) return
    panel.isCollapsed() ? panel.expand() : panel.collapse()
  }

  // Handle conversation not found
  if (!conv && status.type === "complete") {
    return (
      <div className="h-screen py-1 pr-1 flex flex-col pl-1">
        <Surface className="flex items-center justify-center">
          <div className="flex flex-col items-center justify-center gap-y-2">
            <span className="text-sm font-medium text-gray-900">Conversation not found</span>
            <p className="text-sm text-gray-500">The conversation you are looking for does not exist.</p>
            <Button size="sm" href={`/w/${organization?.slug}/assistant`}>
              Start new conversation
            </Button>
          </div>
        </Surface>
      </div>
    )
  }

  if (!conv) return null

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
                status={chatStatus}
                alert={alert}
                setAlert={setAlert}
                conversationId={chatId}
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
              conversationId={chatId}
              onNewConversation={resetConversation}
            />
          </Panel>
        </PanelGroup>
      </Surface>
    </div>
  )
}
