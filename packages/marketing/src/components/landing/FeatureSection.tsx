import type { ReactNode } from "react";

import type { DemoState } from "./DemoStateSelector";

import { FeatureSpot } from "./feature-spots";

export type FeatureId = DemoState | "opensource" | "knowledgebase" | "integrations" | "performance";

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

export interface FeatureSectionConfig {
  id: FeatureId;
  title: string;
  description: string;
  featureSlug: string;
  badge?: {
    icon: "assistant" | "linking" | "collaboration" | "search" | "speed";
    color: ColorId;
    text: string;
  };
}

// Registry of reusable feature sections
export const featureRegistry: Record<FeatureId, FeatureSectionConfig> = {
  // Core features (have feature-spot illustrations)
  search: {
    id: "search",
    title: "Find anything in seconds",
    description:
      "Powerful full-text search across all your documents. Use filters to narrow results, and leverage smart suggestions to discover related content.",
    featureSlug: "search",
    badge: {
      icon: "search",
      color: "cyan",
      text: "Search",
    },
  },
  assistant: {
    id: "assistant",
    title: "AI assistant built-in",
    description:
      "Get writing assistance, generate content, and chat with your documents using our integrated AI features. Built directly into the editor for seamless help.",
    featureSlug: "assistant",
    badge: {
      icon: "assistant",
      color: "purple",
      text: "AI Assistant",
    },
  },
  collaboration: {
    id: "collaboration",
    title: "Real-time collaboration",
    description:
      "Work together seamlessly with your team. See changes as they happen, with live cursors, instant updates, and no version conflicts.",
    featureSlug: "collaborative-editing",
    badge: {
      icon: "collaboration",
      color: "blue",
      text: "Collaboration",
    },
  },
  linking: {
    id: "linking",
    title: "Connect your ideas",
    description:
      "Link related ideas together to build connections and discover patterns. Create a web of knowledge with bidirectional links.",
    featureSlug: "linking",
    badge: {
      icon: "linking",
      color: "violet",
      text: "Internal Linking",
    },
  },
  // Comparison sections (need custom illustrations or use existing)
  opensource: {
    id: "opensource",
    title: "Open-source and self-hostable",
    description:
      "Lydie is fully open-source under the AGPL license. Self-host on your own infrastructure for complete control over your data, or use our cloud version.",
    featureSlug: "assistant", // Link to a relevant feature page
    badge: {
      icon: "assistant",
      color: "green",
      text: "Open Source",
    },
  },
  knowledgebase: {
    id: "knowledgebase",
    title: "Organized knowledge base",
    description:
      "Build a centralized knowledge base that grows with your team. Create nested pages, link related documents, and organize information your way.",
    featureSlug: "linking",
    badge: {
      icon: "linking",
      color: "gold",
      text: "Knowledge Base",
    },
  },
  integrations: {
    id: "integrations",
    title: "Powerful integrations",
    description:
      "Connect Lydie to your favorite tools. Sync content to GitHub, publish to Shopify, or integrate with your existing workflow.",
    featureSlug: "assistant",
    badge: {
      icon: "assistant",
      color: "coral",
      text: "Integrations",
    },
  },
  performance: {
    id: "performance",
    title: "Fast and lightweight",
    description:
      "Experience instant loading and smooth editing, even with large documents. Built with modern web technologies for a snappy experience.",
    featureSlug: "search",
    badge: {
      icon: "speed",
      color: "mint",
      text: "Performance",
    },
  },
};

export interface FeatureSectionProps {
  id?: FeatureId;
  config?: FeatureSectionConfig;
  title?: string;
  description?: string;
  featureSlug?: string;
  badge?: FeatureSectionConfig["badge"];
  illustration?: ReactNode;
  illustrationId?: FeatureId;
  reverse?: boolean;
  primaryButton?: {
    href: string;
    label: string;
  };
  secondaryButton?: {
    href: string;
    label: string;
  };
}

// Get feature section config by ID
export function getFeatureSectionConfig(id: FeatureId): FeatureSectionConfig | undefined {
  return featureRegistry[id];
}

