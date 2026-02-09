import { ChevronRightRegular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";

import type { Message } from "./demo/AssistantDemo";

import { Button } from "../generic/Button";
import { CastShadow } from "../generic/CastShadow";
import { GradientOutline } from "../generic/GradientOutline";
import { AssistantDemo } from "./demo/AssistantDemo";

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
    const lastMessage = ANIMATION_SEQUENCE[ANIMATION_SEQUENCE.length - 1];
    const completeTimeout = setTimeout(
      () => {
        setIsPlaying(false);
      },
      (lastMessage?.delay ?? 0) + 1000,
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

    const lastMessage = ANIMATION_SEQUENCE[ANIMATION_SEQUENCE.length - 1];
    setTimeout(
      () => {
        setIsPlaying(false);
      },
      (lastMessage?.delay ?? 0) + 1000,
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
          <div className="h-[520px] rounded-xl shadow-legit overflow-hidden">
            <AssistantDemo
              messages={ANIMATION_SEQUENCE}
              visibleMessageIds={visibleMessages}
              onReplay={replay}
              isPlaying={isPlaying}
            />
          </div>
        </CastShadow>
      </div>
    </div>
  );
}
