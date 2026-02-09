import {
  DocumentCopyFilled,
  EditRegular,
  LayoutColumnTwoFocusRight16Filled as ExpandUpRight16Filled,
  PersonChatFilled,
  PictureInPictureEnterRegular,
  QuestionCircleRegular,
  Subtract12Regular as SubtractFilled,
  TextBulletListSquareEditRegular,
} from "@fluentui/react-icons";
import { createId } from "@lydie/core/id";
import { Button } from "@lydie/ui/components/generic/Button";
import { Tooltip } from "@lydie/ui/components/generic/Tooltip";
import { DocumentIcon } from "@lydie/ui/components/icons/DocumentIcon";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useAtomValue, useSetAtom } from "jotai";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { memo, useCallback, useMemo, useState } from "react";
import { Button as RACButton, TooltipTrigger } from "react-aria-components";
import { createPortal } from "react-dom";

import { AssistantInput } from "@/components/assistant/AssistantInput";
import { ConversationDropdown } from "@/components/assistant/ConversationDropdown";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { useAssistantPreferences } from "@/context/assistant-preferences.context";
import { useOrganization } from "@/context/organization.context";
import { useAssistantChat } from "@/hooks/use-assistant-chat";
import {
  clearPendingMessageAtom,
  pendingMessageAtom,
  useFloatingAssistant,
} from "@/hooks/use-floating-assistant";

const LAYOUT_ID = {
  container: "assistant-container",
  icon: "assistant-icon",
  content: "assistant-content",
} as const;

