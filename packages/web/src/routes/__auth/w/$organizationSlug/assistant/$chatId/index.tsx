import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";

import { AssistantChat } from "@/components/assistant/AssistantChat";
import { useOrganization } from "@/context/organization.context";
import { useAssistantChat } from "@/hooks/use-assistant-chat";

const assistantSearchSchema = z.object({
  prompt: z.string().optional(),
});

export const Route = createFileRoute("/__auth/w/$organizationSlug/assistant/$chatId/")({
  component: ExistingConversationPage,
  ssr: false,
  validateSearch: assistantSearchSchema,
});

function ExistingConversationPage() {
  const { chatId } = Route.useParams();
  const { organization } = useOrganization();
  const search = useSearch({
    from: "/__auth/w/$organizationSlug/assistant/$chatId/",
  });
  const initialPrompt = (search as { prompt?: string })?.prompt;

  const [conv] = useQuery(
    queries.assistant.byId({
      organizationId: organization.id,
      conversationId: chatId,
    }),
  );

  const {
    messages,
    sendMessage,
    stop,
    status: chatStatus,
    alert,
    setAlert,
    setMessages,
  } = useAssistantChat({
    conversationId: chatId,
    initialMessages:
      conv?.messages?.map((msg: any) => ({
        id: msg.id,
        role: msg.role as "user" | "system" | "assistant",
        parts: msg.parts,
        metadata: msg.metadata,
      })) || [],
  });

  // Only sync server messages on initial load, not during streaming
  // The AI SDK hook handles streaming updates internally
  useEffect(() => {
    // Only set initial messages if we have conv data and current messages are empty
    // This prevents overwriting streaming state
    if (conv?.messages && messages.length === 0) {
      const formattedMessages = conv.messages.map((msg: any) => ({
        id: msg.id,
        role: msg.role as "user" | "system" | "assistant",
        parts: msg.parts,
        metadata: msg.metadata,
      }));
      setMessages(formattedMessages);
    }
  }, [conv, setMessages, messages.length]);

  if (!conv) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-y-2">
          <div className="size-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Loading conversation...</span>
        </div>
      </div>
    );
  }

  return (
    <AssistantChat
      organizationId={organization.id}
      initialPrompt={initialPrompt}
      showEmptyState={false}
      messages={messages}
      sendMessage={sendMessage}
      stop={stop}
      status={chatStatus}
      alert={alert}
      setAlert={setAlert}
      isNewConversation={false}
      conversationTitle={conv.title}
    />
  );
}
