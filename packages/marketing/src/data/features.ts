export interface FeatureSubpage {
  slug: string;
  title: string;
  description: string;
}

export interface Feature {
  slug: string;
  title: string;
  description: string;
  icon?: string;
  subpages?: FeatureSubpage[];
}

export const features: Feature[] = [
  {
    slug: "ai-assistant",
    title: "AI Assistant",
    description:
      "Powerful AI features built directly into your editor. Get writing assistance, generate content, and chat with your documents.",
    subpages: [
      {
        slug: "chat-with-documents",
        title: "Chat with Documents",
        description:
          "Ask questions about your documents and get instant answers. Our AI understands your content and provides contextual responses.",
      },
      {
        slug: "document-organization",
        title: "Document Organization",
        description:
          "Let AI help you organize your documents with smart tagging, categorization, and structure suggestions.",
      },
      {
        slug: "research-assistant",
        title: "Research Assistant",
        description:
          "AI-powered research assistance that helps you find, summarize, and synthesize information from multiple sources.",
      },
      {
        slug: "writing-assistant",
        title: "Writing Assistant",
        description:
          "Get AI-powered writing help with grammar, style, tone, and content suggestions as you write.",
      },
    ],
  },
  {
    slug: "collaborative-editing",
    title: "Collaborative Editing",
    description:
      "Real-time collaboration with your team. See live cursors, instant updates, and seamless teamwork.",
  },
  {
    slug: "knowledge-base",
    title: "Knowledge Base",
    description:
      "Build a comprehensive knowledge base for your team. Organize information with nested pages, links, and powerful search.",
  },
];

export function getFeature(slug: string): Feature | undefined {
  return features.find((feature) => feature.slug === slug);
}

export function getFeatureSubpage(
  featureSlug: string,
  subpageSlug: string,
): FeatureSubpage | undefined {
  const feature = getFeature(featureSlug);
  return feature?.subpages?.find((subpage) => subpage.slug === subpageSlug);
}

/**
 * Get all feature paths for sitemap generation
 */
export function getAllFeaturePaths(): Array<{ path: string }> {
  const paths: Array<{ path: string }> = [];

  for (const feature of features) {
    paths.push({ path: `/features/${feature.slug}` });
    if (feature.subpages) {
      for (const subpage of feature.subpages) {
        paths.push({ path: `/features/${feature.slug}/${subpage.slug}` });
      }
    }
  }

  return paths;
}
