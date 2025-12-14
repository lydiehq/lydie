import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { useMemo } from "react";
import { createId } from "@lydie/core/id";
import { useOrganization } from "@/context/organization.context";

type MessageMetadata = {
  timestamp?: string;
  model?: string;
  duration?: number;
};

type MessageWithMetadata = UIMessage<MessageMetadata>;

interface UseAssistantChatProps {
  conversationId?: string;
  initialMessages?: MessageWithMetadata[];
}

export function useAssistantChat({
  conversationId: providedConversationId,
  initialMessages = [],
}: UseAssistantChatProps = {}) {
  const conversationId = useMemo(() => {
    return providedConversationId || createId();
  }, [providedConversationId]);

  const { organization } = useOrganization();

  const { messages, sendMessage, status, isLoading } =
    useChat<MessageWithMetadata>({
      transport: new DefaultChatTransport({
        api:
          import.meta.env.VITE_API_URL.replace(/\/+$/, "") +
          "/internal/assistant",
        credentials: "include",
        body: {
          conversationId: conversationId,
        },
        headers: {
          "X-Organization-Id": organization?.id || "",
        },
      }),
      initialMessages,
    });

  const sendAssistantMessage = (content: string) => {
    sendMessage({
      text: content,
      metadata: {
        timestamp: new Date().toISOString(),
      },
    });
  };

  return {
    messages,
    sendMessage: sendAssistantMessage,
    status,
    isLoading,
    conversationId,
  };
}
