import { AnimatePresence, motion } from "motion/react";

interface Message {
  id: string;
  type: "user" | "assistant" | "thinking" | "tool-call" | "tool-result";
  content: string;
  toolName?: string;
  status?: "pending" | "complete";
  delay?: number;
}

interface AssistantDemoProps {
  messages: Message[];
  visibleMessageIds?: string[];
  showHeader?: boolean;
  showInput?: boolean;
  className?: string;
  headerClassName?: string;
  messagesClassName?: string;
  inputClassName?: string;
  inputPlaceholder?: string;
  onReplay?: () => void;
  isPlaying?: boolean;
}

export function AssistantDemo({
  messages,
  visibleMessageIds,
  showHeader = true,
  showInput = true,
  className = "",
  headerClassName = "",
  messagesClassName = "",
  inputClassName = "",
  inputPlaceholder = "Ask Lydie anything",
  onReplay,
  isPlaying = false,
}: AssistantDemoProps) {
  const visibleMessages = visibleMessageIds
    ? messages.filter((msg) => visibleMessageIds.includes(msg.id))
    : messages;

  return (
    <div className={`flex flex-col h-full bg-white overflow-hidden ${className}`}>
      {showHeader && (
        <div
          className={`flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50/50 ${headerClassName}`}
        >
          <div className="flex items-center gap-2">
            <div className="rounded-full size-7 flex items-center justify-center bg-purple-100 text-purple-600">
              <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-900">AI Assistant</span>
          </div>
        </div>
      )}

      <div className={`flex-1 overflow-y-auto px-4 py-4 space-y-3 ${messagesClassName}`}>
        <AnimatePresence mode="popLayout">
          {visibleMessages.map((message) => (
            <MessageComponent key={message.id} message={message} />
          ))}
        </AnimatePresence>
      </div>

      {showInput && (
        <div className={`border-t border-gray-200 p-3 bg-gray-50/50 ${inputClassName}`}>
          <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2.5 ring-1 ring-black/5">
            <input
              type="text"
              placeholder={inputPlaceholder}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400 text-gray-900"
              readOnly
            />
            <button className="p-1 rounded hover:bg-gray-100 text-gray-500 transition-colors">
              <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </div>

          {onReplay && (
            <div className="flex items-center justify-center mt-3 gap-2">
              <button
                onClick={onReplay}
                disabled={isPlaying}
                className="text-xs text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Replay animation
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MessageComponent({ message }: { message: Message }) {
  if (message.type === "user") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="flex justify-end"
      >
        <div className="max-w-[85%] bg-gray-100 rounded-2xl rounded-tr-md px-4 py-3 text-sm text-gray-900 leading-relaxed">
          {message.content}
        </div>
      </motion.div>
    );
  }

  if (message.type === "assistant") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="flex justify-start"
      >
        <div className="max-w-[85%] bg-gray-50 rounded-2xl rounded-tl-md px-4 py-3 text-sm text-gray-700 leading-relaxed">
          {message.content}
        </div>
      </motion.div>
    );
  }

  if (message.type === "thinking") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="flex justify-start"
      >
        <div className="px-3 py-1.5 text-xs text-gray-400 font-medium">{message.content}</div>
      </motion.div>
    );
  }

  if (message.type === "tool-call") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="flex justify-start"
      >
        <div className="max-w-[85%] bg-gray-50 rounded-lg px-3 py-2.5 flex items-center gap-3 border border-gray-200">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-xs font-medium text-gray-500 shrink-0">{message.toolName}</span>
            <span className="text-sm text-gray-700 truncate">{message.content}</span>
          </div>
          {message.status === "complete" && (
            <motion.svg
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="size-4 shrink-0 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M5 13l4 4L19 7"
              />
            </motion.svg>
          )}
        </div>
      </motion.div>
    );
  }

  return null;
}

export type { Message, AssistantDemoProps };
export { MessageComponent };