// Simple feature section component - can be used standalone or in a list
export function FeatureSection({
  id,
  config: configProp,
  title: titleProp,
  description: descriptionProp,
  featureSlug: featureSlugProp,
  badge: badgeProp,
  illustration: illustrationProp,
  illustrationId,
  reverse = false,
  primaryButton: primaryButtonProp,
  secondaryButton: secondaryButtonProp,
}: FeatureSectionProps) {
  // Resolve config from ID or use provided config
  const config = configProp ?? (id ? featureRegistry[id] : undefined);

  // Use props if provided, fall back to config
  const title = titleProp ?? config?.title ?? "";
  const description = descriptionProp ?? config?.description ?? "";
  const featureSlug = featureSlugProp ?? config?.featureSlug ?? "";
  const badge = badgeProp ?? config?.badge;

  // Default buttons
  const primaryButton = primaryButtonProp ?? {
    href: "https://app.lydie.co/auth",
    label: "Try it yourself",
  };
  const secondaryButton =
    secondaryButtonProp ??
    (featureSlug
      ? {
          href: `/features/${featureSlug}`,
          label: "Learn more",
        }
      : undefined);

  // Resolve illustration
  const resolvedIllustrationId = illustrationId ?? id;
  let illustration: ReactNode = illustrationProp;

  if (!illustration && resolvedIllustrationId) {
    // Map feature IDs to DemoState for feature-spot components
    const demoStateMap: Partial<Record<FeatureId, DemoState>> = {
      search: "search",
      assistant: "assistant",
      collaboration: "collaboration",
      linking: "linking",
    };

    const demoState = demoStateMap[resolvedIllustrationId];
    if (demoState) {
      illustration = <FeatureSpot type={demoState} />;
    }
  }

  return (
    <div className={`relative bg-white z-10 ${reverse ? "" : ""}`}>
      <div className="grid grid-cols-1 md:grid-cols-2 z-0 gap-8 items-center">
        <div className={`relative flex size-full order-2 ${reverse ? "md:order-2" : "md:order-1"}`}>
          {illustration}
        </div>
        <div className={`order-1 ${reverse ? "md:order-1" : "md:order-2"}`}>
          <div className="flex flex-col gap-y-4 justify-center size-full">
            {badge && (
              <div className="flex items-center gap-x-2">
                <div
                  className={`size-6 rounded-md flex items-center justify-center`}
                  style={{ backgroundColor: `var(--color-${badge.color})` }}
                >
                  <span className="text-white text-xs">{badge.icon[0].toUpperCase()}</span>
                </div>
                <span className="text-sm font-medium text-gray-600">{badge.text}</span>
              </div>
            )}
            <h2 className="text-2xl sm:text-3xl tracking-tight font-medium text-black/85">
              {title}
            </h2>
            <p className="text-base/relaxed text-black/60 text-balance">{description}</p>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 mt-4">
              <a
                href={primaryButton.href}
                className="inline-flex items-center justify-center gap-x-2 px-4 py-2 text-sm font-medium rounded-lg bg-black text-white hover:bg-black/90 transition-colors"
              >
                {primaryButton.label}
              </a>
              {secondaryButton && (
                <a
                  href={secondaryButton.href}
                  className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                >
                  {secondaryButton.label}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Container for rendering multiple sections from data
export interface FeatureSectionsProps {
  sections: (
    | FeatureId
    | FeatureSectionConfig
    | ({ id: FeatureId } & { overrides?: Partial<FeatureSectionConfig> })
  )[];
}

export function FeatureSections({ sections }: FeatureSectionsProps) {
  return (
    <div className="w-full flex flex-col gap-y-16 md:gap-y-24">
      {sections.map((section, index) => {
        let config: FeatureSectionConfig;
        let overrides: Partial<FeatureSectionConfig> = {};

        if (typeof section === "string") {
          const found = featureRegistry[section];
          if (!found) {
            console.warn(`Feature section not found: ${section}`);
            return null;
          }
          config = found;
        } else if ("overrides" in section) {
          // It's an object with id and overrides
          const found = featureRegistry[section.id];
          if (!found) {
            console.warn(`Feature section not found: ${section.id}`);
            return null;
          }
          config = found;
          overrides = section.overrides ?? {};
        } else if ("id" in section) {
          // It's a FeatureSectionConfig directly
          config = section as FeatureSectionConfig;
        } else {
          config = section as FeatureSectionConfig;
        }

        return (
          <FeatureSection
            key={config.id}
            id={config.id}
            title={overrides.title ?? config.title}
            description={overrides.description ?? config.description}
            featureSlug={overrides.featureSlug ?? config.featureSlug}
            badge={overrides.badge ?? config.badge}
            reverse={index % 2 === 1}
          />
        );
      })}
    </div>
  );
}
