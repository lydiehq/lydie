import { ChevronRightRegular } from "@fluentui/react-icons";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import { Button } from "../generic/Button";
import { CastShadow } from "../generic/CastShadow";
import { GradientOutline } from "../generic/GradientOutline";

type MessageType = "user" | "assistant" | "thinking" | "tool-call" | "tool-result";

interface Message {
  id: string;
  type: MessageType;
  content: string;
  toolName?: string;
  status?: "pending" | "complete";
  delay?: number;
}

const ANIMATION_SEQUENCE: Message[] = [
  {
    id: "user-1",
    type: "user",
    content:
      "Read our Q4 Product Roadmap, 2024 Market Analysis, and Customer Insights Report, then create a comprehensive Executive Summary document",
    delay: 0,
  },
  {
    id: "assistant-1",
    type: "assistant",
    content:
      "I'll read those three documents to understand the key insights, then compile them into a comprehensive executive summary for you.",
    delay: 800,
  },
  {
    id: "thinking-1",
    type: "thinking",
    content: "Thought 3s",
    delay: 1600,
  },
  {
    id: "tool-1",
    type: "tool-call",
    content: "Q4 Product Roadmap.md",
    toolName: "Read",
    status: "complete",
    delay: 2400,
  },
  {
    id: "tool-2",
    type: "tool-call",
    content: "2024 Market Analysis.md",
    toolName: "Read",
    status: "complete",
    delay: 3000,
  },
  {
    id: "tool-3",
    type: "tool-call",
    content: "Customer Insights Report.md",
    toolName: "Read",
    status: "complete",
    delay: 3600,
  },
  {
    id: "assistant-2",
    type: "assistant",
    content:
      "I've analyzed all three documents. Now I'll create a new Executive Summary document that synthesizes the key findings from the product roadmap, market trends, and customer feedback.",
    delay: 4400,
  },
  {
    id: "tool-4",
    type: "tool-call",
    content: "Executive Summary Q4.md",
    toolName: "Create",
    status: "complete",
    delay: 5200,
  },
  {
    id: "assistant-3",
    type: "assistant",
    content:
      "I've created a comprehensive Executive Summary that highlights the strategic priorities from the roadmap, key market opportunities, and critical customer needs. The document is ready for review.",
    delay: 6000,
  },
];

export function MultiDocumentChatSection() {
  const [visibleMessages, setVisibleMessages] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    // Reset and start animation when component mounts or when user clicks replay
    const timeouts: NodeJS.Timeout[] = [];

    setVisibleMessages([]);
    setIsPlaying(true);

    ANIMATION_SEQUENCE.forEach((message) => {
      const timeout = setTimeout(() => {
        setVisibleMessages((prev) => [...prev, message.id]);
      }, message.delay);
      timeouts.push(timeout);
    });

    // Mark as complete after all messages
    const completeTimeout = setTimeout(
      () => {
        setIsPlaying(false);
      },
      ANIMATION_SEQUENCE[ANIMATION_SEQUENCE.length - 1].delay + 1000,
    );
    timeouts.push(completeTimeout);

    return () => {
      timeouts.forEach((t) => clearTimeout(t));
    };
  }, []);

  const replay = () => {
    setVisibleMessages([]);
    setIsPlaying(true);

    const timeouts: NodeJS.Timeout[] = [];

    ANIMATION_SEQUENCE.forEach((message) => {
      const timeout = setTimeout(() => {
        setVisibleMessages((prev) => [...prev, message.id]);
      }, message.delay);
      timeouts.push(timeout);
    });

    setTimeout(
      () => {
        setIsPlaying(false);
      },
      ANIMATION_SEQUENCE[ANIMATION_SEQUENCE.length - 1].delay + 1000,
    );
  };

  return (
    <div className="relative max-w-4xl mx-auto">
      <GradientOutline />
      <div className="grid grid-cols-2 z-0 gap-8">
        <div className="flex flex-col gap-y-4 col-span-1 justify-center max-w-sm pl-4">
          <h2 className="text-3xl tracking-tight font-medium text-black/85">
            Work across your entire workspace
          </h2>
          <p className="text-base/relaxed text-black/60 text-balance">
            Your AI assistant can read, analyze, and synthesize information from multiple documents
            to help you create comprehensive reports and summaries in seconds.
          </p>
          <div className="flex items-center gap-3 mt-4">
            <Button href="https://app.lydie.co/auth" size="md" intent="primary">
              <span>Get started</span>
              <ChevronRightRegular className="size-3.5 translate-y-px group-hover:translate-x-0.5 transition-transform duration-200" />
            </Button>
            <Button href="/features/ai-assistant" size="md">
              Learn more
            </Button>
          </div>
        </div>
        <CastShadow className="w-full" strength={0.2}>
          <div className="flex flex-col h-[520px] rounded-xl shadow-legit bg-white overflow-hidden relative">
            {/* Chat header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50/50">
              <div className="flex items-center gap-2">
                <div className="rounded-full size-7 flex items-center justify-center bg-purple-100 text-purple-600">
                  <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-gray-900">AI Assistant</span>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              <AnimatePresence mode="popLayout">
                {ANIMATION_SEQUENCE.filter((msg) => visibleMessages.includes(msg.id)).map(
                  (message) => (
                    <MessageComponent key={message.id} message={message} />
                  ),
                )}
              </AnimatePresence>
            </div>

            {/* Input area */}
            <div className="border-t border-gray-200 p-3 bg-gray-50/50">
              <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2.5 ring-1 ring-black/5">
                <input
                  type="text"
                  placeholder="Ask Lydie anything"
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

              <div className="flex items-center justify-center mt-3 gap-2">
                <button
                  onClick={replay}
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
            </div>
          </div>
        </CastShadow>
      </div>
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
