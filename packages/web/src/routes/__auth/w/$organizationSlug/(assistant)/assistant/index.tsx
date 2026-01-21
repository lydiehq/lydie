import { createFileRoute, useSearch } from "@tanstack/react-router"
import { Surface } from "@/components/layout/Surface"
import { useRef, useState } from "react"
import { useOrganization } from "@/context/organization.context"
import { AssistantProvider } from "@/context/assistant.context"
import { Panel, PanelGroup, type ImperativePanelHandle } from "react-resizable-panels"
import { PanelResizer } from "@/components/panels/PanelResizer"
import { AssistantSidebar } from "@/components/assistant/AssistantSidebar"
import { useTrackOnMount } from "@/hooks/use-posthog-tracking"
import { queries } from "@lydie/zero/queries"
import { z } from "zod"
import { AssistantChatUI } from "@/components/assistant/AssistantChatUI"

const assistantSearchSchema = z.object({
  conversationId: z.string().optional(),
  prompt: z.string().optional(),
})

export const Route = createFileRoute("/__auth/w/$organizationSlug/(assistant)/assistant/")({
  component: PageComponent,
  ssr: false,
  validateSearch: assistantSearchSchema,
  loaderDeps: ({ search }) => ({ conversationId: search.conversationId }),
  loader: async ({ context, deps }) => {
    const { zero, organization } = context
    const { conversationId } = deps

    if (!conversationId) {
      return { conversation: undefined }
    }

    const conversation = await zero.run(
      queries.assistant.byId({
        organizationId: organization.id,
        conversationId,
      }),
      { type: "complete" },
    )

    return { conversation }
  },
})

const COLLAPSED_SIZE = 3.5

function PageComponent() {
  const { organization } = useOrganization()
  const { conversation } = Route.useLoaderData()
  const [sidebarSize, setSidebarSize] = useState(25)
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null)
  const search = useSearch({ from: "/__auth/w/$organizationSlug/(assistant)/assistant/" })
  const initialPrompt = (search as { prompt?: string })?.prompt

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
        <AssistantProvider organizationId={organization.id} conversation={conversation}>
          <PanelGroup autoSaveId="assistant-panel-group" direction="horizontal">
            <Panel minSize={20} defaultSize={75} className="flex flex-col grow">
              <div className="flex flex-col h-full mx-auto w-full max-w-xl">
                <AssistantChatUI
                  organizationId={organization.id}
                  initialPrompt={initialPrompt}
                  showEmptyState={true}
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
              <AssistantSidebar isCollapsed={sidebarSize === COLLAPSED_SIZE} onToggle={toggleSidebar} />
            </Panel>
          </PanelGroup>
        </AssistantProvider>
      </Surface>
    </div>
  )
}
