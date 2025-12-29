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
import { useOrganization } from "@/context/organization.context";
import { setActiveOrganizationSlug } from "@/lib/active-organization";

export const Route = createFileRoute("/__auth/w/$organizationSlug")({
  component: RouteComponent,
  beforeLoad: async ({ context, params }) => {
    // Set as active organization when navigating to it (handles direct navigation via URLs)
    setActiveOrganizationSlug(params.organizationSlug);

    context.zero.run(
      queries.organizations.bySlug({
        organizationSlug: params.organizationSlug,
      })
    );
  },
  ssr: false,
});

const COLLAPSED_SIZE = 3;

function RouteComponent() {
  const { organization } = useOrganization();
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
