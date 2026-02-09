import type { DemoState } from "./DemoStateSelector";

import { FeatureSpot } from "./feature-spots";
import { LandingSection } from "./LandingSection";

export interface FeatureSectionProps {
  illustration: DemoState;
  title: string;
  content: string;
  featureSlug: string;
  reverse?: boolean;
}

export function FeatureSection({
  illustration,
  title,
  content,
  featureSlug,
  reverse = false,
}: FeatureSectionProps) {
  return (
    <LandingSection
      illustration={<FeatureSpot type={illustration} />}
      title={title}
      description={content}
      primaryButton={{
        href: "https://app.lydie.co/auth",
        label: "Try it yourself",
        showArrow: true,
      }}
      secondaryButton={{
        href: `/features/${featureSlug}`,
        label: "Learn more",
      }}
      reverse={reverse}
    />
  );
}
