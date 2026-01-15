import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MessageCircleIcon } from "@/icons";
import { Surface } from "@/components/layout/Surface";
import { useCallback, useRef, useState } from "react";
import { useOrganization } from "@/context/organization.context";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { ChatAlert } from "@/components/editor/ChatAlert";
import { AssistantInput } from "@/components/assistant/AssistantInput";
import { useAssistant } from "@/context/assistant.context";
import {
  Panel,
  PanelGroup,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { PanelResizer } from "@/components/panels/PanelResizer";
import { AssistantSidebar } from "@/components/assistant/AssistantSidebar";
import { useTrackOnMount } from "@/hooks/use-posthog-tracking";

export const Route = createFileRoute(
  "/__auth/w/$organizationSlug/(assistant)/assistant/"
)({
  component: PageComponent,
  ssr: false,
});

const COLLAPSED_SIZE = 3.5;

function PageComponent() {
  const [sidebarSize, setSidebarSize] = useState(25);
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);

  const toggleSidebar = () => {
    const panel = sidebarPanelRef.current;
    if (!panel) return;
    panel.isCollapsed() ? panel.expand() : panel.collapse();
  };

  return (
    <div className="h-screen py-1 pr-1 flex flex-col pl-1">
      <Surface className="overflow-hidden size-full">
        <PanelGroup autoSaveId="assistant-panel-group" direction="horizontal">
          <Panel minSize={20} defaultSize={75} className="flex flex-col grow">
            <AssistantChat />
          </Panel>
          <PanelResizer />
          <Panel
            ref={sidebarPanelRef}
            id="assistant-sidebar"
            collapsible={true}
            collapsedSize={COLLAPSED_SIZE}
            minSize={12}
            defaultSize={25}
            onResize={setSidebarSize}
          >
            <AssistantSidebar
              isCollapsed={sidebarSize === COLLAPSED_SIZE}
              onToggle={toggleSidebar}
            />
          </Panel>
        </PanelGroup>
      </Surface>
    </div>
  );
}

function AssistantChat() {
  const { organization } = useOrganization();
  const {
    messages,
    sendMessage,
    stop,
    status,
    alert,
    setAlert,
    conversationId,
  } = useAssistant();
  const navigate = useNavigate();
  const { organizationSlug } = Route.useParams();

  // Track assistant opened
  useTrackOnMount("assistant_opened", {
    organizationId: organization.id,
  });

  const handleSubmit = useCallback(
    (text: string) => {
      sendMessage({
        text,
        metadata: {
          createdAt: new Date().toISOString(),
        },
      });

      navigate({
        to: "/w/$organizationSlug/assistant",
        from: "/w/$organizationSlug/assistant",
        search: {
          conversationId,
        },
        replace: true,
      });
    },
    [sendMessage, navigate, conversationId, organizationSlug]
  );

  const canStop = status === "submitted" || status === "streaming";

  return (
    <div className="flex flex-col h-full mx-auto w-full max-w-xl">
      <div className="flex flex-col flex-1 min-h-0">
        {messages.length === 0 ? (
          <div className="mt-[34svh] flex flex-col gap-y-4 items-center">
            <h1 className="text-2xl font-medium text-gray-900">
              Ask anything about your documents
            </h1>
            <AssistantInput
              onSubmit={handleSubmit}
              onStop={stop}
              placeholder="Ask anything. Use @ to refer to documents"
            />
          </div>
        ) : (
          <>
            <ChatMessages
              messages={messages}
              status={status as "submitted" | "streaming" | "ready" | "error"}
              editor={null}
              organizationId={organization.id}
            />
            <div className="p-3 relative shrink-0">
              <div className="top-0 absolute inset-x-0 h-6 bg-linear-to-t from-gray-50 via-gray-50" />
              <div className="z-10 relative">
                <ChatAlert
                  alert={alert}
                  onDismiss={() =>
                    setAlert(alert ? { ...alert, show: false } : null)
                  }
                />
                <AssistantInput
                  onSubmit={handleSubmit}
                  onStop={stop}
                  placeholder="Ask anything. Use @ to refer to documents"
                  canStop={canStop}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
