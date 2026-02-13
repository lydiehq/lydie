import type { DemoState } from "../components/landing/DemoStateSelector";
import type { Comparison } from "./comparisons";
import type { SectionInput } from "./sections";

export interface FAQItem {
  question: string;
  answer: string;
}

/**
 * Featured use cases for a role.
 * Keys are use case slugs, values can be:
 * - true: use default description from the use case
 * - string: use this custom description
 */
export type FeaturedUseCases = Record<string, true | string>;

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
  meta: {
    title: string;
    description?: string;
  };
  painPoints: string[];
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
  /**
   * Sections to display on the role page.
   * Can be section IDs (e.g., "assistant", "opensource") or objects with overrides.
   */
  sections?: SectionInput[];
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
  /**
   * Featured use cases to display on the role page.
   * These are more prominent than auto-linked use cases.
   * Keys are use case slugs, values can be true (for default description)
   * or a custom description string.
   */
  featuredUseCases?: FeaturedUseCases;
  /**
   * Array of article slugs from our blog.
   * These will be displayed on the role page.
   */
  blogPosts?: string[];
}

export const roles = [
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
    featuredUseCases: {
      "note-taking": true,
    },
    comparison: {
      slug: "notion",
      description:
        "Unlike Notion which slows down with large documents, Lydie gives you fast performance, powerful AI assistance, and seamless teamwork, all while keeping your research private and secure.",
    },
    faqs: [
      {
        question: "How can researchers use Lydie?",
        answer:
          "Researchers use Lydie to organize literature reviews, take notes on papers, track research projects, and synthesize findings. Create pages for each paper with your notes and highlights. Link related concepts across your knowledge base.",
      },
      {
        question: "Can I use Lydie for academic writing?",
        answer:
          "Yes. Lydie works well for organizing your thoughts before writing. Create outlines, draft sections, and keep your sources organized. Export your work when you're ready to format it for submission.",
      },
      {
        question: "How does AI help with research?",
        answer:
          "Lydie's AI can summarize academic papers, help you understand complex concepts, suggest connections between different sources, and assist with synthesizing findings across multiple documents.",
      },
      {
        question: "Can I collaborate with my research team?",
        answer:
          "Yes. Share pages or entire spaces with collaborators. Work together on literature reviews, methodology sections, or data analysis. Comments and real-time collaboration make it easy to give and receive feedback.",
      },
    ],
    ctaText: "Try Lydie for research",
    relatedFeatures: ["assistant", "search", "linking", "collaborative-editing"],
  },
  {
    slug: "students",
    shortTitle: "Students",
    terms: {
      actor: "student",
      actorPlural: "students",
    },
    hero: {
      title: "A writing workspace that keeps up with student life",
      description:
        "Notes, essays, and study materials scattered across apps make it hard to focus. Lydie gives you one place to capture lecture notes, connect ideas across courses, and get your writing done, without the clutter.",
    },
    meta: {
      title: "Writing Workspace for Students",
    },
    painPoints: [
      "Notes and sources scattered across Google Docs, Notion, and random files",
      "Losing track of what you wrote for which course or assignment",
      "Struggling to connect ideas across lectures and readings",
      "Group projects that live in messy shared folders and endless threads",
    ],
    featuredUseCases: {
      "note-taking": true,
    },
    comparison: {
      slug: "evernote",
      description:
        "Lydie is an ideal alternative to Evernote for students, as it brings a simpler, more focused writing experience with linked notes and AI assistance for organizing coursework and drafting.",
    },
    faqs: [
      {
        question: "Is Lydie free?",
        answer:
          "Yes, Lydie is free to use. It includes unlimited documents, pages and collaborators and a generous amount of AI requests.",
      },
      {
        question: "How can students use Lydie?",
        answer:
          "Students use Lydie to take lecture and reading notes, organize coursework by class or topic, draft essays and papers, and collaborate on group projects. You can link notes across courses to see connections and resurface ideas when writing.",
      },
      {
        question: "Is Lydie good for essay writing?",
        answer:
          "Yes. Use Lydie to outline, draft, and revise. Keep your sources and notes linked so you can reference them as you write. AI can help with structure and clarity while you stay in control of the content.",
      },
      {
        question: "Can I use Lydie for group projects?",
        answer:
          "Yes. Share pages or spaces with classmates. Edit together in real time, leave comments, and keep everything in one place instead of scattered across drives and chat.",
      },
      {
        question: "How does Lydie help with studying?",
        answer:
          "Your notes become searchable and linked. Find anything quickly, see how concepts connect across courses, and use the AI assistant to summarize long readings or clarify ideas when you're reviewing.",
      },
    ],
    ctaText: "Try Lydie for student life",
    relatedFeatures: ["assistant", "search", "linking", "collaborative-editing"],
    templateSlugs: ["study-guide-xUnXnq"],
  },
  {
    slug: "developers",
    shortTitle: "Developers",
    terms: {
      actor: "developer",
      actorPlural: "developers",
    },
    hero: {
      title: "A writing workspace developers actually enjoy using",
      description:
        "Docs, specs, and ideas shouldn't be scattered across five different tools. Lydie gives developers a fast, intuitive, and extendable workspace to think clearly, document decisions, and build shared knowledge right next to their code.",
    },
    meta: {
      title: "The Best Writing Workspace for Developers",
    },
    painPoints: [
      "Docs scattered across Notion, README files, and random Google Docs",
      "Outdated documentation that no one trusts",
      "Losing architectural context over time",
      "Hard to onboard new teammates without repeating yourself",
    ],
    featuredUseCases: {
      "note-taking": true,
    },
    comparison: {
      slug: "confluence",
      description:
        "Tired of wrestling with Confluence's enterprise complexity? Lydie offers a lightweight, developer-friendly documentation platform with built-in AI, API access, and GitHub sync. Get all the power you need for technical docs without the enterprise bloat, vendor lock-in, and per-user pricing.",
    },
    faqs: [
      {
        question: "How do developers use Lydie?",
        answer:
          "Developers use Lydie to write technical documentation, RFCs, design docs, meeting notes, and [personal knowledge bases](/use-cases/personal-knowledge-base).",
      },
      {
        question: "Is Lydie a replacement for README files?",
        answer:
          "Not exactly. README files are great for quick project context, while Lydie is better for longer-form docs like architecture notes, ADRs, onboarding guides, and evolving system documentation.",
      },
      {
        question: "Can Lydie be used as an internal developer wiki?",
        answer:
          "Yes. Teams use Lydie as a lightweight internal knowledge base for engineering docs, onboarding guides, and technical decisions. Pages stay fast and searchable even as your documentation grows.",
      },
      {
        question: "How does AI help developers?",
        answer:
          "AI can help summarize long docs, turn rough notes into clearer explanations, draft outlines for RFCs, and surface related pages when you’re writing or exploring your knowledge base.",
      },
    ],
    ctaText: "Try Lydie for developers",
    relatedFeatures: ["assistant", "search", "linking", "collaborative-editing"],
    templateSlugs: [],
  },
  {
    slug: "product-managers",
    shortTitle: "Product Managers",
    terms: {
      actor: "product manager",
      actorPlural: "product managers",
    },
    hero: {
      title: "A workspace built for product thinking",
      description:
        "Product managers need to balance strategy, user feedback, and execution. Lydie helps you organize PRDs, track decisions, and keep your team aligned with structured, connected documentation.",
    },
    meta: {
      title: "Writing Workspace for Product Managers",
      description:
        "Write PRDs, track decisions, and align your team with structured documentation that connects.",
    },
    painPoints: [
      "Product requirements scattered across docs, slides, and tools",
      "Decisions get lost in Slack threads and meeting notes",
      "No single source of truth for product context",
      "Difficult to onboard new team members with scattered information",
    ],
    featuredUseCases: {
      "note-taking": true,
      documentation: true,
    },
    comparison: {
      slug: "confluence",
      description:
        "Escape Confluence's enterprise complexity and pricing. Lydie gives product managers a modern, AI-powered documentation platform to write PRDs, track decisions, and keep teams aligned. No more fighting with slow, clunky enterprise software just to document your product vision.",
    },
    faqs: [
      {
        question: "How can product managers use Lydie?",
        answer:
          "Product managers use Lydie to write product requirement documents, track strategic decisions, organize user research, and maintain a shared knowledge base for their team. Link PRDs to user feedback, market research, and technical specs for full context.",
      },
      {
        question: "Is Lydie good for PRDs?",
        answer:
          "Yes. Lydie is designed for long-form structured documents like PRDs. Create nested pages for features, link to related documents, and use AI to help structure and clarify your thinking.",
      },
      {
        question: "Can I collaborate with my team on product docs?",
        answer:
          "Yes. Share pages or spaces with engineers, designers, and stakeholders. Work together in real time with comments and collaborative editing. Keep everyone aligned with a single source of truth.",
      },
      {
        question: "How does AI help product managers?",
        answer:
          "AI can help draft PRDs from rough notes, summarize user feedback, clarify ambiguous requirements, and suggest connections between related documents. Use it to speed up your writing without losing your voice.",
      },
    ],
    ctaText: "Try Lydie for product management",
    relatedFeatures: ["assistant", "search", "linking", "collaborative-editing"],
  },
  {
    slug: "designers",
    shortTitle: "Designers",
    terms: {
      actor: "designer",
      actorPlural: "designers",
    },
    hero: {
      title: "A writing workspace built for design thinking",
      description:
        "Designers need to document processes, rationale, and research. Lydie helps you organize design docs, connect research to decisions, and collaborate with your team on a shared understanding.",
    },
    meta: {
      title: "Writing Workspace for Designers",
      description:
        "Document design processes, connect research to decisions, and collaborate on shared understanding. Built for UX, product, and visual designers.",
    },
    painPoints: [
      "Design rationale and decisions scattered across Figma comments and Slack",
      "Research findings get lost and are hard to reference later",
      "No structured way to document design system decisions",
      "Difficult to align with product and engineering on design intent",
    ],
    featuredUseCases: {
      "note-taking": true,
      documentation: true,
    },
    comparison: {
      slug: "notion",
      description:
        "Lydie gives designers a fast, focused writing experience for design docs and research. No complex databases or slow performance, just structured, connected documentation.",
    },
    faqs: [
      {
        question: "How can designers use Lydie?",
        answer:
          "Designers use Lydie to document design systems, write UX research summaries, track design decisions, and organize project documentation. Create structured pages that link design rationale, user research, and project context together.",
      },
      {
        question: "Is Lydie good for design documentation?",
        answer:
          "Yes. Lydie is perfect for design docs, research summaries, and design system documentation. Link related pages, organize by project or component, and use AI to help structure your thoughts.",
      },
      {
        question: "Can I collaborate with my design team?",
        answer:
          "Yes. Share design docs, research, and documentation with your team. Collaborate in real time with comments and collaborative editing. Keep design context and rationale accessible to everyone.",
      },
      {
        question: "How does AI help with design documentation?",
        answer:
          "AI can help summarize user research, draft design rationale, clarify documentation structure, and suggest connections between related design decisions and research findings.",
      },
    ],
    ctaText: "Try Lydie for design work",
    relatedFeatures: ["assistant", "search", "linking", "collaborative-editing"],
  },
  {
    slug: "writers",
    shortTitle: "Writers",
    terms: {
      actor: "writer",
      actorPlural: "writers",
    },
    hero: {
      title: "A writing workspace built for serious writers",
      description:
        "Writers need a workspace that gets out of the way and lets ideas flow. Lydie gives you a fast, distraction-free environment for drafting, organizing research, and building a body of work that grows over time.",
    },
    meta: {
      title: "Writing Workspace for Writers",
      description:
        "Draft articles, organize research, and build a connected writing practice. Built for bloggers, authors, and content creators.",
    },
    painPoints: [
      "Ideas scattered across notebooks, apps, and random files",
      "Research and sources hard to reference while writing",
      "No good way to connect related articles and themes",
      "Slow, bloated tools that interrupt the writing flow",
    ],
    featuredUseCases: {
      "note-taking": true,
      "personal-knowledge-base": true,
    },
    comparison: {
      slug: "notion",
      description:
        "Unlike Notion which slows down and distracts with database features, Lydie gives writers a fast, focused writing experience designed for long-form content creation.",
    },
    faqs: [
      {
        question: "How can writers use Lydie?",
        answer:
          "Writers use Lydie to draft articles, organize research materials, track article ideas, and build a personal knowledge base of topics and themes. Link related articles together to see how ideas develop over time.",
      },
      {
        question: "Is Lydie good for long-form writing?",
        answer:
          "Yes. Lydie is built for substantial writing projects. The fast editor stays responsive even with long articles, and the clean interface helps you focus on your words without distractions.",
      },
      {
        question: "Can I organize research in Lydie?",
        answer:
          "Yes. Create pages for research notes, sources, and references. Link them to your drafts so you can easily cite and reference your research while writing. Use AI to help summarize and synthesize research materials.",
      },
      {
        question: "How does AI help writers?",
        answer:
          "AI can help overcome writer's block, suggest improvements to your drafts, summarize research materials, and find connections between your articles. It assists your writing without taking over your voice.",
      },
    ],
    ctaText: "Try Lydie for writing",
    relatedFeatures: ["assistant", "search", "linking"],
  },
  {
    slug: "engineering-managers",
    shortTitle: "Engineering Managers",
    terms: {
      actor: "engineering manager",
      actorPlural: "engineering managers",
    },
    hero: {
      title: "A workspace for engineering leadership",
      description:
        "Engineering managers need to track team decisions, document processes, and keep technical context organized. Lydie helps you maintain team knowledge, write effective docs, and stay aligned with your engineers.",
    },
    meta: {
      title: "Writing Workspace for Engineering Managers",
      description:
        "Track team decisions, document processes, and maintain technical knowledge. Built for engineering leaders who value clear communication.",
    },
    painPoints: [
      "Team decisions and context scattered across meetings and Slack",
      "Onboarding new engineers requires repeating the same information",
      "Technical documentation gets outdated and loses trust",
      "No single source of truth for team processes and decisions",
    ],
    featuredUseCases: {
      "note-taking": true,
      documentation: true,
    },
    comparison: {
      slug: "confluence",
      description:
        "Escape Confluence's complexity and slow performance. Lydie gives engineering managers a lightweight, fast platform for team docs and decision tracking that engineers actually enjoy using.",
    },
    faqs: [
      {
        question: "How can engineering managers use Lydie?",
        answer:
          "Engineering managers use Lydie to document team processes, track architectural decisions, maintain onboarding guides, and organize meeting notes. Create a shared knowledge base that helps your team stay aligned and reduces repetitive explanations.",
      },
      {
        question: "Is Lydie good for team documentation?",
        answer:
          "Yes. Lydie is designed for technical documentation that teams actually maintain. The fast editor means updating docs isn't a chore, and internal linking helps connect related processes and decisions.",
      },
      {
        question: "Can I use Lydie for 1:1 notes and team meetings?",
        answer:
          "Yes. Create structured pages for 1:1s, team meetings, and retrospectives. Link notes to relevant documentation and track action items over time. Everything stays organized and searchable.",
      },
      {
        question: "How does AI help engineering managers?",
        answer:
          "AI can help summarize meeting notes, draft process documentation, clarify technical explanations, and suggest connections between related docs. Use it to speed up documentation while keeping it accurate and useful.",
      },
    ],
    ctaText: "Try Lydie for engineering leadership",
    relatedFeatures: ["assistant", "search", "linking", "collaborative-editing"],
    templateSlugs: [
      "11-meeting-notes-template-13iQau",
      "classic-meeting-notes-template-PB2be8",
      "standard-operating-procedure-88H9qV",
    ],
  },
] as const satisfies readonly Role[];

export type RoleSlug = (typeof roles)[number]["slug"];

export function getRole(slug: RoleSlug | string): Role | undefined {
  return roles.find((role) => role.slug === slug);
}

export function getAllRoleSlugs(): RoleSlug[] {
  return roles.map((role) => role.slug);
}

export function getAllRoles(): readonly Role[] {
  return roles;
}
