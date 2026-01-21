export interface ComparisonSection {
  id: string
  title: string
  description: string
  illustrationId: string // ID to map to illustration component
  imageAlt: string
  featurePageUrl?: string // Optional link to dedicated feature page
}

/**
 * Registry of reusable comparison sections
 * These can be referenced across different comparison pages
 */
export const comparisonSections: Record<string, ComparisonSection> = {
  opensource: {
    id: "opensource",
    title: "Open-source and self-hostable",
    description:
      "Lydie is fully open-source under the AGPL license. Self-host on your own infrastructure for complete control over your data, or use our cloud version to get started instantly. No vendor lock-in, no data silos - just the freedom to run your workspace your way.",
    illustrationId: "opensource",
    imageAlt: "Lydie open-source illustration",
  },
  ai: {
    id: "ai",
    title: "AI assistant built-in",
    description:
      "Get writing assistance, generate content, and chat with your documents using our integrated AI features. Unlike add-ons or extensions, Lydie's AI is built directly into the editor, providing seamless help right where you need it. Ask questions, generate drafts, or get suggestions without leaving your document.",
    illustrationId: "ai",
    imageAlt: "Lydie AI assistant illustration",
  },
  collaboration: {
    id: "collaboration",
    title: "Real-time collaboration",
    description:
      "Work together seamlessly with your team. See changes as they happen, with live cursors and instant updates. Whether you're brainstorming, drafting, or editing, Lydie's real-time collaboration keeps everyone in sync without the hassle of conflicting versions or manual merging.",
    illustrationId: "collaboration",
    imageAlt: "Lydie real-time collaboration illustration",
    featurePageUrl: "/features/collaborative-editing",
  },
  knowledgebase: {
    id: "knowledgebase",
    title: "Organized knowledge base",
    description:
      "Build a centralized knowledge base that grows with your team. Create nested pages, link related documents, and organize information in a way that makes sense for your workflow. Perfect for documentation, wikis, and team resources that need to stay accessible and up-to-date.",
    illustrationId: "knowledgebase",
    imageAlt: "Lydie knowledge base illustration",
  },
  integrations: {
    id: "integrations",
    title: "Powerful integrations",
    description:
      "Connect Lydie to your favorite tools and platforms. Sync content to GitHub repositories, publish to Shopify blogs, or integrate with your existing workflow. Our extensible API and built-in integrations make it easy to fit Lydie into your existing tech stack.",
    illustrationId: "integrations",
    imageAlt: "Lydie integrations illustration",
  },
  performance: {
    id: "performance",
    title: "Fast and lightweight",
    description:
      "Experience instant loading and smooth editing, even with large documents. Lydie is built with modern web technologies to deliver a snappy experience without the bloat. No more waiting for heavy enterprise software to load - just open your browser and start writing.",
    illustrationId: "performance",
    imageAlt: "Lydie performance illustration",
  },
}

/**
 * Get a section by ID
 */
export function getSection(id: string): ComparisonSection | undefined {
  return comparisonSections[id]
}

/**
 * Section override type for comparisons
 */
export interface SectionOverride {
  id: string
  title?: string
  description?: string
}

/**
 * Get multiple sections by IDs or override objects
 * Merges default section data with comparison-specific overrides
 */
export function getSections(sections: (string | SectionOverride)[]): ComparisonSection[] {
  return sections
    .map((sectionRef) => {
      const sectionId = typeof sectionRef === "string" ? sectionRef : sectionRef.id
      const baseSection = comparisonSections[sectionId]

      if (!baseSection) {
        return undefined
      }

      // If it's just a string ID, return the base section
      if (typeof sectionRef === "string") {
        return baseSection
      }

      // Otherwise, merge overrides with base section
      return {
        ...baseSection,
        title: sectionRef.title ?? baseSection.title,
        description: sectionRef.description ?? baseSection.description,
      }
    })
    .filter((section): section is ComparisonSection => section !== undefined)
}
