import {
  Outlet,
  createFileRoute,
  notFound,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Panel, useDefaultLayout, usePanelRef } from "react-resizable-panels";
import { z } from "zod";

import {
  isFloatingAssistantDockedAtom as isDockedAtom,
  isSidebarCollapsedAtom,
  sidebarToggleSignalAtom,
} from "@/atoms/workspace-settings";
import { setDocumentTabsStorageScopeAtom } from "@/atoms/tabs";
import { FloatingAssistant } from "@/components/assistant/FloatingAssistant";
import { CommandMenu } from "@/components/layout/CommandMenu";
import { DocumentTabBar } from "@/components/layout/DocumentTabBar";
import { ErrorPage } from "@/components/layout/ErrorPage";
import { Sidebar } from "@/components/layout/Sidebar";
import { Surface } from "@/components/layout/Surface";
import { PanelResizer } from "@/components/panels/PanelResizer";
import { InstallTemplateDialog } from "@/components/templates/InstallTemplateDialog";
import { useAuth } from "@/context/auth.context";
import { useWorkspaceWebSocket } from "@/hooks/use-workspace-websocket";
import { getCachedSession, revalidateSession, type ExtendedSessionData } from "@/lib/auth/session";
import { loadOrganization } from "@/lib/organization/loadOrganization";
import { resolveOrganizationRecovery } from "@/routes/__auth/w/$organizationSlug/-organization-recovery";
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

      const isOrganizationMissing =
        error instanceof Error && error.message.startsWith("Organization not found:");

      if (isOrganizationMissing) {
        await revalidateSession(context.queryClient);

        const refreshedSession = getCachedSession(context.queryClient)?.session;
        const fallbackSession = (context.auth as ExtendedSessionData | undefined)?.session;
        const recovery = resolveOrganizationRecovery(
          params.organizationSlug,
          refreshedSession ?? fallbackSession,
        );

        if (recovery.type === "redirect-new") {
          throw redirect({ to: "/new" });
        }

        if (recovery.type === "redirect-workspace") {
          throw redirect({
            to: "/w/$organizationSlug",
            params: {
              organizationSlug: recovery.organizationSlug,
            },
          });
        }
      }

      throw notFound();
    }
  },
  notFoundComponent: NotFoundComponent,
  gcTime: Infinity,
  staleTime: Infinity,
});

const COLLAPSED_SIZE = 50;

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
  useWorkspaceWebSocket();

  const sidebarPanelRef = usePanelRef();
  const assistantPanelRef = usePanelRef();
  const [dockedAssistantContainer, setDockedAssistantContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const [floatingAssistantContainer, setFloatingAssistantContainer] =
    useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState(280);
  const isCollapsed = size === COLLAPSED_SIZE;
  const [, setSidebarCollapsed] = useAtom(isSidebarCollapsedAtom);
  const setTabStorageScope = useSetAtom(setDocumentTabsStorageScopeAtom);
  const routerState = useRouterState();
  const isDocked = useAtomValue(isDockedAtom);
  const sidebarToggleSignal = useAtomValue(sidebarToggleSignalAtom);
  const { session } = useAuth();

  useEffect(() => {
    setSidebarCollapsed(isCollapsed);
  }, [isCollapsed, setSidebarCollapsed]);

  const toggleSidebar = useCallback(() => {
    if (!sidebarPanelRef.current) return;
    if (sidebarPanelRef.current.isCollapsed()) {
      sidebarPanelRef.current.expand();
    } else {
      sidebarPanelRef.current.collapse();
    }
  }, [sidebarPanelRef]);

  useEffect(() => {
    if (sidebarToggleSignal === 0) {
      return;
    }

    toggleSidebar();
  }, [sidebarToggleSignal, toggleSidebar]);
  const navigate = useNavigate();
  const search = Route.useSearch();
  const params = Route.useParams();
  const { organization } = Route.useRouteContext();

  const lastActiveOrgIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (organization && organization.id !== lastActiveOrgIdRef.current) {
      lastActiveOrgIdRef.current = organization.id;

      void authClient.organization.setActive({
        organizationId: organization.id,
      });
    }
  }, [organization]);

  useEffect(() => {
    if (!session?.userId) {
      return;
    }

    setTabStorageScope({
      userId: session.userId,
      workspaceId: organization.id,
    });
  }, [organization.id, session?.userId, setTabStorageScope]);

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
      void navigate({
        href: `/w/${params.organizationSlug}`,
        replace: true,
      });
    }
  };

  const currentDocumentId = useMemo(() => {
    for (let index = routerState.matches.length - 1; index >= 0; index -= 1) {
      const params = routerState.matches[index]?.params;

      if (!params || typeof params !== "object" || !("id" in params)) {
        continue;
      }

      const id = params.id;

      if (typeof id === "string" && id.length > 0) {
        return id;
      }
    }

    return null;
  }, [routerState.matches]);

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
            <div className="flex-1 relative overflow-hidden flex flex-col">
              <DocumentTabBar organizationSlug={params.organizationSlug} />
              <div className="flex-1 min-h-0 p-1">
                <Surface className="h-full overflow-y-auto">
                  <Outlet />
                </Surface>
              </div>
            </div>
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
