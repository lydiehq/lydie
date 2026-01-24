import { createFileRoute, useSearch } from "@tanstack/react-router"
import { Surface } from "@/components/layout/Surface"
import { useRef, useState, useCallback } from "react"
import { useOrganization } from "@/context/organization.context"
import { Panel, PanelGroup, type ImperativePanelHandle } from "react-resizable-panels"
import { PanelResizer } from "@/components/panels/PanelResizer"
import { AssistantSidebar } from "@/components/assistant/AssistantSidebar"
import { z } from "zod"
import { AssistantChat } from "@/components/assistant/AssistantChat"
import { createId } from "@lydie/core/id"
import { useAssistantChat } from "@/hooks/use-assistant-chat"

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

  const {
    messages,
    sendMessage,
    stop,
    status,
    alert,
    setAlert,
    setMessages,
  } = useAssistantChat({
    conversationId,
  })

  const resetConversation = useCallback(() => {
    setMessages([])
  }, [setMessages])

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
