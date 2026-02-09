import { CastShadow } from "../generic/CastShadow";
import { GradientOutline } from "../generic/GradientOutline";
import { LandingSection } from "./LandingSection";

export function MultiDocumentChatSection() {
  const illustration = (
    <CastShadow className="w-full">
      <GradientOutline />
      <div className="h-[400px] rounded-xl shadow-legit overflow-hidden bg-white" />
    </CastShadow>
  );

  return (
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
  );
}
