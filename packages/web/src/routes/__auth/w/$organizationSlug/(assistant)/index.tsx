import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Surface } from "@/components/layout/Surface";
import { useCallback } from "react";
import { AssistantInput } from "@/components/assistant/AssistantInput";
import { useAssistant } from "@/context/assistant.context";

export const Route = createFileRoute(
  "/__auth/w/$organizationSlug/(assistant)/"
)({
  component: PageComponent,
  ssr: false,
});

function PageComponent() {
  const { sendMessage, stop, conversationId } = useAssistant();
  const navigate = useNavigate();

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
        from: "/w/$organizationSlug",
        search: {
          conversationId,
        },
      });
    },
    [sendMessage, navigate, conversationId]
  );

  return (
    <div className="h-screen py-1 pr-1 flex flex-col pl-1">
      <Surface className="overflow-hidden size-full">
        <div className="max-w-xl mx-auto flex flex-col gap-y-4 items-center mt-[34svh]">
          <h1 className="text-2xl font-medium text-gray-900">
            Ask anything about your documents
          </h1>
          <AssistantInput
            onSubmit={handleSubmit}
            onStop={stop}
            placeholder="Ask anything. Use @ to refer to documents"
          />
        </div>
      </Surface>
    </div>
  );
}
