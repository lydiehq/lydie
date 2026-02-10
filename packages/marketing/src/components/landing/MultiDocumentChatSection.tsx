import {
  ChevronRightRegular,
  GlobeRegular,
  SearchRegular,
  ShareRegular,
} from "@fluentui/react-icons";

import { CastShadow } from "../generic/CastShadow";
import { GradientOutline } from "../generic/GradientOutline";
import { LandingSection } from "./LandingSection";

const keyBenefits = [
  {
    title: "Find information instantly",
    description: "Search across all your documents with AI-powered search.",
    icon: SearchRegular,
  },
  {
    title: "Collaborate in real-time",
    description: "Stay in sync with your team or across devices with ease.",
    icon: ShareRegular,
  },
  {
    title: "Open-source",
    description: "Free to use, modify, and contribute. No hidden fees or vendor lock-in.",
    icon: GlobeRegular,
  },
];

export function MultiDocumentChatSection() {
  const illustration = (
    <CastShadow className="w-full">
      <GradientOutline />
      <div className="h-[400px] rounded-xl shadow-legit overflow-hidden bg-white" />
    </CastShadow>
  );

  return (
    <div className="flex flex-col gap-y-12">
      <LandingSection
        featureBadge="assistant"
        title="Work across your entire workspace"
        description="Your AI assistant can read, analyze, and synthesize information from multiple documents to help you create comprehensive reports and summaries in seconds."
        illustration={illustration}
        primaryButton={{
          href: "https://app.lydie.co/auth",
          label: "Get started",
          showArrow: true,
        }}
        secondaryButton={{
          href: "/features/ai-assistant",
          label: "Learn more",
        }}
        reverse={true}
      />
      <div className="grid md:grid-cols-3 grid-cols-1 gap-6">
        {keyBenefits.map((benefit) => (
          <div className="flex flex-col gap-y-2">
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
