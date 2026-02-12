import type { DemoState } from "../components/landing/DemoStateSelector";
import type { FeaturesMap } from "./feature-showcases";

// Valid role slugs from roles.ts
export type RoleSlug = "researchers";

export interface UseCaseDefinition {
  slug: string;
  terms: {
    act: string;
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
  statement?: string;
  /**
   * Feature showcases to display on the use case page.
   * Keys are feature identifiers (assistant, search, linking, collaboration).
   * Values can be empty {} to use defaults, or override title/description/ctaText.
   * Badge and slug are automatically inferred from the feature key.
   */
  featureShowcases?: FeaturesMap;
  templateSlugs?: string[];
  demoStates?: DemoState[];
  /**
   * Featured roles section - links to role-specific use case pages.
   * Maps role slugs to teaser descriptions. Shows up to 4 roles,
   * with a link to see all roles if more exist.
   */
  featuredRoles?: Partial<Record<RoleSlug, string>>;
  /**
   * Common problems with this use case and how Lydie solves them.
   * Problem → solution narrative adds semantic depth and differentiation.
   */
  problemsAndSolutions?: {
    title: string;
    problems: {
      problem: string;
      solution: string;
    }[];
  };
  /**
   * Concrete workflow example showing how users accomplish this use case.
   * Gives Google procedural content and user intent clarity.
   */
  workflowExample?: {
    title: string;
    description: string;
    steps: string[];
  };
  /**
   * How Lydie differs from typical/generic tools in this category.
   * Helps Google place Lydie in the ecosystem without explicit comparison.
   */
  differentiation?: {
    title: string;
    points: {
      label: string;
      description: string;
    }[];
  };
  /**
   * FAQ items for long-tail keyword capture and schema opportunities.
   */
  faqs?: {
    q: string;
    a: string;
  }[];
  // Array of article slugs from our blog
  blogPosts?: string[];
}

export const useCaseDefinitions: UseCaseDefinition[] = [
  {
    slug: "note-taking",
    terms: {
      act: "note-taking",
    },
    hero: {
      title: "A note-taking workspace that doesn't fight against you",
      description:
        "Taking notes is not just about writing things down. It's about capturing ideas, connecting them over time and being able to resurface these notes when you need them again. Lydie is a fast, structured note-taking workspace designed for long-form thinking and knowledge building, not just quick scraps of text.",
    },
    thumbnail: {
      title: "Note-taking",
      description: "Enhance your note-taking workflow with Lydie's powerful features.",
    },
    meta: {
      title: "Best Note-taking App",
      description:
        "Capture ideas, meeting notes, and thoughts with a powerful, flexible note-taking app designed for knowledge work.",
    },
    statement:
      "Your ideas are too valuable to lose in scattered notebooks or forgotten apps. Lydie gives you a single place where every thought finds its home and resurfaces when you need it most.",
    problemsAndSolutions: {
      title: "Common note-taking problems",
      problems: [
        {
          problem: "Notes get scattered across apps",
          solution: "Everything lives in one workspace with nested pages and consistent structure.",
        },
        {
          problem: "Hard to find things later",
          solution: "Powerful search and internal linking make any note discoverable in seconds.",
        },
        {
          problem: "Large documents become slow",
          solution: "Lydie stays fast even with thousands of notes and long-form content.",
        },
        {
          problem: "No meaningful linking between ideas",
          solution: "Internal linking helps ideas compound and surface unexpected connections.",
        },
        {
          problem: "Notes stay isolated instead of compounding",
          solution:
            "Connect related notes to build a knowledge base that grows more valuable over time.",
        },
      ],
    },
    featureShowcases: {
      linking: {
        title: "Link your notes together",
        description:
          "Lydie's internal linking feature helps connect your notes together to build a web of knowledge.",
      },
      assistant: {
        description:
          "Use the AI assistant to help organize and contextualize your notes. Summarize long documents, expand ideas, and get writing suggestions.",
      },
      search: {
        title: "Don't lose track of your notes ever again",
        description:
          "Use powerful search to find any note in seconds. Lydie's command menu is always a single keystroke away.",
      },
    },
    featuredRoles: {
      researchers:
        "Organize literature reviews, capture insights from papers, and build a research knowledge base that compounds over time.",
    },
    workflowExample: {
      title: "Example workflow: capturing and connecting meeting notes",
      description:
        "See how teams use Lydie to turn scattered meeting notes into actionable knowledge.",
      steps: [
        "Capture meeting notes in a project doc with clear structure",
        "Link related notes like decisions, goals, and specs",
        "Use search to resurface past context when similar topics come up",
        "Use AI to summarize action items and next steps automatically",
      ],
    },
    differentiation: {
      title: "How Lydie differs from typical note-taking apps",
      points: [
        {
          label: "Built for long-form docs",
          description: "Not just quick captures, designed for substantial writing and thinking.",
        },
        {
          label: "Fast with large pages",
          description: "Performance stays snappy even with extensive notes and content.",
        },
        {
          label: "Designed for internal linking",
          description: "Connect ideas naturally to build a web of knowledge.",
        },
        {
          label: "Structured workspace",
          description: "Hierarchical organization instead of flat notes or rigid folders.",
        },
      ],
    },
    faqs: [
      {
        q: "Is Lydie good for long notes?",
        a: "Yes. Lydie is designed for substantial writing, not just quick captures. Long-form docs stay fast and searchable.",
      },
      {
        q: "Can I link notes together?",
        a: "Absolutely. Use internal linking to reference any page from any other. This creates a web of connected ideas that compounds over time.",
      },
    ],
    blogPosts: [
      "how-to-better-organize-your-notes",
      "how-to-take-good-meeting-notes",
      "note-taking-methods-systems-and-templates-for-capturing-what-matters",
    ],
  },
  {
    slug: "personal-knowledge-base",
    terms: {
      act: "keeping a personal knowledge base",
    },
    hero: {
      title: "Build a personal knowledge base that actually works for you",
      description:
        "Lydie helps you capture, organize and connect ideas when they come. No more digging through dozens of files or forgetting what you wrote last week.",
    },
    thumbnail: {
      title: "Personal knowledge base",
      description: "Lydie is the ideal tool for setting up your personal knowledge base.",
    },
    meta: {
      title: "Best Tool for Your Personal Knowledge Base",
      description:
        "Stop losing your best ideas in scattered notes. Lydie helps you capture, organize and connect ideas when they come. No more digging through dozens of files or forgetting what you wrote last week.",
    },
    statement:
      "The biggest obstacle of building and maintaining a personal knowledge base is things getting in your way. Lydie tries to stay as invisible as possible, so you can focus on your thinking and your work.",
    featureShowcases: {
      search: {
        description: "Easily resurface previous thoughts and ideas with Lydie's powerful search.",
      },
      linking: {
        description:
          "Lydie's internal linking feature makes it the ideal platform for building up a personal knowledge base.",
      },
      assistant: {
        title: "Meet your sparring partner",
        description:
          "You don't have to be alone when building your personal knowledge base. Lydie's AI assistant can help you structure your ideas and connect them together.",
      },
    },
    blogPosts: [
      "what-is-a-personal-knowledge-base",
      "how-to-structure-a-knowledge-base",
      "knowledge-base-best-practices",
    ],
    templateSlugs: ["CNidcw5nia3iLKRh", "ottPzeqZAhnbLS9c", "Qt6PaUkoEJcvjmRz"],
    faqs: [
      {
        q: "What is a personal knowledge base?",
        a: "A personal knowledge base is a collection of ideas and information gathered over time. For more information, read our [general article on personal knowledge bases](/blog/what-is-a-personal-knowledge-base).",
      },
      {
        q: "How do I start building my personal knowledge base?",
        a: "The best way to start building your personal knowledge base is to start capturing ideas as they come to you. Lydie is created with organic linking in mind, making it easy to connect ideas as you go. We advice you read our guide on [how to structure a knowledge base](/blog/how-to-structure-a-knowledge-base) to get started.",
      },
    ],
  },
];

export function getUseCaseDefinition(slug: string): UseCaseDefinition | undefined {
  return useCaseDefinitions.find((uc) => uc.slug === slug);
}

export function getAllUseCaseSlugs(): string[] {
  return useCaseDefinitions.map((uc) => uc.slug);
}

export function getAllUseCaseDefinitions(): UseCaseDefinition[] {
  return useCaseDefinitions;
}
