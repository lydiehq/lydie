import { ChatRegular, ComposeRegular, SearchRegular } from "@fluentui/react-icons";

import { Button } from "../generic/Button";
import { FeatureSpotAI } from "@/components/sections";
import { FeatureBadge } from "./FeatureIcon";
import { LandingSection } from "./LandingSection";

const keyBenefits = [
  {
    title: "Chat with your documents",
    description:
      "Ask questions about your content and get instant, contextual answers from your entire knowledge base.",
    icon: ChatRegular,
  },
  {
    title: "Research and synthesize",
    description:
      "Search across all documents, find connections between ideas, and synthesize information from multiple sources.",
    icon: SearchRegular,
  },
  {
    title: "Write and edit",
    description:
      "Generate new documents, expand ideas into full drafts, and edit existing content with AI assistance.",
    icon: ComposeRegular,
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
        title="Your AI knowledge partner"
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
      <div className="grid md:grid-cols-3 grid-cols-1 gap-6">
        {keyBenefits.map((benefit, index) => (
          <div key={index} className="flex flex-col gap-y-2">
            <div className="flex items-center gap-x-2">
              <benefit.icon className="size-4 text-gray-700" />
              <span className="font-medium text-[15px]/0 text-gray-900">{benefit.title}</span>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">{benefit.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
