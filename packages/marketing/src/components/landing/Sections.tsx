import {
  FeatureSpotAI,
  FeatureSpotCollaboration,
  FeatureSpotLinking,
  FeatureSpotOpenSource,
  FeatureSpotSearch,
} from "@/components/sections";

import type { Section } from "../../data/sections";

import { LandingSection } from "./LandingSection";

const illustrationComponents = {
  assistant: FeatureSpotAI,
  search: FeatureSpotSearch,
  linking: FeatureSpotLinking,
  collaboration: FeatureSpotCollaboration,
  opensource: FeatureSpotOpenSource,
  performance: FeatureSpotSearch,
  integrations: FeatureSpotAI,
  knowledgebase: FeatureSpotLinking,
} as const;

interface SectionsProps {
  sections: Section[];
}

export function Sections({ sections }: SectionsProps) {
  return (
    <div className="w-full flex flex-col gap-y-16 md:gap-y-48 mt-12">
      {sections.map((section, index) => {
        const Illustration = illustrationComponents[section.id];
        if (!Illustration) {
          console.warn(`No illustration component found for: ${section.id}`);
          return null;
        }
        return (
          <LandingSection
            key={section.id}
            illustration={<Illustration />}
            title={section.title}
            description={section.description}
            primaryButton={{
              href: "https://app.lydie.co/auth",
              label: "Try it yourself",
              showArrow: true,
            }}
            secondaryButton={
              section.href
                ? {
                    href: section.href,
                    label: section.ctaText ?? "Learn more",
                  }
                : undefined
            }
            featureBadge={
              section.badge
                ? {
                    icon: section.badge.icon,
                    color: section.badge.color,
                    text: section.badge.label,
                  }
                : undefined
            }
            reverse={index % 2 === 0}
          />
        );
      })}
    </div>
  );
}

export { illustrationComponents };
export type { Section as SectionData };
