import {
  DocumentCopyFilled,
  DocumentFilled,
  EditRegular,
  ExpandUpRight16Filled,
  PersonChatFilled,
  PictureInPictureEnterRegular,
  QuestionCircleRegular,
  SubtractFilled,
  TextBulletListSquareEditRegular,
} from "@fluentui/react-icons";
import { createId } from "@lydie/core/id";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useAtomValue, useSetAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Button as RACButton, TooltipTrigger } from "react-aria-components";
import { createPortal } from "react-dom";

const MotionButton = motion(RACButton);

import { AssistantInput } from "@/components/assistant/AssistantInput";
import { ConversationDropdown } from "@/components/assistant/ConversationDropdown";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { Button } from "@/components/generic/Button";
import { Tooltip } from "@/components/generic/Tooltip";
import { useOrganization } from "@/context/organization.context";
import { useAssistantChat } from "@/hooks/use-assistant-chat";
import {
  clearPendingMessageAtom,
  pendingMessageAtom,
  useFloatingAssistant,
} from "@/hooks/use-floating-assistant";

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

  // Local conversation state
  const [conversationId, setConversationId] = useState(() => createId());
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const [currentConversation] = useQuery(
    conversationId
      ? queries.assistant.byId({
          organizationId: organization.id,
          conversationId,
        })
      : null,
  );

  const { messages, sendMessage, stop, status, setMessages } = useAssistantChat({
    conversationId,
    initialMessages:
      currentConversation?.messages?.map((msg: any) => ({
        id: msg.id,
        role: msg.role as "user" | "system" | "assistant",
        parts: msg.parts,
        metadata: msg.metadata,
      })) || [],
  });

  useEffect(() => {
    if (currentConversation?.messages) {
      setMessages(
        currentConversation.messages.map((msg: any) => ({
          id: msg.id,
          role: msg.role as "user" | "system" | "assistant",
          parts: msg.parts,
          metadata: msg.metadata,
        })),
      );
    } else if (currentConversation === null && conversationId) {
      setMessages([]);
    }
  }, [
    currentConversation?.id,
    conversationId,
    setMessages,
    currentConversation?.messages,
    currentConversation,
  ]);

  const handleSelectAgent = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
  }, []);

  const handleNewChat = useCallback(() => {
    const newId = createId();
    setConversationId(newId);
    setMessages([]);
  }, [setMessages]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      setConversationId(id);
      setMessages([]);
    },
    [setMessages],
  );

  const headerButtons = useMemo(() => {
    return [
      {
        onPress: handleNewChat,
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
  }, [assistant, handleNewChat]);

  const targetContainer = assistant.isMinimized
    ? null
    : assistant.isDocked
      ? dockedContainer
      : floatingContainer;

  const content = (
    <motion.div
      layoutId="assistant"
      initial={false}
      transition={{ type: "spring", stiffness: 400, damping: 35, mass: 1 }}
      role="region"
      aria-label="AI Assistant"
      aria-labelledby="assistant-title"
      className={
        assistant.isMinimized
          ? "fixed right-4 bottom-4 z-30 bg-white shadow-popover rounded-full size-10"
          : assistant.isDocked
            ? "w-full h-full bg-white ring ring-black/6 rounded-lg flex flex-col overflow-hidden"
            : "fixed right-4 bottom-4 w-[400px] h-[540px] rounded-xl shadow-popover flex flex-col overflow-hidden z-30"
      }
    >
      <AnimatePresence initial={false}>
        {assistant.isMinimized ? (
          <motion.div
            key="minimized"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15, delay: 2 }}
            className="flex justify-center items-center size-full"
          >
            <MotionButton
              layout
              onPress={assistant.toggle}
              aria-label="Open AI Assistant"
              className="size-full justify-center items-center flex hover:bg-gray-50 transition-colors rounded-full group"
              style={{ borderRadius: 9999 }}
            >
              <motion.div layout>
                <PersonChatFilled className="size-4.5 icon-muted" aria-hidden="true" />
              </motion.div>
            </MotionButton>
          </motion.div>
        ) : (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, filter: "blur(4px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(4px)" }}
            transition={{ duration: 0.2 }}
            className="flex flex-col h-full"
          >
            <div className="flex items-center justify-between p-1.5 border-b border-black/8 bg-white/95 backdrop-blur-md">
              <div className="flex items-center gap-x-2">
                <ConversationDropdown
                  conversationId={conversationId}
                  onSelectConversation={handleSelectConversation}
                />
              </div>
              <div className="flex items-center gap-x-0.5">
                {headerButtons.map((button) => {
                  const Icon = button.icon;
                  return (
                    <TooltipTrigger key={button.ariaLabel} delay={500}>
                      <Button
                        onPress={button.onPress}
                        size="icon-sm"
                        intent="ghost"
                        aria-label={button.ariaLabel}
                      >
                        <Icon className="size-4 icon-muted" aria-hidden="true" />
                      </Button>
                      <Tooltip placement="top">{button.tooltip}</Tooltip>
                    </TooltipTrigger>
                  );
                })}
              </div>
            </div>
            <div className="flex-1 min-h-0 bg-white">
              <FloatingAssistantChatContent
                organizationId={organization.id}
                currentDocumentId={currentDocumentId}
                messages={messages}
                sendMessage={sendMessage}
                stop={stop}
                status={status}
                selectedAgentId={selectedAgentId}
                onSelectAgent={handleSelectAgent}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  if (assistant.isMinimized) return content;
  if (!targetContainer) return null;
  return createPortal(content, targetContainer);
}

