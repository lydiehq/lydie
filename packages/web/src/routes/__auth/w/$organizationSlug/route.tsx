import { createFileRoute, notFound, Outlet, useRouterState } from "@tanstack/react-router"
import { Sidebar } from "@/components/layout/Sidebar"
import { Panel, PanelGroup, type ImperativePanelHandle } from "react-resizable-panels"
import { PanelResizer } from "@/components/panels/PanelResizer"
import { useRef, useState, useMemo } from "react"
import { CommandMenu } from "@/components/layout/command-menu/CommandMenu"
import { setActiveOrganizationSlug } from "@/lib/active-organization"
import { loadOrganization } from "@/lib/organization/loadOrganization"
import { useAtomValue } from "jotai"
import { isDockedAtom } from "@/stores/floating-assistant"
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
  return <RouteLayout />
}

function RouteLayout() {
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null)
  const assistantPanelRef = useRef<ImperativePanelHandle>(null)
  const [size, setSize] = useState(25)
  const routerState = useRouterState()
  const isDocked = useAtomValue(isDockedAtom)

  const toggleSidebar = () => {
    const panel = sidebarPanelRef.current
    if (!panel) return
    panel.isCollapsed() ? panel.expand() : panel.collapse()
  }

  // Extract document ID from route params if on a document page
  const currentDocumentId = useMemo(() => {
    const params = routerState.location.pathname.split("/")
    const orgSlugIndex = params.indexOf("w")
    if (orgSlugIndex !== -1 && params[orgSlugIndex + 2]) {
      // Pattern: /w/{slug}/{documentId}
      return params[orgSlugIndex + 2]
    }
    return null
  }, [routerState.location.pathname])

  // Check if we're on the settings route
  const isSettingsRoute = routerState.location.pathname.includes("/settings")
  const shouldShowDockedPanel = isDocked && !isSettingsRoute

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
        {shouldShowDockedPanel && (
          <>
            <PanelResizer />
            <Panel ref={assistantPanelRef} id="assistant-panel" defaultSize={30} minSize={20} maxSize={50}>
              <div id="docked-assistant-container" className="h-full pr-1 py-1 pl-px" />
            </Panel>
          </>
        )}
      </PanelGroup>
      {/* Portal containers */}
      <div id="floating-assistant-container" />
      {/* The assistant component (always rendered) */}
      <FloatingAssistant currentDocumentId={currentDocumentId} />
    </div>
  )
}
