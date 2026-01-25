import type { DocumentChatAgentUIMessage } from "@lydie/core/ai/agents/document-agent/index";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useRef, useState } from "react";

import type { ChatAlertState } from "@/components/editor/ChatAlert";

import { useOrganization } from "@/context/organization.context";
import { isUsageLimitError, parseChatError } from "@/utils/chat-error-handler";

interface UseAssistantChatOptions {
  conversationId: string;
  initialMessages?: DocumentChatAgentUIMessage[];
}

export function useAssistantChat({
  conversationId,
  initialMessages = [],
}: UseAssistantChatOptions) {
  const { organization } = useOrganization();
  const [alert, setAlert] = useState<ChatAlertState | null>(null);
  const messageStartTimeRef = useRef<number>(0);

  const {
    messages,
    sendMessage: originalSendMessage,
    stop,
    status,
    setMessages,
  } = useChat<DocumentChatAgentUIMessage>({
    id: conversationId,
    messages: initialMessages,
    experimental_throttle: 100,
    transport: new DefaultChatTransport({
      api: import.meta.env.VITE_API_URL.replace(/\/+$/, "") + "/internal/assistant",
      credentials: "include",
      body: {
        conversationId,
      },
      headers: {
        "X-Organization-Id": organization.id,
      },
    }),
    onError: (error) => {
      console.error("Assistant chat error:", error);
      const { message } = parseChatError(error);

      if (isUsageLimitError(error)) {
        setAlert({
          show: true,
          type: "error",
          title: "Daily Limit Reached",
          message,
        });
      } else {
        setAlert({
          show: true,
          type: "error",
          title: "Something went wrong",
          message,
        });
      }
    },
    onFinish: () => {
      // Response finished
    },
  });

  const sendMessage = useCallback(
    (options: { text: string; metadata?: any; agentId?: string | null }) => {
      messageStartTimeRef.current = Date.now();

      // Pass agentId in the body
      const transport = new DefaultChatTransport({
        api: import.meta.env.VITE_API_URL.replace(/\/+$/, "") + "/internal/assistant",
        credentials: "include",
        body: {
          conversationId,
          agentId: options.agentId || null,
        },
        headers: {
          "X-Organization-Id": organization.id,
        },
      });

      return originalSendMessage({ ...options, transport });
    },
    [originalSendMessage, conversationId, organization.id],
  );

  return {
    messages,
    sendMessage,
    stop,
    status,
    alert,
    setAlert,
    setMessages,
  };
}
