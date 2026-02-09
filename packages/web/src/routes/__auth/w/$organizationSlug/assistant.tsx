import { createId } from "@lydie/core/id";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import {
  createFileRoute,
  useMatch,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { z } from "zod";

import { isAssistantSidebarOpenAtom } from "@/atoms/workspace-settings";
import { AssistantChat } from "@/components/assistant/AssistantChat";
import { AssistantHeader } from "@/components/assistant/AssistantHeader";
import { AssistantSidebar } from "@/components/assistant/AssistantSidebar";
import { Surface } from "@/components/layout/Surface";
import { useAssistantPreferences } from "@/context/assistant-preferences.context";
import { useOrganization } from "@/context/organization.context";
import { useAssistantChat } from "@/hooks/use-assistant-chat";
import { useDocumentTitle } from "@/hooks/use-document-title";

const assistantSearchSchema = z.object({
  prompt: z.string().optional(),
});

export const Route = createFileRoute("/__auth/w/$organizationSlug/assistant")({
  component: AssistantLayout,
  ssr: false,
  validateSearch: assistantSearchSchema,
  loader: async ({ context, params }) => {
    const { zero, organization } = context;
    const chatRouteParams = params as { chatId?: string };
    const chatId = chatRouteParams.chatId;

    // Preload conversation data if chatId exists
    if (chatId) {
      const conversation = zero.run(
        queries.assistant.byId({
          organizationId: organization.id,
          conversationId: chatId,
        }),
      );
      return { conversation };
    }

    return { conversation: null };
  },
});

function AssistantLayout() {
  const { organization } = useOrganization();
  const { organizationSlug } = useParams({
    from: "/__auth/w/$organizationSlug",
  });
  const navigate = useNavigate();
  const search = useSearch({ from: "/__auth/w/$organizationSlug/assistant" });
  const initialPrompt = (search as { prompt?: string })?.prompt;

  const [sidebarOpen, setSidebarOpen] = useAtom(isAssistantSidebarOpenAtom);

  // Model preference (needed for useAssistantChat)
  const { selectedModelId } = useAssistantPreferences();

  const chatRouteMatch = useMatch({
    from: "/__auth/w/$organizationSlug/assistant/$chatId/",
    shouldThrow: false,
  });

  // Get chatId from child route params, or undefined if on index route
  const urlChatId = chatRouteMatch?.params?.chatId;
  const isNewConversation = !urlChatId;

  // Eagerly generate conversation ID if not in URL
  const conversationId = useMemo(() => {
    if (urlChatId) {
      return urlChatId;
    }
    return createId();
  }, [urlChatId]);

  // Query for existing conversation data
  const [existingConversation] = useQuery(
    urlChatId
      ? queries.assistant.byId({
          organizationId: organization.id,
          conversationId: urlChatId,
        })
      : null,
  );

  // Set document title based on conversation
  useDocumentTitle(existingConversation?.title ?? "Assistant");

  const { messages, sendMessage, stop, status, alert, setAlert, setMessages } = useAssistantChat({
    conversationId,
    modelId: selectedModelId,
    initialMessages:
      existingConversation?.messages?.map((msg: any) => ({
        id: msg.id,
        role: msg.role as "user" | "system" | "assistant",
        parts: msg.parts,
        metadata: msg.metadata,
      })) || [],
  });

  // Track the last conversation ID we synced from
  const lastSyncedIdRef = useRef<string | null>(null);

  // Sync server messages only when switching to a different conversation
  // Don't sync during streaming/submitted to avoid overwriting local state
  useEffect(() => {
    const conversationIdChanged = existingConversation?.id !== lastSyncedIdRef.current;
    const isStable = status === "ready" || status === "error";

    if (
      conversationIdChanged &&
      isStable &&
      existingConversation?.messages
    ) {
      const formattedMessages = existingConversation.messages.map((msg: any) => ({
        id: msg.id,
        role: msg.role as "user" | "system" | "assistant",
        parts: msg.parts,
        metadata: msg.metadata,
      }));
      setMessages(formattedMessages);
      lastSyncedIdRef.current = existingConversation.id;
    }
  }, [existingConversation?.id, existingConversation?.messages, status, setMessages]);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(!sidebarOpen);
  }, [setSidebarOpen, sidebarOpen]);

  const handleNavigateToChat = useCallback(() => {
    navigate({
      to: "/w/$organizationSlug/assistant/$chatId",
      params: { organizationSlug, chatId: conversationId },
    });
  }, [navigate, organizationSlug, conversationId]);

  return (
    <div className="h-screen py-1 pr-1 flex flex-col pl-1">
      <Surface className="overflow-hidden size-full flex flex-col">
        <AssistantHeader
          conversationTitle={existingConversation?.title ?? null}
          onToggleSidebar={toggleSidebar}
          sidebarOpen={sidebarOpen}
        />
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 flex flex-col h-full mx-auto w-full max-w-xl px-4">
            <AssistantChat
              organizationId={organization.id}
              initialPrompt={initialPrompt}
              showEmptyState={isNewConversation}
              messages={messages}
              sendMessage={sendMessage}
              stop={stop}
              status={status}
              alert={alert}
              setAlert={setAlert}
              isNewConversation={isNewConversation}
              onNavigateToChat={handleNavigateToChat}
            />
          </div>
          <AssistantSidebar isOpen={sidebarOpen} conversationId={conversationId} />
        </div>
      </Surface>
    </div>
  );
}
