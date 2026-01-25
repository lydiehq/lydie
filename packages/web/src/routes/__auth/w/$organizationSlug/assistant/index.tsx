import { createId } from "@lydie/core/id";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { Group, Panel, useDefaultLayout, usePanelRef } from "react-resizable-panels";
import { z } from "zod";

import { AssistantChat } from "@/components/assistant/AssistantChat";
import { AssistantSidebar } from "@/components/assistant/AssistantSidebar";
import { Surface } from "@/components/layout/Surface";
import { PanelResizer } from "@/components/panels/PanelResizer";
import { useOrganization } from "@/context/organization.context";
import { useAssistantChat } from "@/hooks/use-assistant-chat";

const assistantSearchSchema = z.object({
  prompt: z.string().optional(),
});

export const Route = createFileRoute("/__auth/w/$organizationSlug/assistant/")({
  component: PageComponent,
  ssr: false,
  validateSearch: assistantSearchSchema,
});

function PageComponent() {
  const { organization } = useOrganization();
  const [sidebarSize, setSidebarSize] = useState(320);
  const sidebarPanelRef = usePanelRef();
  const search = useSearch({ from: "/__auth/w/$organizationSlug/assistant/" });
  const initialPrompt = (search as { prompt?: string })?.prompt;
  const [conversationId] = useState(() => createId());

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "assistant-panel-group",
    storage: localStorage,
  });

  const { messages, sendMessage, stop, status, alert, setAlert, setMessages } = useAssistantChat({
    conversationId,
  });

  const resetConversation = useCallback(() => {
    setMessages([]);
  }, [setMessages]);

  const toggleSidebar = () => {
    if (!sidebarPanelRef.current) return;
    if (sidebarPanelRef.current.isCollapsed()) {
      sidebarPanelRef.current.expand();
    } else {
      sidebarPanelRef.current.collapse();
    }
  };

  return (
    <div className="h-screen py-1 pr-1 flex flex-col pl-1">
      <Surface className="overflow-hidden size-full">
        <Group
          orientation="horizontal"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
        >
          <Panel minSize="400px" className="flex flex-col grow">
            <div className="flex flex-col h-full mx-auto w-full max-w-xl">
              <AssistantChat
                organizationId={organization.id}
                initialPrompt={initialPrompt}
                showEmptyState={true}
                messages={messages}
                sendMessage={sendMessage}
                stop={stop}
                status={status}
                alert={alert}
                setAlert={setAlert}
                conversationId={conversationId}
              />
            </div>
          </Panel>
          <PanelResizer />
          <Panel
            panelRef={sidebarPanelRef}
            id="assistant-sidebar"
            collapsible={true}
            collapsedSize="56px"
            minSize="200px"
            defaultSize="320px"
            onResize={(nextSize) => setSidebarSize(nextSize.inPixels)}
          >
            <AssistantSidebar
              isCollapsed={sidebarSize === 56}
              onToggle={toggleSidebar}
              conversationId={conversationId}
              onNewConversation={resetConversation}
            />
          </Panel>
        </Group>
      </Surface>
    </div>
  );
}
