import { createFileRoute, notFound, Outlet, useRouterState, useNavigate } from "@tanstack/react-router"
import { Sidebar } from "@/components/layout/Sidebar"
import { Panel, PanelGroup, type ImperativePanelHandle } from "react-resizable-panels"
import { PanelResizer } from "@/components/panels/PanelResizer"
import { useRef, useState, useMemo, useEffect } from "react"
import { CommandMenu } from "@/components/layout/command-menu/CommandMenu"
import { loadOrganization } from "@/lib/organization/loadOrganization"
import { useAtomValue } from "jotai"
import { isDockedAtom } from "@/stores/floating-assistant"
import { FloatingAssistant } from "@/components/assistant/FloatingAssistant"
import { InstallTemplateDialog } from "@/components/templates/InstallTemplateDialog"
import { z } from "zod"

const organizationSearchSchema = z.object({
  installTemplate: z.string().optional().catch(undefined),
})

export const Route = createFileRoute("/__auth/w/$organizationSlug")({
  component: RouteComponent,
  validateSearch: (search) => organizationSearchSchema.parse(search),
  beforeLoad: async ({ context, params }) => {
    try {
      const { zero, queryClient } = context
      const { organizationSlug } = params

      const organization = await loadOrganization(queryClient, zero, organizationSlug)

      // await authClient.organization.setActive({
      //   organizationId: organization.id,
      // })

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
  const navigate = useNavigate()
  const search = Route.useSearch()
  const params = Route.useParams()

  // Template installation dialog state
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false)

  // Open template installation dialog when installTemplate parameter is present
  useEffect(() => {
    if (search.installTemplate) {
      setIsTemplateDialogOpen(true)
    }
  }, [search.installTemplate])

  const handleTemplateDialogClose = (isOpen: boolean) => {
    setIsTemplateDialogOpen(isOpen)

    if (!isOpen && search.installTemplate) {
      navigate({
        to: "/w/$organizationSlug",
        params: { organizationSlug: params.organizationSlug },
        search: {},
        replace: true,
      })
    }
  }

  const toggleSidebar = () => {
    const panel = sidebarPanelRef.current
    if (!panel) return
    panel.isCollapsed() ? panel.expand() : panel.collapse()
  }

  const currentDocumentId = useMemo(() => {
    const params = routerState.location.pathname.split("/")
    const orgSlugIndex = params.indexOf("w")
    if (orgSlugIndex !== -1 && params[orgSlugIndex + 2]) {
      return params[orgSlugIndex + 2]
    }
    return null
  }, [routerState.location.pathname])

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
      {/* Template installation dialog */}
      {search.installTemplate && (
        <InstallTemplateDialog
          isOpen={isTemplateDialogOpen}
          onOpenChange={handleTemplateDialogClose}
          templateSlug={search.installTemplate}
        />
      )}
    </div>
  )
}
