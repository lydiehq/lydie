import { AnimatePresence, motion } from "motion/react";
import { StickToBottom } from "use-stick-to-bottom";
import type { UIMessage } from "ai";
import { Message } from "./Message";

export type MessageWithMetadata = UIMessage<Record<string, any>>;

export interface MessagesProps {
  messages: MessageWithMetadata[];
  status: "submitted" | "streaming" | "ready" | "error";
  renderMessage?: (
    message: MessageWithMetadata,
    index: number
  ) => React.ReactNode;
  className?: string;
}

export function Messages({
  messages,
  status,
  renderMessage,
  className = "",
}: MessagesProps) {
  const isSubmitting =
    status === "submitted" &&
    messages.length > 0 &&
    messages[messages.length - 1].role === "user";

  return (
    <StickToBottom
      className={`flex-1 overflow-y-auto scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar scrollbar-thumb-gray-300 scrollbar-track-gray-50 ${className}`}
      resize="smooth"
      initial="instant"
    >
      <StickToBottom.Content className="flex flex-col gap-y-2 pb-4 px-2">
        <AnimatePresence initial={false}>
          {messages.map((message, index) => (
            <div key={message.id}>
              {renderMessage ? (
                renderMessage(message, index)
              ) : (
                <Message
                  message={message}
                  status={status}
                  isLastMessage={index === messages.length - 1}
                />
              )}
            </div>
          ))}
        </AnimatePresence>
        {isSubmitting && <ThinkingIndicator />}
      </StickToBottom.Content>
    </StickToBottom>
  );
}

function ThinkingIndicator() {
  return (
    <motion.div
      className="flex justify-start"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <div className="flex items-center gap-2 text-gray-500">
        <div className="flex gap-x-0.5">
          <div
            className="size-[3px] bg-gray-400 rounded-full animate-float-up-down"
            style={{ animationDelay: "0ms" }}
          />
          <div
            className="size-[3px] bg-gray-400 rounded-full animate-float-up-down"
            style={{ animationDelay: "150ms" }}
          />
          <div
            className="size-[3px] bg-gray-400 rounded-full animate-float-up-down"
            style={{ animationDelay: "300ms" }}
          />
        </div>
      </div>
    </motion.div>
  );
}
