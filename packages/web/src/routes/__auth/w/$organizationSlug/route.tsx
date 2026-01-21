import { createFileRoute, notFound, Outlet } from "@tanstack/react-router"
import { Sidebar } from "@/components/layout/Sidebar"
import { Panel, PanelGroup, type ImperativePanelHandle } from "react-resizable-panels"
import { PanelResizer } from "@/components/panels/PanelResizer"
import { useRef, useState } from "react"
import { CommandMenu } from "@/components/layout/command-menu/CommandMenu"
import { setActiveOrganizationSlug } from "@/lib/active-organization"
import { loadOrganization } from "@/lib/organization/loadOrganization"
import { FloatingAssistantProvider } from "@/context/floating-assistant.context"
import { FloatingAssistant } from "@/components/assistant/FloatingAssistant"

export const Route = createFileRoute("/__auth/w/$organizationSlug")({
  component: RouteComponent,
  beforeLoad: async ({ context, params }) => {
    try {
      const { zero, auth, queryClient } = context
      const { organizationSlug } = params

      const organization = await loadOrganization(queryClient, zero, organizationSlug)

      setActiveOrganizationSlug(params.organizationSlug, auth?.session?.userId)
      return { organization }
    } catch (error) {
      console.error(error)
      throw notFound()
    }
  },
  notFoundComponent: () => <div>Organization not found</div>,
  gcTime: Infinity,
  staleTime: Infinity,
  ssr: false,
})

const COLLAPSED_SIZE = 3

function RouteComponent() {
  return (
    <FloatingAssistantProvider>
      <RouteLayout />
    </FloatingAssistantProvider>
  )
}

function RouteLayout() {
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null)
  const [size, setSize] = useState(25)

  const toggleSidebar = () => {
    const panel = sidebarPanelRef.current
    if (!panel) return
    panel.isCollapsed() ? panel.expand() : panel.collapse()
  }

  if (!organization) return null

  return (
    <div className="flex h-screen flex-col">
      <CommandMenu />
      <PanelGroup autoSaveId="main-panel-group" direction="horizontal">
        <Panel
          className="h-full flex flex-col"
          ref={sidebarPanelRef}
          id="left-sidebar"
          collapsible
          collapsedSize={COLLAPSED_SIZE}
          minSize={16}
          maxSize={40}
          defaultSize={25}
          onResize={setSize}
        >
          <Sidebar isCollapsed={size === COLLAPSED_SIZE} onToggle={toggleSidebar} />
        </Panel>
        <PanelResizer />
        <Panel>
          <Outlet />
        </Panel>
      </PanelGroup>
    </div>
  )
}
