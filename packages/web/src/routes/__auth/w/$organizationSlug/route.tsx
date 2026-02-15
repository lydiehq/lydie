import {
  Outlet,
  createFileRoute,
  notFound,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "react-aria-components";
import { Group, Panel, useDefaultLayout, usePanelRef } from "react-resizable-panels";
import { z } from "zod";

import { isFloatingAssistantDockedAtom as isDockedAtom } from "@/atoms/workspace-settings";
import { FloatingAssistant } from "@/components/assistant/FloatingAssistant";
import { CommandMenu } from "@/components/layout/CommandMenu";
import { DocumentTabBar } from "@/components/layout/DocumentTabBar";
import { ErrorPage } from "@/components/layout/ErrorPage";
import { Sidebar } from "@/components/layout/Sidebar";
import { SidebarIcon } from "@/components/layout/SidebarIcon";
import { PanelResizer } from "@/components/panels/PanelResizer";
import { InstallTemplateDialog } from "@/components/templates/InstallTemplateDialog";
import { useWorkspaceWebSocket } from "@/hooks/use-workspace-websocket";
import { loadOrganization } from "@/lib/organization/loadOrganization";
import { authClient } from "@/utils/auth";

const organizationSearchSchema = z.object({
  installTemplate: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/__auth/w/$organizationSlug")({
  component: RouteComponent,
  validateSearch: (search) => organizationSearchSchema.parse(search),
  beforeLoad: async ({ context, params }) => {
    try {
      const { zero, queryClient } = context;
      const { organizationSlug } = params;

      const organization = await loadOrganization(queryClient, zero, organizationSlug);

      return { organization };
    } catch (error) {
      console.error(error);
      throw notFound();
    }
  },
  notFoundComponent: NotFoundComponent,
  gcTime: Infinity,
  staleTime: Infinity,
});

const COLLAPSED_SIZE = 50; // pixels

function NotFoundComponent() {
  return (
    <ErrorPage
      error={new Error("Organization not found")}
      reset={() => {
        window.location.href = "/";
      }}
    />
  );
}

function RouteComponent() {
  return <RouteLayout />;
}

function RouteLayout() {
  // Initialize shared WebSocket connection for the workspace
  useWorkspaceWebSocket();

  const sidebarPanelRef = usePanelRef();
  const assistantPanelRef = usePanelRef();
  const [dockedAssistantContainer, setDockedAssistantContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const [floatingAssistantContainer, setFloatingAssistantContainer] =
    useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState(280); // pixels
  const isCollapsed = size === COLLAPSED_SIZE;
  const routerState = useRouterState();
  const isDocked = useAtomValue(isDockedAtom);

  const toggleSidebar = useCallback(() => {
    if (!sidebarPanelRef.current) return;
    if (sidebarPanelRef.current.isCollapsed()) {
      sidebarPanelRef.current.expand();
    } else {
      sidebarPanelRef.current.collapse();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for toggle-sidebar event from child components
  useEffect(() => {
    const handleToggleSidebar = () => {
      toggleSidebar();
    };
    window.addEventListener("toggle-sidebar", handleToggleSidebar);
    return () => {
      window.removeEventListener("toggle-sidebar", handleToggleSidebar);
    };
  }, [toggleSidebar]);
  const navigate = useNavigate();
  const search = Route.useSearch();
  const params = Route.useParams();
  const { organization } = Route.useRouteContext();

  // Track the last organization that was set as active to avoid unnecessary API calls.
  // This ref persists across renders but doesn't trigger re-renders when changed.
  const lastActiveOrgIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Only set active organization if:
    // 1. We have an organization
    // 2. It's different from the last one we set
    if (organization && organization.id !== lastActiveOrgIdRef.current) {
      // Update the ref immediately to prevent concurrent calls
      lastActiveOrgIdRef.current = organization.id;

      // Set the active organization on the server
      authClient.organization.setActive({
        organizationId: organization.id,
      });
    }
  }, [organization]);

  const dockedAssistantContainerRef = useCallback((node: HTMLDivElement | null) => {
    setDockedAssistantContainer(node);
  }, []);

  const floatingAssistantContainerRef = useCallback((node: HTMLDivElement | null) => {
    setFloatingAssistantContainer(node);
  }, []);

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "main-panel-group",
    storage: localStorage,
  });

  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(!!search.installTemplate);

  const handleTemplateDialogClose = (isOpen: boolean) => {
    setIsTemplateDialogOpen(isOpen);

    if (!isOpen && search.installTemplate) {
      navigate({
        to: "/w/$organizationSlug",
        params: { organizationSlug: params.organizationSlug },
        search: {},
        replace: true,
      });
    }
  };

  const currentDocumentId = useMemo(() => {
    const params = routerState.location.pathname.split("/");
    const orgSlugIndex = params.indexOf("w");
    if (orgSlugIndex !== -1 && params[orgSlugIndex + 2]) {
      return params[orgSlugIndex + 2];
    }
    return null;
  }, [routerState.location.pathname]);

  const shouldShowDockedPanel = isDocked;

  return (
    <div className="flex h-screen flex-col">
      <CommandMenu />
      <div className="panel-group-collapse-animated flex h-full min-h-0 flex-1">
        <Group
          orientation="horizontal"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
          className="flex-1"
        >
          <Panel
            className="h-full flex flex-col overflow-hidden"
            panelRef={sidebarPanelRef}
            id="left-sidebar"
            collapsible
            collapsedSize="50px"
            minSize="200px"
            maxSize="400px"
            defaultSize="280px"
            onResize={(nextSize) => setSize(nextSize.inPixels)}
          >
            <Sidebar isCollapsed={isCollapsed} onToggle={toggleSidebar} />
          </Panel>
          <PanelResizer />
          <Panel className="relative flex flex-col">
            <div className="flex-1 relative overflow-hidden">
              <DocumentTabBar organizationSlug={params.organizationSlug} />
              <Outlet />
            </div>
            <FloatingSidebarToggleButton
              isCollapsed={isCollapsed}
              isEditorPage={!!currentDocumentId}
            />
          </Panel>
          {shouldShowDockedPanel && (
            <>
              <PanelResizer />
              <Panel
                panelRef={assistantPanelRef}
                id="assistant-panel"
                defaultSize="400px"
                minSize="300px"
                maxSize="600px"
              >
                <div ref={dockedAssistantContainerRef} className="h-full pr-1 py-1 pl-px" />
              </Panel>
            </>
          )}
        </Group>
      </div>
      <div ref={floatingAssistantContainerRef} />
      <FloatingAssistant
        currentDocumentId={currentDocumentId}
        dockedContainer={dockedAssistantContainer}
        floatingContainer={floatingAssistantContainer}
      />
      {search.installTemplate && (
        <InstallTemplateDialog
          isOpen={isTemplateDialogOpen}
          onOpenChange={handleTemplateDialogClose}
          templateSlug={search.installTemplate}
        />
      )}
    </div>
  );
}

type FloatingSidebarToggleButtonProps = {
  isCollapsed: boolean;
  isEditorPage: boolean;
};

function FloatingSidebarToggleButton({
  isCollapsed,
  isEditorPage,
}: FloatingSidebarToggleButtonProps) {
  if (!isCollapsed || isEditorPage) {
    return null;
  }

  return (
    <div className="absolute top-3 left-3 z-50">
      <Button
        onPress={() => {
          window.dispatchEvent(new CustomEvent("toggle-sidebar"));
        }}
        aria-label="Expand sidebar"
      >
        <SidebarIcon direction="left" collapsed={true} />
      </Button>
    </div>
  );
}
