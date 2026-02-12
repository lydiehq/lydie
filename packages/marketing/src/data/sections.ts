import type { ComponentType } from "react";

import {
  FeatureSpotAI,
  FeatureSpotCollaboration,
  FeatureSpotLinking,
  FeatureSpotOpenSource,
  FeatureSpotSearch,
} from "@/components/sections";

export type SectionId =
  | "assistant"
  | "search"
  | "linking"
  | "collaboration"
  | "opensource"
  | "performance"
  | "integrations";

export type ColorId =
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

export type SectionBadge = {
  icon: "assistant" | "search" | "linking" | "collaboration" | "speed";
  color: ColorId;
  label: string;
};

export interface Section {
  id: SectionId;
  title: string;
  description: string;
  badge: SectionBadge;
  /** Component to render as the section illustration */
  illustration: ComponentType;
  /** URL to link to (feature page, blog post, external, etc.) */
  href?: string;
  /** Default CTA text */
  ctaText?: string;
}

// Input for resolving a section - either just the ID or with overrides
export type SectionInput =
  | SectionId
  | {
      id: SectionId;
      title?: string;
      description?: string;
      href?: string;
      ctaText?: string;
    };

export const sections: Record<SectionId, Section> = {
  assistant: {
    id: "assistant",
    title: "AI Assistant",
    description:
      "Powerful AI features built directly into your editor. Get writing assistance, generate content, and chat with your documents.",
    badge: {
      icon: "assistant",
      color: "purple",
      label: "AI Assistant",
    },
    illustration: FeatureSpotAI,
    href: "/features/assistant",
    ctaText: "Learn more",
  },

  search: {
    id: "search",
    title: "Powerful search",
    description:
      "Find anything in your workspace instantly. Powerful full-text search with filters, shortcuts, and smart suggestions.",
    badge: {
      icon: "search",
      color: "cyan",
      label: "Search",
    },
    illustration: FeatureSpotSearch,
    href: "/features/search",
    ctaText: "Learn more",
  },

  linking: {
    id: "linking",
    title: "Internal Linking",
    description:
      "Connect your ideas with bidirectional links. Create a web of knowledge and discover connections between your documents.",
    badge: {
      icon: "linking",
      color: "violet",
      label: "Internal Linking",
    },
    illustration: FeatureSpotLinking,
    href: "/features/linking",
    ctaText: "Learn more",
  },

  collaboration: {
    id: "collaboration",
    title: "Collaborative Editing",
    description:
      "Real-time collaboration with your team. See live cursors, instant updates, and seamless teamwork.",
    badge: {
      icon: "collaboration",
      color: "blue",
      label: "Collaboration",
    },
    illustration: FeatureSpotCollaboration,
    href: "/features/collaborative-editing",
    ctaText: "Learn more",
  },

  opensource: {
    id: "opensource",
    title: "Open-source",
    description:
      "Lydie is fully open-source under the AGPL license. Self-host on your own infrastructure for complete control over your data, or use our cloud version to get started instantly.",
    badge: {
      icon: "assistant",
      color: "green",
      label: "Open Source",
    },
    illustration: FeatureSpotOpenSource,
    href: "https://github.com/lydiehq/lydie",
    ctaText: "Read more",
  },

  performance: {
    id: "performance",
    title: "Fast and lightweight",
    description:
      "Experience instant loading and smooth editing, even with large documents. Lydie is built with modern web technologies to deliver a snappy experience without the bloat.",
    badge: {
      icon: "speed",
      color: "mint",
      label: "Performance",
    },
    illustration: FeatureSpotSearch,
    href: undefined,
    ctaText: undefined,
  },

  integrations: {
    id: "integrations",
    title: "Powerful integrations",
    description:
      "Connect Lydie to your favorite tools and platforms. Sync content to GitHub repositories, publish to Shopify blogs, or integrate with your existing workflow.",
    badge: {
      icon: "assistant",
      color: "coral",
      label: "Integrations",
    },
    illustration: FeatureSpotAI,
    href: undefined,
    ctaText: undefined,
  },
};

// Resolve a section from input (ID string or object with overrides).
export function resolveSection(input: SectionInput): Section {
  const id = typeof input === "string" ? input : input.id;
  const base = sections[id];

  if (!base) {
    throw new Error(`Unknown section id: ${id}`);
  }

  if (typeof input === "string") {
    return base;
  }

  return {
    ...base,
    ...(input.title !== undefined && { title: input.title }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.href !== undefined && { href: input.href }),
    ...(input.ctaText !== undefined && { ctaText: input.ctaText }),
  };
}

// Resolve multiple sections from an array of inputs.
export function resolveSections(inputs: SectionInput[]): Section[] {
  return inputs.map(resolveSection);
}