export function FloatingAssistant({
  currentDocumentId,
  dockedContainer,
  floatingContainer,
}: {
  currentDocumentId: string | null;
  dockedContainer: HTMLDivElement | null;
  floatingContainer: HTMLDivElement | null;
}) {
  const { organization } = useOrganization();
  const assistant = useFloatingAssistant();
  const { selectedModelId } = useAssistantPreferences();

  // Local conversation state - changing this creates a fresh useChat instance
  const [conversationId, setConversationId] = useState(() => createId());

  // Query for existing conversation (only used for initial messages)
  const [existingConversation] = useQuery(
    conversationId
      ? queries.assistant.byId({
          organizationId: organization.id,
          conversationId,
        })
      : null,
  );

  // Prepare initial messages from server (only used on first render of this conversation)
  const initialMessages = useMemo(() => {
    if (!existingConversation?.messages) return [];
    return existingConversation.messages.map((msg: any) => ({
      id: msg.id,
      role: msg.role as "user" | "system" | "assistant",
      parts: msg.parts,
      metadata: msg.metadata,
    }));
  }, [existingConversation?.messages]);

  // useChat instance - automatically resets when conversationId changes
  const { messages, sendMessage, stop, status } = useAssistantChat({
    conversationId,
    modelId: selectedModelId,
    initialMessages,
  });

  // Start a new chat - creates fresh conversationId which resets useChat
  const handleNewChat = useCallback(() => {
    setConversationId(createId());
  }, []);

  // Switch to existing conversation - loads messages via initialMessages
  const handleSelectConversation = useCallback((id: string) => {
    setConversationId(id);
  }, []);

  const isExpanded = !assistant.isMinimized;

  return (
    <MotionConfig transition={{ type: "spring", bounce: 0, duration: 0.4 }}>
      <AnimatePresence initial={false} mode="popLayout" propagate>
        {!isExpanded && (
          <motion.button
            key="minimized"
            onClick={assistant.open}
            layoutId={LAYOUT_ID.container}
            className="fixed right-4 bottom-4 z-30 rounded-2xl bg-white shadow-popover size-10 flex items-center justify-center hover:bg-gray-50"
            aria-label="Open AI Assistant"
            role="region"
          >
            <motion.div layoutId={LAYOUT_ID.icon}>
              <PersonChatFilled className="size-4.5 icon-muted" aria-hidden="true" />
            </motion.div>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false} mode="popLayout" propagate>
        {isExpanded && (
          <AssistantPopup
            assistant={assistant}
            dockedContainer={dockedContainer}
            floatingContainer={floatingContainer}
            organizationId={organization.id}
            currentDocumentId={currentDocumentId}
            conversationId={conversationId}
            messages={messages}
            sendMessage={sendMessage}
            stop={stop}
            status={status}
            onNewChat={handleNewChat}
            onSelectConversation={handleSelectConversation}
          />
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}

function AssistantPopup({
  assistant,
  dockedContainer,
  floatingContainer,
  organizationId,
  currentDocumentId,
  conversationId,
  messages,
  sendMessage,
  stop,
  status,
  onNewChat,
  onSelectConversation,
}: {
  assistant: ReturnType<typeof useFloatingAssistant>;
  dockedContainer: HTMLDivElement | null;
  floatingContainer: HTMLDivElement | null;
  organizationId: string;
  currentDocumentId: string | null;
  conversationId: string;
  messages: any[];
  sendMessage: (options: { text: string; metadata?: any; agentId?: string | null }) => void;
  stop: () => void;
  status: string;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
}) {
  const headerButtons = useMemo(() => {
    return [
      {
        onPress: onNewChat,
        ariaLabel: "New chat",
        tooltip: "New chat",
        icon: TextBulletListSquareEditRegular,
      },
      {
        onPress: assistant.isDocked ? assistant.undock : assistant.dock,
        ariaLabel: assistant.isDocked ? "Undock assistant" : "Dock assistant",
        tooltip: assistant.isDocked ? "Undock assistant" : "Dock assistant",
        icon: assistant.isDocked ? PictureInPictureEnterRegular : ExpandUpRight16Filled,
      },
      {
        onPress: assistant.close,
        ariaLabel: "Close assistant",
        tooltip: "Close assistant",
        icon: SubtractFilled,
      },
    ];
  }, [assistant, onNewChat]);

  const targetContainer = assistant.isDocked ? dockedContainer : floatingContainer;

  const popup = (
    <motion.div
      layoutId={LAYOUT_ID.container}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="region"
      aria-label="AI Assistant"
      className={
        assistant.isDocked
          ? "w-full h-full bg-white ring ring-black/6 rounded-lg flex flex-col overflow-hidden"
          : "fixed right-4 bottom-4 w-[400px] h-[540px] rounded-3xl shadow-popover flex flex-col overflow-hidden z-30 bg-white"
      }
    >
      <div className="flex items-center justify-between p-1.5 bg-white">
        <div className="flex items-center gap-x-2">
          <ConversationDropdown
            conversationId={conversationId}
            onSelectConversation={onSelectConversation}
          />
        </div>
        <div className="flex items-center gap-x-0.5">
          {headerButtons.map((button, index) => {
            const Icon = button.icon;
            const isCloseButton = index === headerButtons.length - 1;
            return (
              <TooltipTrigger key={button.ariaLabel} delay={500}>
                <Button
                  onPress={button.onPress}
                  size="icon-sm"
                  intent="ghost"
                  aria-label={button.ariaLabel}
                >
                  {isCloseButton ? (
                    <motion.div layoutId={LAYOUT_ID.icon}>
                      <Icon className="size-4 icon-muted" aria-hidden="true" />
                    </motion.div>
                  ) : (
                    <Icon className="size-4 icon-muted" aria-hidden="true" />
                  )}
                </Button>
                <Tooltip placement="top">{button.tooltip}</Tooltip>
              </TooltipTrigger>
            );
          })}
        </div>
      </div>
      <motion.div
        layoutId={LAYOUT_ID.content}
        className="flex-1 min-h-0 bg-white"
        initial={{ opacity: 0, filter: "blur(4px)" }}
        animate={{ opacity: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, filter: "blur(4px)" }}
      >
        <FloatingAssistantChatContent
          organizationId={organizationId}
          currentDocumentId={currentDocumentId}
          messages={messages}
          sendMessage={sendMessage}
          stop={stop}
          status={status}
        />
      </motion.div>
    </motion.div>
  );

  if (!targetContainer) return null;
  return createPortal(popup, targetContainer);
}

const FloatingAssistantChatContent = memo(function FloatingAssistantChatContent({
  organizationId,
  currentDocumentId,
  messages,
  sendMessage,
  stop,
  status,
}: {
  organizationId: string;
  currentDocumentId: string | null;
  messages: any[];
  sendMessage: (options: { text: string; metadata?: any; agentId?: string | null }) => void;
  stop: () => void;
  status: string;
}) {
  const { selectedAgentId } = useAssistantPreferences();
  const pendingMessage = useAtomValue(pendingMessageAtom);
  const clearPendingMessage = useSetAtom(clearPendingMessageAtom);
  const [pendingContent, setPendingContent] = useState<string | undefined>(undefined);

  // Handle pending message from other components
  if (pendingMessage && pendingContent !== pendingMessage) {
    setPendingContent(pendingMessage);
    clearPendingMessage();
  }

  const handleSubmit = useCallback(
    (text: string, contextDocumentIds: string[]) => {
      const contextDocuments = contextDocumentIds.map((id) => ({
        id,
        current: id === currentDocumentId,
      }));

      sendMessage({
        text,
        metadata: {
          createdAt: new Date().toISOString(),
          contextDocuments,
        },
        agentId: selectedAgentId,
      });
      setPendingContent(undefined);
    },
    [sendMessage, currentDocumentId, selectedAgentId],
  );

  const canStop = status === "submitted" || status === "streaming";

  const suggestions = useMemo(() => {
    if (currentDocumentId) {
      return [
        { text: "Summarize this document", icon: DocumentIcon },
        { text: "Help me write a draft", icon: EditRegular },
        { text: "Explain this in simpler terms", icon: QuestionCircleRegular },
      ];
    }
    return [
      { text: "Summarize my 3 last documents", icon: DocumentCopyFilled },
      { text: "Help me write a draft", icon: EditRegular },
      { text: "What can you help me with?", icon: QuestionCircleRegular },
    ];
  }, [currentDocumentId]);

  const handleSuggestionClick = useCallback(
    (suggestionText: string) => {
      const contextDocuments = currentDocumentId
        ? [{ id: currentDocumentId, title: "", current: true }]
        : [];

      sendMessage({
        text: suggestionText,
        metadata: {
          createdAt: new Date().toISOString(),
          contextDocuments,
        },
        agentId: selectedAgentId,
      });
    },
    [sendMessage, currentDocumentId, selectedAgentId],
  );

  const isChatEmpty = messages.length === 0;

  console.log(messages);

  return (
    <div className="flex flex-col overflow-hidden grow h-full">
      <ChatMessages
        messages={messages}
        status={status as "submitted" | "streaming" | "ready" | "error"}
        organizationId={organizationId}
      />
      <div className="p-1.5 relative">
        {isChatEmpty && (
          <div className="flex flex-col gap-y-1 pb-3">
            {suggestions.map((suggestion, index) => {
              const Icon = suggestion.icon;
              return (
                <>
                  <RACButton
                    key={suggestion.text}
                    onPress={() => handleSuggestionClick(suggestion.text)}
                    className="flex items-center gap-x-2 p-1.5 bg-white rounded-lg hover:bg-gray-50 transition-colors duration-75 group"
                  >
                    <Icon className="size-4 icon-muted" aria-hidden="true" />
                    <span className="text-gray-500 text-xs">{suggestion.text}</span>
                  </RACButton>
                  {index < suggestions.length - 1 && <div className="h-px bg-black/6 ml-8" />}
                </>
              );
            })}
          </div>
        )}
        <AssistantInput
          onSubmit={handleSubmit}
          onStop={stop}
          canStop={canStop}
          currentDocumentId={currentDocumentId}
          editorClassName="min-h-[80px] max-h-[200px]"
          content={pendingContent}
        />
      </div>
    </div>
  );
});
