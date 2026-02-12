import { CastShadow } from "../generic/CastShadow";
import { GradientOutline } from "../generic/GradientOutline";
import { LandingSection } from "./LandingSection";

export function SpeedSection() {
  const illustration = (
    <CastShadow className="w-full">
      <GradientOutline />
      <div className="h-[380px] rounded-xl shadow-legit overflow-hidden bg-white" />
    </CastShadow>
  );

  return (
    <LandingSection
      featureBadge={{
        icon: "speed",
        color: "green",
        text: "Speed",
      }}
      title="Don't lose your thoughts to loading screens"
      description="While other tools leave you waiting, Lydie's local-first sync engine keeps navigation and actions near-instant. No loading screens. No waiting. Just flow."
      illustration={illustration}
      primaryButton={{
        href: "https://app.lydie.co/auth",
        label: "Try it yourself",
        showArrow: true,
      }}
      secondaryButton={{
        href: "/features",
        label: "Learn more",
      }}
    />
  );
}
