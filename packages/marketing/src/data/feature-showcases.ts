import type { DemoState } from "../components/landing/DemoStateSelector";

export type FeatureKey = "assistant" | "search" | "linking" | "collaboration" | "ai";

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

export interface FeatureBadgeConfig {
  icon: "assistant" | "linking" | "collaboration" | "search" | "speed";
  color: ColorId;
  text: string;
}

export interface FeatureShowcaseConfig {
  key: FeatureKey;
  illustration: DemoState;
  slug: string;
  badge: FeatureBadgeConfig;
  defaultTitle: string;
  defaultDescription: string;
}

// Central registry for feature showcases
// This provides a single source of truth for feature metadata
export const featureShowcaseRegistry: Record<FeatureKey, FeatureShowcaseConfig> = {
  assistant: {
    key: "assistant",
    illustration: "assistant",
    slug: "assistant",
    badge: {
      icon: "assistant",
      color: "purple",
      text: "AI Assistant",
    },
    defaultTitle: "AI-powered writing assistance",
    defaultDescription:
      "Get help drafting, editing, and improving your content with built-in AI assistance. Summarize long documents, expand ideas, and get writing suggestions.",
  },
  search: {
    key: "search",
    illustration: "search",
    slug: "search",
    badge: {
      icon: "search",
      color: "cyan",
      text: "Search",
    },
    defaultTitle: "Find anything instantly",
    defaultDescription:
      "Powerful full-text search helps you find the right content in seconds, even across thousands of documents.",
  },
  linking: {
    key: "linking",
    illustration: "linking",
    slug: "linking",
    badge: {
      icon: "linking",
      color: "violet",
      text: "Internal Linking",
    },
    defaultTitle: "Connect your ideas",
    defaultDescription:
      "Link related content together to build a web of knowledge. Discover connections between ideas and navigate effortlessly.",
  },
  collaboration: {
    key: "collaboration",
    illustration: "collaboration",
    slug: "collaborative-editing",
    badge: {
      icon: "collaboration",
      color: "blue",
      text: "Collaboration",
    },
    defaultTitle: "Real-time collaboration",
    defaultDescription:
      "Work together seamlessly with your team. See changes as they happen, with live cursors, instant updates, and no version conflicts.",
  },
  ai: {
    key: "ai",
    illustration: "assistant",
    slug: "assistant",
    badge: {
      icon: "assistant",
      color: "purple",
      text: "AI Assistant",
    },
    defaultTitle: "AI assistant built-in",
    defaultDescription:
      "Get writing assistance, generate content, and chat with your documents using our integrated AI features. Built directly into the editor for seamless help.",
  },
};

// Type for feature showcase input - can be just a key or full customization
export type FeatureShowcaseInput =
  | FeatureKey
  | {
      key: FeatureKey;
      title?: string;
      description?: string;
      ctaText?: string;
    };

// Helper to resolve a feature showcase from input
export function resolveFeatureShowcase(input: FeatureShowcaseInput): {
  illustration: DemoState;
  title: string;
  description: string;
  featureSlug: string;
  featureBadge: FeatureBadgeConfig;
  ctaText: string;
} {
  const key = typeof input === "string" ? input : input.key;
  const config = featureShowcaseRegistry[key];

  if (!config) {
    throw new Error(`Unknown feature key: ${key}`);
  }

  const customTitle = typeof input === "object" ? input.title : undefined;
  const customDescription = typeof input === "object" ? input.description : undefined;
  const customCtaText = typeof input === "object" ? input.ctaText : undefined;

  return {
    illustration: config.illustration,
    title: customTitle ?? config.defaultTitle,
    description: customDescription ?? config.defaultDescription,
    featureSlug: config.slug,
    featureBadge: config.badge,
    ctaText: customCtaText ?? "Learn more",
  };
}

// Helper to resolve multiple feature showcases
export function resolveFeatureShowcases(
  inputs: FeatureShowcaseInput[],
): ReturnType<typeof resolveFeatureShowcase>[] {
  return inputs.map(resolveFeatureShowcase);
}

// Type for features object map (key -> optional overrides)
export type FeaturesMap = Partial<
  Record<FeatureKey, { title?: string; description?: string; ctaText?: string }>
>;

// Helper to resolve features from a FeaturesMap
export function resolveFeaturesMap(map: FeaturesMap): ReturnType<typeof resolveFeatureShowcase>[] {
  return Object.entries(map).map(([key, overrides]) => {
    const config = featureShowcaseRegistry[key as FeatureKey];
    if (!config) {
      throw new Error(`Unknown feature key: ${key}`);
    }
    return {
      illustration: config.illustration,
      title: overrides?.title ?? config.defaultTitle,
      description: overrides?.description ?? config.defaultDescription,
      featureSlug: config.slug,
      featureBadge: config.badge,
      ctaText: overrides?.ctaText ?? "Learn more",
    };
  });
}
