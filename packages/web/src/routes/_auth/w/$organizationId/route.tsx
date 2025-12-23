import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Sidebar } from "@/components/layout/Sidebar";
import {
  Panel,
  PanelGroup,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { PanelResizer } from "@/components/panels/PanelResizer";
import { useRef, useState } from "react";
import { CommandMenu } from "@/components/layout/command-menu/CommandMenu";
import { queries } from "@lydie/zero/queries";
import { useOrganizationContext } from "@/context/organization-provider";
import { setActiveOrganizationId } from "@/lib/active-organization";
import { OrganizationProvider } from "@/context/organization-provider";

export const Route = createFileRoute("/_auth/w/$organizationId")({
  component: WrapperComponent,
  beforeLoad: async ({ context, params }) => {
    // Set as active organization when navigating to it (handles direct navigation via URLs)
    setActiveOrganizationId(params.organizationId);

    context.zero.run(
      queries.organizations.byId({ organizationId: params.organizationId })
    );
  },
  ssr: false,
});

function WrapperComponent() {
  const { organizationId } = Route.useParams();
  return (
    <OrganizationProvider organizationId={organizationId}>
      <RouteComponent />
    </OrganizationProvider>
  );
}

const COLLAPSED_SIZE = 3;

function RouteComponent() {
  const { organization } = useOrganizationContext();
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
  const [size, setSize] = useState(25);

  const toggleSidebar = () => {
    const panel = sidebarPanelRef.current;
    if (!panel) return;
    panel.isCollapsed() ? panel.expand() : panel.collapse();
  };

  if (!organization) return null;

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
          <Sidebar
            isCollapsed={size === COLLAPSED_SIZE}
            onToggle={toggleSidebar}
          />
        </Panel>
        <PanelResizer />
        <Panel>
          <Outlet />
        </Panel>
      </PanelGroup>
    </div>
  );
}
