import type { DemoState } from "../components/landing/DemoStateSelector";
import type { SectionInput } from "./sections";

/**
 * Featured roles for a use case.
 * Keys are role slugs, values can be:
 * - true: use default description from the role+use case content
 * - string: use this custom description
 */
export type FeaturedRoles = Record<string, true | string>;

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
    description?: string;
  };
  statement?: string;
  /**
   * Sections to display on the use case page.
   * Can be section IDs (e.g., "assistant", "opensource") or objects with overrides.
   */
  sections?: SectionInput[];
  templateSlugs?: string[];
  demoStates?: DemoState[];
  /**
   * Featured roles section - links to role-specific use case pages.
   * Keys are role slugs, values can be true (for default description)
   * or a custom description string.
   * These are more prominent than auto-linked roles.
   */
  featuredRoles?: FeaturedRoles;
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
    question: string;
    answer: string;
  }[];
  // Array of article slugs from our blog
  blogPosts?: string[];
}

export const useCaseDefinitions = [
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
    sections: [
      {
        id: "linking",
        title: "Link your notes together",
        description:
          "Lydie's internal linking feature helps connect your notes together to build a web of knowledge.",
      },
      {
        id: "assistant",
        description:
          "Use the AI assistant to help organize and contextualize your notes. Summarize long documents, expand ideas, and get writing suggestions.",
      },
      {
        id: "search",
        title: "Don't lose track of your notes ever again",
        description:
          "Use powerful search to find any note in seconds. Lydie's command menu is always a single keystroke away.",
      },
    ],
    featuredRoles: {
      researchers: true,
      students: true,
      developers: true,
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
        question: "Is Lydie good for long notes?",
        answer:
          "Yes. Lydie is designed for substantial writing, not just quick captures. Long-form docs stay fast and searchable.",
      },
      {
        question: "Can I link notes together?",
        answer:
          "Absolutely. Use internal linking to reference any page from any other. This creates a web of connected ideas that compounds over time.",
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
    sections: [
      {
        id: "search",
        description: "Easily resurface previous thoughts and ideas with Lydie's powerful search.",
      },
      {
        id: "linking",
        description:
          "Lydie's internal linking feature makes it the ideal platform for building up a personal knowledge base.",
      },
      {
        id: "assistant",
        title: "Meet your sparring partner",
        description:
          "You don't have to be alone when building your personal knowledge base. Lydie's AI assistant can help you structure your ideas and connect them together.",
      },
    ],
    blogPosts: [
      "what-is-a-personal-knowledge-base",
      "how-to-structure-a-knowledge-base",
      "knowledge-base-best-practices",
    ],
    templateSlugs: ["CNidcw5nia3iLKRh", "ottPzeqZAhnbLS9c", "Qt6PaUkoEJcvjmRz"],
    faqs: [
      {
        question: "What is a personal knowledge base?",
        answer:
          "A personal knowledge base is a collection of ideas and information gathered over time. For more information, read our [general article on personal knowledge bases](/blog/what-is-a-personal-knowledge-base).",
      },
      {
        question: "How do I start building my personal knowledge base?",
        answer:
          "The best way to start building your personal knowledge base is to start capturing ideas as they come to you. Lydie is created with organic linking in mind, making it easy to connect ideas as you go. We advice you read our guide on [how to structure a knowledge base](/blog/how-to-structure-a-knowledge-base) to get started.",
      },
    ],
  },
  {
    slug: "content-management-system",
    terms: {
      act: "their content management system",
    },
    hero: {
      title: "Use Lydie as a headless content management system",
      description:
        "Use Lydie as a modern, API-first content management system for your blog, docs, or marketing site. Write in a fast writing workspace, then fetch and serve content through Lydie's REST API to any website or app.",
    },
    thumbnail: {
      title: "Content management system",
      description: "Use Lydie as a headless CMS with a simple REST API.",
    },
    meta: {
      title: "Headless CMS for Blogs, Docs & Websites",
    },
    statement:
      "Your content shouldn’t be locked inside your writing tool. With Lydie’s REST API, your documents become structured content you can publish anywhere – your blog, marketing site, or documentation portal.",
    problemsAndSolutions: {
      title: "Common CMS problems (and how Lydie solves them)",
      problems: [
        {
          problem: "Traditional CMSs are slow and painful to write in",
          solution:
            "Lydie is built as a fast writing workspace first, so writing long-form content and docs actually feels good.",
        },
        {
          problem: "Content is locked into the CMS UI",
          solution:
            "Fetch documents via Lydie’s REST API and render them anywhere: blogs, docs sites, marketing pages, or apps.",
        },
        {
          problem: "Hard to structure content without rigid schemas",
          solution:
            "Use documents and nested pages as flexible content primitives instead of fighting complex CMS schemas.",
        },
        {
          problem: "Poor internal linking between content pieces",
          solution:
            "Internal linking lets you connect articles, docs, and references naturally – great for knowledge bases and documentation sites.",
        },
        {
          problem: "CMS performance degrades with lots of content",
          solution:
            "Lydie is built to stay fast even with large document collections and long-form content.",
        },
      ],
    },
    workflowExample: {
      title: "Example workflow: using Lydie as a headless CMS for a blog",
      description:
        "How teams use Lydie to power a blog or documentation site with a simple API-based setup.",
      steps: [
        "Write blog posts or docs in Lydie using structured documents",
        "Organize content into folders or sections (e.g. /blog, /docs, /guides)",
        "Fetch published documents via Lydie’s REST API",
        "Render content in your frontend (Next.js, Astro, Nuxt, etc.)",
        "Update content in Lydie and redeploy or revalidate your site",
      ],
    },
    differentiation: {
      title: "How Lydie differs from typical CMS tools",
      points: [
        {
          label: "API-first",
          description:
            "Lydie works as a headless CMS – your frontend is completely decoupled from where content is written.",
        },
        {
          label: "Writer-first experience",
          description:
            "Unlike many CMS dashboards, Lydie is optimized for long-form writing and structured thinking.",
        },
        {
          label: "Docs-as-content model",
          description:
            "Documents double as both internal knowledge and publishable content for blogs and docs.",
        },
        {
          label: "Built-in internal linking",
          description: "Create connected content systems instead of isolated CMS pages.",
        },
      ],
    },
    sections: [
      {
        id: "opensource",
        title: "Fully open-source",
        description:
          "Lydie is open-source under the AGPL license. We strive to keep our code as transparent as possible and gladly accept contributions.",
      },
      {
        id: "search",
        title: "Manage content at scale",
        description:
          "Instant search across all content makes it easy to maintain large blogs or documentation libraries.",
      },
      {
        id: "assistant",
        title: "Speed up content production",
        description:
          "Use the AI assistant to draft, summarize, and restructure content before publishing it through your API.",
      },
    ],
    faqs: [
      {
        question: "Can Lydie be used as a headless CMS?",
        answer:
          "Yes. Lydie exposes your documents through a REST API, allowing you to fetch and render content on any website or app.",
      },
      {
        question: "What can I build with Lydie as a CMS?",
        answer:
          "You can power blogs, documentation sites, marketing pages, changelogs, or even lightweight help centers using Lydie as a content backend.",
      },
      {
        question: "Is Lydie a replacement for traditional CMSs?",
        answer:
          "Not entirely. Lydie works best for smaller sites, blogs, documentation, and other text-heavy content. If you need fine-grained control over many small UI elements, complex content models, or highly custom publishing workflows, a traditional CMS is likely a better fit.",
      },
    ],
    blogPosts: [],
  },
  {
    slug: "documentation",
    terms: {
      act: "documentation",
    },
    hero: {
      title: "Documentation that actually gets written and maintained",
      description:
        "Documentation should be easy to create, quick to find, and painless to maintain. Lydie gives you a fast, structured workspace for writing product docs, API references, process documentation, and team knowledge bases.",
    },
    thumbnail: {
      title: "Documentation",
      description: "Write and maintain documentation that stays useful. Connected, searchable, and built to last.",
    },
    meta: {
      title: "Documentation Tool for Teams & Products",
      description:
        "Create product docs, API references, and team knowledge bases that stay connected, searchable, and easy to maintain.",
    },
    statement:
      "Documentation dies when writing feels painful. Lydie removes the friction so your team actually writes docs, keeps them current, and can find them when needed.",
    problemsAndSolutions: {
      title: "Common documentation problems (and how Lydie solves them)",
      problems: [
        {
          problem: "Docs are scattered across tools and formats",
          solution: "Everything lives in one searchable workspace with nested pages and clear structure.",
        },
        {
          problem: "Documentation gets outdated quickly",
          solution: "Fast, intuitive editing means updating docs feels effortless, not like a chore.",
        },
        {
          problem: "Hard to find the right information when needed",
          solution: "Powerful search and internal linking make any document discoverable in seconds.",
        },
        {
          problem: "No clear structure or organization",
          solution: "Use nested pages and internal links to create logical, navigable documentation hierarchies.",
        },
        {
          problem: "Large docs become slow and unwieldy",
          solution: "Lydie stays fast even with extensive documentation and long-form content.",
        },
      ],
    },
    workflowExample: {
      title: "Example workflow: building a product documentation system",
      description:
        "See how teams use Lydie to create and maintain comprehensive documentation that stays current and useful.",
      steps: [
        "Create a structured hierarchy with overview, guides, and reference docs",
        "Write documentation in Lydie with fast, distraction-free editing",
        "Link related docs together so users can navigate naturally",
        "Use AI to draft, expand, and clarify documentation content",
        "Keep docs current with quick updates that don't feel like overhead",
      ],
    },
    differentiation: {
      title: "How Lydie differs from typical documentation tools",
      points: [
        {
          label: "Fast writing experience",
          description: "Documentation gets written because the editor feels fast and responsive.",
        },
        {
          label: "Internal linking",
          description: "Connect docs naturally so users can follow their curiosity and find related content.",
        },
        {
          label: "Structured hierarchy",
          description: "Nested pages provide clear organization without rigid folder constraints.",
        },
        {
          label: "AI assistance",
          description: "Draft new docs, expand outlines, and clarify complex sections with AI help.",
        },
      ],
    },
    sections: [
      {
        id: "search",
        title: "Find docs instantly",
        description:
          "Powerful search across all documentation makes it easy to find what you need, even in large knowledge bases.",
      },
      {
        id: "linking",
        title: "Connect documentation",
        description:
          "Link related docs together to create navigable documentation that users can explore naturally.",
      },
      {
        id: "assistant",
        title: "Speed up documentation",
        description:
          "Use AI to draft new docs, expand on outlines, and clarify complex sections so documentation stays current.",
      },
    ],
    featuredRoles: {
      "product-managers": true,
      designers: true,
      developers: true,
    },
    faqs: [
      {
        question: "Is Lydie good for product documentation?",
        answer:
          "Yes. Lydie is designed for long-form structured documents, making it ideal for product docs, guides, and references. The fast editor and internal linking help you create comprehensive documentation.",
      },
      {
        question: "Can I use Lydie for API documentation?",
        answer:
          "Yes. While not a dedicated API docs tool, Lydie works well for writing API guides, endpoint documentation, and integration guides. You can structure docs hierarchically and link related endpoints.",
      },
      {
        question: "How does Lydie compare to tools like GitBook or Notion for docs?",
        answer:
          "Lydie is faster and more focused on the writing experience than Notion. Compared to GitBook, Lydie gives you more flexibility in structuring your documentation and doesn't lock you into a specific publishing format.",
      },
    ],
    blogPosts: [],
  },
] as const satisfies readonly UseCaseDefinition[];

export type UseCaseSlug = (typeof useCaseDefinitions)[number]["slug"];

export function getUseCaseDefinition(slug: UseCaseSlug | string): UseCaseDefinition | undefined {
  return useCaseDefinitions.find((uc) => uc.slug === slug);
}

export function getAllUseCaseSlugs(): UseCaseSlug[] {
  return useCaseDefinitions.map((uc) => uc.slug);
}

export function getAllUseCaseDefinitions(): readonly UseCaseDefinition[] {
  return useCaseDefinitions;
}
