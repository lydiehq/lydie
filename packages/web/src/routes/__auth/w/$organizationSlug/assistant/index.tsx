import { createId } from "@lydie/core/id";
import { createFileRoute, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { z } from "zod";

import { AssistantChat } from "@/components/assistant/AssistantChat";
import { useOrganization } from "@/context/organization.context";
import { useAssistantChat } from "@/hooks/use-assistant-chat";

const assistantSearchSchema = z.object({
  prompt: z.string().optional(),
});

export const Route = createFileRoute("/__auth/w/$organizationSlug/assistant/")({
  component: NewConversationPage,
  ssr: false,
  validateSearch: assistantSearchSchema,
});

function NewConversationPage() {
  const { organization } = useOrganization();
  const { organizationSlug } = useParams({ from: "/__auth/w/$organizationSlug/assistant/" });
  const navigate = useNavigate();
  const search = useSearch({ from: "/__auth/w/$organizationSlug/assistant/" });
  const initialPrompt = (search as { prompt?: string })?.prompt;
  
  // Eagerly generate the conversation ID that will be used
  const [conversationId] = useState(() => createId());

  const { messages, sendMessage, stop, status, alert, setAlert } = useAssistantChat({
    conversationId,
  });

  // Navigate to the chat URL with the generated ID before sending
  const handleNavigateToChat = useCallback(() => {
    navigate({
      to: "/w/$organizationSlug/assistant/$chatId",
      params: { organizationSlug, chatId: conversationId },
    });
  }, [navigate, organizationSlug, conversationId]);

  return (
    <AssistantChat
      organizationId={organization.id}
      organizationSlug={organizationSlug}
      conversationId={conversationId}
      initialPrompt={initialPrompt}
      showEmptyState={true}
      messages={messages}
      sendMessage={sendMessage}
      stop={stop}
      status={status}
      alert={alert}
      setAlert={setAlert}
      isNewConversation={true}
      onNavigateToChat={handleNavigateToChat}
    />
  );
}
