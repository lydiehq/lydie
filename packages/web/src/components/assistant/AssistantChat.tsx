import { motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";

import type { ChatAlertState } from "@/components/editor/ChatAlert";

import { AssistantInput } from "@/components/assistant/AssistantInput";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { ChatAlert } from "@/components/editor/ChatAlert";

interface AssistantChatProps {
  organizationId: string;
  initialPrompt?: string;
  onPromptUsed?: () => void;
  showEmptyState?: boolean;
  messages: any[];
  sendMessage: (options: { text: string; metadata?: any }) => void;
  stop: () => void;
  status: string;
  alert: ChatAlertState | null;
  setAlert: (alert: ChatAlertState | null) => void;
  isNewConversation?: boolean;
  conversationTitle?: string | null;
  onNavigateToChat?: () => void;
}

export function AssistantChat({
  organizationId,
  initialPrompt,
  onPromptUsed,
  showEmptyState = true,
  messages,
  sendMessage,
  stop,
  status,
  alert,
  setAlert,
  isNewConversation = false,
  conversationTitle,
  onNavigateToChat,
}: AssistantChatProps) {
  const [currentInitialPrompt, setCurrentInitialPrompt] = useState<string | undefined>(
    initialPrompt,
  );
  const [hasNavigated, setHasNavigated] = useState(false);

  useEffect(() => {
    if (currentInitialPrompt && initialPrompt !== currentInitialPrompt) {
      setCurrentInitialPrompt(initialPrompt);
    }
  }, [initialPrompt, currentInitialPrompt]);

  const handleSubmit = useCallback(
    async (text: string, contextDocumentIds: string[]) => {
      // Build contextDocuments array with metadata
      const contextDocuments = contextDocumentIds.map((id) => ({
        id,
        title: "", // Will be fetched from database on backend
        current: false, // No current document in assistant-only context
      }));

      // For new conversations, navigate first before sending
      // This updates the URL while keeping the component mounted
      if (isNewConversation && !hasNavigated && onNavigateToChat) {
        setHasNavigated(true);
        onNavigateToChat();
      }

      sendMessage({
        text,
        metadata: {
          createdAt: new Date().toISOString(),
          contextDocuments,
        },
      });

      if (currentInitialPrompt) {
        setCurrentInitialPrompt(undefined);
        onPromptUsed?.();
      }
    },
    [sendMessage, currentInitialPrompt, onPromptUsed, isNewConversation, hasNavigated, onNavigateToChat],
  );

  const canStop = status === "submitted" || status === "streaming";
  const isChatEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col flex-1 min-h-0 relative">
        {isChatEmpty && showEmptyState ? (
          <motion.div 
            className="absolute inset-0 flex flex-col items-center justify-center px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div 
              className="flex flex-col gap-y-4 items-center w-full max-w-xl"
              layoutId="assistant-input-container"
            >
              <h1 className="text-2xl font-medium text-gray-900">
                {conversationTitle || "Ask anything"}
              </h1>
              <AssistantInput
                onSubmit={handleSubmit}
                onStop={stop}
                placeholder="Ask anything. Use @ to refer to documents"
                initialPrompt={currentInitialPrompt}
              />
            </motion.div>
          </motion.div>
        ) : (
          <>
            <ChatMessages
              messages={messages}
              status={status as "submitted" | "streaming" | "ready" | "error"}
              organizationId={organizationId}
            />
            <motion.div 
              className="p-3 relative shrink-0"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <div className="top-0 absolute inset-x-0 h-6 bg-linear-to-t from-gray-50 via-gray-50" />
              <div className="z-10 relative">
                <ChatAlert
                  alert={alert}
                  onDismiss={() => setAlert(alert ? { ...alert, show: false } : null)}
                />
                <motion.div layoutId="assistant-input-container">
                  <AssistantInput
                    onSubmit={handleSubmit}
                    onStop={stop}
                    placeholder="Ask anything. Use @ to refer to documents"
                    canStop={canStop}
                    initialPrompt={currentInitialPrompt}
                  />
                </motion.div>
              </div>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
