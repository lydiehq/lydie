import { ChatRegular, ComposeRegular, SearchRegular } from "@fluentui/react-icons";

import { FeatureSpotAI } from "@/components/sections";

import { Button } from "../generic/Button";
import { GradientOutline } from "../generic/GradientOutline";
import { FeatureBadge } from "./FeatureIcon";
import { LandingSection } from "./LandingSection";

const keyBenefits = [
  {
    title: "Chat with your documents",
    description:
      "Ask questions and get instant, contextual answers from your entire knowledge base.",
    icon: ChatRegular,
    href: "/features/assistant/chat-with-documents",
  },
  {
    title: "Research and synthesize",
    description:
      "Search across documents, find connections, and synthesize ideas from multiple sources.",
    icon: SearchRegular,
    href: "/features/assistant/research-assistant",
  },
  {
    title: "Write and edit",
    description:
      "Generate documents, expand ideas into drafts, and edit content with AI assistance.",
    icon: ComposeRegular,
    href: "/features/assistant/writing-assistant",
  },
];

export function MultiDocumentChatSection() {
  return (
    <div className="flex flex-col gap-y-24">
      <LandingSection
        featureBadge={{
          icon: "assistant",
          color: "purple",
          text: "AI Assistant",
        }}
        title="Meet your new knowledge partner"
        description="Chat with your documents, research across your workspace, and create new content. Your AI assistant reads, analyzes, and writes to help you turn scattered notes into structured knowledge."
        illustration={<FeatureSpotAI />}
        primaryButton={{
          href: "https://app.lydie.co/auth",
          label: "Get started",
          showArrow: true,
        }}
        secondaryButton={{
          href: "/features/assistant",
          label: "Learn more",
        }}
        reverse={true}
      />
      <div className="grid md:grid-cols-3 grid-cols-1 gap-6 relative p-2">
        <GradientOutline />
        {keyBenefits.map((benefit, index) => (
          <a
            key={index}
            href={benefit.href}
            className="flex flex-col gap-y-2 group p-4 -m-4 rounded-lg transition-colors hover:bg-gray-50"
          >
            <div className="flex items-center gap-x-2">
              <benefit.icon className="size-4 text-gray-700" />
              <span className="font-medium text-[15px]/0 text-gray-900">{benefit.title}</span>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed group-hover:text-gray-700">
              {benefit.description}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}
