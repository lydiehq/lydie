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
import type { DocumentChatAgentUIMessage } from "@lydie/core/ai/agents/document-agent/index"
import { useAssistantChat } from "@/hooks/use-assistant-chat"

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

  const [conv, status] = useQuery(
    queries.assistant.byId({
      organizationId: organization.id,
      conversationId: chatId,
    }),
  )

  const {
    messages,
    sendMessage,
    stop,
    status: chatStatus,
    alert,
    setAlert,
    setMessages,
  } = useAssistantChat({
    conversationId: chatId,
    initialMessages:
      conv?.messages?.map((msg: any) => ({
        id: msg.id,
        role: msg.role as "user" | "system" | "assistant",
        parts: msg.parts,
        metadata: msg.metadata,
      })) || [],
  })

  const resetConversation = useCallback(() => {
    setMessages([])
  }, [setMessages])

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

  useTrackOnMount("assistant_opened", {
    organizationId: organization.id,
    conversationId: chatId,
  })

  const toggleSidebar = () => {
    const panel = sidebarPanelRef.current
    if (!panel) return
    panel.isCollapsed() ? panel.expand() : panel.collapse()
  }

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