const FloatingAssistantChatContent = memo(function FloatingAssistantChatContent({
  organizationId,
  currentDocumentId,
  messages,
  sendMessage,
  stop,
  status,
  selectedAgentId,
  onSelectAgent,
}: {
  organizationId: string;
  currentDocumentId: string | null;
  messages: any[];
  sendMessage: (options: { text: string; metadata?: any; agentId?: string | null }) => void;
  stop: () => void;
  status: string;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
}) {
  const pendingMessage = useAtomValue(pendingMessageAtom);
  const clearPendingMessage = useSetAtom(clearPendingMessageAtom);
  const [pendingContent, setPendingContent] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (pendingMessage) {
      setPendingContent(pendingMessage);
      clearPendingMessage();
    }
  }, [pendingMessage, clearPendingMessage]);

  const handleSubmit = useCallback(
    (text: string, contextDocumentIds: string[]) => {
      // Build contextDocuments array with current flag
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
        {
          text: "Summarize this document",
          icon: DocumentFilled,
        },
        {
          text: "Help me write a draft",
          icon: EditRegular,
        },
        {
          text: "Explain this in simpler terms",
          icon: QuestionCircleRegular,
        },
      ];
    } else {
      return [
        {
          text: "Summarize my 3 last documents",
          icon: DocumentCopyFilled,
        },
        {
          text: "Help me write a draft",
          icon: EditRegular,
        },
        {
          text: "What can you help me with?",
          icon: QuestionCircleRegular,
        },
      ];
    }
  }, [currentDocumentId]);

  const handleSuggestionClick = useCallback(
    (suggestionText: string) => {
      // Build contextDocuments array with current flag
      const contextDocuments = currentDocumentId
        ? [
            {
              id: currentDocumentId,
              title: "", // Will be fetched from database on backend
              current: true,
            },
          ]
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
          placeholder="Ask anything. Use @ to refer to documents"
          canStop={canStop}
          currentDocumentId={currentDocumentId}
          variant="flat"
          editorClassName="focus:outline-none min-h-[80px] max-h-[200px] overflow-y-auto text-sm text-gray-700"
          content={pendingContent}
          selectedAgentId={selectedAgentId}
          onSelectAgent={onSelectAgent}
        />
      </div>
    </div>
  );
});
