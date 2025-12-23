import { Surface } from "@/components/layout/Surface";
import { HomeFileExplorer } from "@/components/home-file-explorer";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  Panel,
  PanelGroup,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { PanelResizer } from "@/components/panels/PanelResizer";
import { useRef, useState } from "react";
import { SidebarUnauthed } from "@/components/layout/SidebarUnauthed";

export const Route = createFileRoute("/_unauthed/")({
  component: RouteComponent,
  validateSearch: z.object({
    tree: z.string().optional(),
    q: z.string().optional(),
    focusSearch: z.boolean().optional(),
  }),
});

const COLLAPSED_SIZE = 3;

function RouteComponent() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);

  const toggleSidebar = () => {
    const panel = sidebarPanelRef.current;
    if (!panel) return;
    const willCollapse = !panel.isCollapsed();
    setIsCollapsed(willCollapse);
    willCollapse ? panel.collapse() : panel.expand();
  };

  return (
    <div className="h-screen flex">
      <PanelGroup autoSaveId="unauthed-workspace" direction="horizontal">
        <Panel
          ref={sidebarPanelRef}
          defaultSize={20}
          minSize={15}
          maxSize={30}
          collapsible
          collapsedSize={COLLAPSED_SIZE}
          onCollapse={() => setIsCollapsed(true)}
          onExpand={() => setIsCollapsed(false)}
        >
          <SidebarUnauthed isCollapsed={isCollapsed} onToggle={toggleSidebar} />
        </Panel>
        <PanelResizer />
        <Panel defaultSize={80} minSize={50}>
          <div className="p-1 size-full">
            <Surface>
              <HomeFileExplorer />
            </Surface>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
