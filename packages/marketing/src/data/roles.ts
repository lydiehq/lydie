import type { DemoState } from "../components/landing/DemoStateSelector";
import type { Comparison } from "./comparisons";
import type { FeatureShowcaseInput } from "./feature-showcases";

export interface FAQItem {
  q: string;
  a: string;
}

export interface Role {
  slug: string;
  shortTitle: string; // used in places such as breadcrumbs and when dynamically using the role in titles and descriptions
  terms: {
    actor: string;
    actorPlural: string;
  };
  hero: {
    title: string;
    description: string;
  };
  thumbnail: {
    title: string;
    description: string;
  };
  meta: {
    title: string;
    description: string;
  };
  painPoints: string[];
  workflows: {
    title: string;
    description: string;
    useCaseSlug: string;
  }[];
  /**
   * Link to a comparison page with a role-specific description.
   * The slug must reference a valid comparison in comparisons.ts
   */
  comparison?: {
    slug: Comparison["slug"];
    description: string;
  };
  faqs: FAQItem[];
  ctaText: string;
  relatedFeatures?: string[];
  visible: boolean;
  /**
   * Feature showcases to display on the role page.
   * Can be simple feature keys (e.g., "assistant", "search") or full customization objects.
   * Badge, slug, and defaults are automatically inferred from the feature key.
   */
  featureShowcases?: FeatureShowcaseInput[];
  /**
   * Template slugs to display on the role page.
   * Up to 3 templates will be shown. If empty or not provided, no section is shown.
   */
  templateSlugs?: string[];
  /**
   * Demo states to show in the interactive demo section.
   * If not provided, defaults to all states.
   */
  demoStates?: DemoState[];
}

export const roles: Role[] = [
  {
    slug: "researchers",
    shortTitle: "Researchers",
    terms: {
      actor: "researcher",
      actorPlural: "researchers",
    },
    hero: {
      title: "A writing workspace, built for researchers",
      description:
        "Organizing research, synthesizing findings, and building knowledge needs to be done in a way that works for you. Lydie is built to accompany you in your research, not fight against you.",
    },
    thumbnail: {
      title: "Writing Workspace for Researchers",
      description:
        "Organize research, synthesize findings, and build knowledge that compounds. Built for academics, scientists, and independent researchers.",
    },
    meta: {
      title: "Writing Workspace for Researchers",
      description:
        "Organize research, synthesize findings, and build knowledge that compounds. Built for academics, scientists, and independent researchers.",
    },
    painPoints: [
      "Losing track of papers and sources across multiple tools",
      "Struggling to synthesize findings across hundreds of documents",
      "No good way to connect ideas and discover patterns",
      "Difficulty collaborating with co-authors and advisors",
    ],
    workflows: [
      {
        title: "Literature Notes",
        description: "Capture insights from papers with organized, searchable notes",
        useCaseSlug: "note-taking",
      },
    ],
    comparison: {
      slug: "notion",
      description:
        "Unlike Notion which slows down with large documents, Lydie gives you fast performance, powerful AI assistance, and seamless teamwork, all while keeping your research private and secure.",
    },
    faqs: [
      {
        q: "How can researchers use Lydie?",
        a: "Researchers use Lydie to organize literature reviews, take notes on papers, track research projects, and synthesize findings. Create pages for each paper with your notes and highlights. Link related concepts across your knowledge base.",
      },
      {
        q: "Can I use Lydie for academic writing?",
        a: "Yes. Lydie works well for organizing your thoughts before writing. Create outlines, draft sections, and keep your sources organized. Export your work when you're ready to format it for submission.",
      },
      {
        q: "How does AI help with research?",
        a: "Lydie's AI can summarize academic papers, help you understand complex concepts, suggest connections between different sources, and assist with synthesizing findings across multiple documents.",
      },
      {
        q: "Can I collaborate with my research team?",
        a: "Yes. Share pages or entire spaces with collaborators. Work together on literature reviews, methodology sections, or data analysis. Comments and real-time collaboration make it easy to give and receive feedback.",
      },
    ],
    ctaText: "Try Lydie for research",
    visible: true,
    relatedFeatures: ["assistant", "search", "linking", "collaborative-editing"],
  },
];

export function getRole(slug: string): Role | undefined {
  return roles.find((role) => role.slug === slug);
}

export function getAllRoleSlugs(): string[] {
  return roles.map((role) => role.slug);
}

export function getAllRoles(): Role[] {
  return roles;
}
