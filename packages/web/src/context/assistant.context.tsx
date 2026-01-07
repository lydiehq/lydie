import {
  createContext,
  useContext,
  useState,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { DocumentChatAgentUIMessage } from "@lydie/core/ai/agents/document-agent/index";
import { createId } from "@lydie/core/id";
import { useZero } from "@/services/zero";
import { mutators } from "@lydie/zero/mutators";
import { parseChatError, isUsageLimitError } from "@/utils/chat-error-handler";
import type { ChatAlertState } from "@/components/editor/ChatAlert";

interface AssistantContextValue {
  conversationId: string;
  messages: any[];
  sendMessage: (options: { text: string; metadata?: any }) => void;
  stop: () => void;
  status: string;
  alert: ChatAlertState | null;
  setAlert: (alert: ChatAlertState | null) => void;
  addToolOutput: (options: {
    toolCallId: string;
    tool: string;
    output: string;
  }) => void;
  resetConversation: () => void;
  setConversation: (conversation: any) => void;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function useAssistant() {
  const context = useContext(AssistantContext);
  if (!context) {
    throw new Error("useAssistant must be used within AssistantProvider");
  }
  return context;
}

interface AssistantProviderProps {
  children: React.ReactNode;
  organizationId: string;
  conversationId?: string;
  selectedConversation?: any;
}

export function AssistantProvider({
  children,
  organizationId,
  conversationId: initialConversationId,
  selectedConversation,
}: AssistantProviderProps) {
  const [conversationId, setConversationId] = useState(
    () => initialConversationId || createId()
  );
  const [alert, setAlert] = useState<ChatAlertState | null>(null);
  const [conversation, setConversation] = useState<any>(selectedConversation);
  const z = useZero();

  const { messages, sendMessage, stop, status, addToolOutput, setMessages } =
    useChat<DocumentChatAgentUIMessage>({
      id: conversationId,
      messages:
        conversation?.messages?.map((msg: any) => ({
          id: msg.id,
          role: msg.role as "user" | "system" | "assistant",
          parts: msg.parts,
          metadata: msg.metadata,
        })) || [],
      transport: new DefaultChatTransport({
        api:
          import.meta.env.VITE_API_URL.replace(/\/+$/, "") +
          "/internal/assistant",
        credentials: "include",
        body: {
          conversationId,
        },
        headers: {
          "X-Organization-Id": organizationId,
        },
      }),
      async onToolCall({ toolCall }) {
        if (toolCall.toolName === "createDocument") {
          const args = (toolCall as any).args ?? (toolCall as any).input;
          const { title, content } = args as {
            title?: string;
            content?: string;
          };
          const id = createId();

          z.mutate(
            mutators.document.create({
              id,
              organizationId: organizationId,
              title: title || "Untitled",
            })
          );

          addToolOutput({
            toolCallId: toolCall.toolCallId,
            tool: "createDocument",
            output: JSON.stringify({
              id,
              title: title || "Untitled",
              snippet: content,
              message: "Document created.",
            }),
          });
        }
      },
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
    });

  const resetConversation = useCallback(() => {
    const newId = createId();
    setConversationId(newId);
    setConversation(null);
    setMessages([]);
  }, [setMessages]);

  const handleSetConversation = useCallback(
    (conv: any) => {
      setConversation(conv);
      if (conv?.id) {
        setConversationId(conv.id);
      }
      if (conv?.messages) {
        const formattedMessages = conv.messages.map((msg: any) => ({
          id: msg.id,
          role: msg.role as "user" | "system" | "assistant",
          parts: msg.parts,
          metadata: msg.metadata,
        }));
        setMessages(formattedMessages);
      }
    },
    [setMessages]
  );

  const value = useMemo(
    () => ({
      conversationId,
      messages,
      sendMessage,
      stop,
      status,
      alert,
      setAlert,
      addToolOutput,
      resetConversation,
      setConversation: handleSetConversation,
    }),
    [
      conversationId,
      messages,
      sendMessage,
      stop,
      status,
      alert,
      addToolOutput,
      resetConversation,
      handleSetConversation,
    ]
  );

  return (
    <AssistantContext.Provider value={value}>
      {children}
    </AssistantContext.Provider>
  );
}
