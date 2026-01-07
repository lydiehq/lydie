import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { Surface } from "@/components/layout/Surface";
import { useCallback } from "react";
import { useOrganization } from "@/context/organization.context";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { ChatAlert } from "@/components/editor/ChatAlert";
import { AssistantInput } from "@/components/assistant/AssistantInput";
import { useAssistant } from "@/context/assistant.context";

export const Route = createFileRoute(
  "/__auth/w/$organizationSlug/(assistant)/assistant/"
)({
  component: PageComponent,
  ssr: false,
});

function PageComponent() {
  return (
    <div className="h-screen py-1 pr-1 flex flex-col pl-1">
      <Surface className="overflow-hidden size-full">
        <AssistantChat />
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
    <div className="flex flex-col h-full max-w-xl mx-auto">
      <div className="flex flex-col flex-1 min-h-0">
        {messages.length === 0 ? (
          <AssistantEmptyState onSubmit={handleSubmit} />
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

function AssistantEmptyState({
  onSubmit,
}: {
  onSubmit: (text: string) => void;
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center max-w-xl w-full space-y-6 px-4">
        <div className="flex justify-center">
          <div className="bg-gray-50 rounded-full p-6">
            <MessageCircle size={48} className="text-gray-400" />
          </div>
        </div>
        <h1 className="text-xl font-medium text-gray-900">
          Ask anything about your documents...
        </h1>
        <AssistantInput
          onSubmit={onSubmit}
          placeholder="Ask anything about your documents..."
        />
      </div>
    </div>
  );
}
