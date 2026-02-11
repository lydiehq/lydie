import type { DemoState } from "./DemoStateSelector";

import {
  FeatureSpotSearch,
  FeatureSpotCollaboration,
  FeatureSpotLinking,
  FeatureSpotAI,
} from "./feature-spots";
import { LandingSection } from "./LandingSection";

type ColorId =
  | "coral"
  | "purple"
  | "blue"
  | "mint"
  | "gold"
  | "pink"
  | "periwinkle"
  | "green"
  | "peach"
  | "violet"
  | "cyan"
  | "rose";

interface FeatureBadgeConfig {
  icon: "assistant" | "linking" | "collaboration" | "search" | "speed";
  color: ColorId;
  text: string;
}

interface UseCaseSection {
  illustration: DemoState;
  title: string;
  content: string;
  featureSlug: string;
  index: number;
  featureBadge?: FeatureBadgeConfig;
}

interface UseCaseSectionsProps {
  sections: UseCaseSection[];
}

const illustrationComponents: Record<DemoState, React.ComponentType> = {
  search: FeatureSpotSearch,
  collaboration: FeatureSpotCollaboration,
  linking: FeatureSpotLinking,
  assistant: FeatureSpotAI,
};

export function UseCaseSections({ sections }: UseCaseSectionsProps) {
  return (
    <div className="w-full flex flex-col gap-y-16 md:gap-y-24 mt-24">
      {sections.map((section) => {
        const Illustration = illustrationComponents[section.illustration];
        if (!Illustration) {
          console.warn(`No illustration component found for: ${section.illustration}`);
          return null;
        }
        return (
          <LandingSection
            key={section.index}
            illustration={<Illustration />}
            title={section.title}
            description={section.content}
            primaryButton={{
              href: "https://app.lydie.co/auth",
              label: "Try it yourself",
              showArrow: true,
            }}
            secondaryButton={{
              href: `/features/${section.featureSlug}`,
              label: "Learn more",
            }}
            featureBadge={section.featureBadge}
            reverse={section.index % 2 === 1}
          />
        );
      })}
    </div>
  );
}

export { illustrationComponents };
export type { UseCaseSection };
