import { Editor } from "@/components/Editor";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { queries } from "@lydie/zero/queries";
import { LOCAL_ORG_ID } from "@/lib/local-organization";
import {
  Panel,
  PanelGroup,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { PanelResizer } from "@/components/panels/PanelResizer";
import { useRef, useState } from "react";
import { SidebarUnauthed } from "@/components/layout/SidebarUnauthed";

export const Route = createFileRoute("/__unauthed/$id/")({
  component: RouteComponent,
  loader: async ({ context, params }) => {
    const { zero } = context;
    zero.run(
      queries.documents.byId({
        organizationId: LOCAL_ORG_ID,
        documentId: params.id,
      })
    );
  },
  ssr: false,
});

const COLLAPSED_SIZE = 3;

function RouteComponent() {
  const { id } = Route.useParams();
  const [doc] = useQuery(
    queries.documents.byId({
      organizationId: LOCAL_ORG_ID,
      documentId: id,
    })
  );

  const [isCollapsed, setIsCollapsed] = useState(false);
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);

  const toggleSidebar = () => {
    const panel = sidebarPanelRef.current;
    if (!panel) return;
    const willCollapse = !panel.isCollapsed();
    setIsCollapsed(willCollapse);
    willCollapse ? panel.collapse() : panel.expand();
  };

  if (!doc) {
    return <div>Document not found</div>;
  }

  return (
    <div className="h-screen flex">
      <PanelGroup autoSaveId="unauthed-editor" direction="horizontal">
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
          <Editor doc={doc} />
        </Panel>
      </PanelGroup>
    </div>
  );
}

