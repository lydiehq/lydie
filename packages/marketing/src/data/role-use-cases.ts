import type { DemoState } from "../components/landing/DemoStateSelector";
import type { Role, RoleSlug } from "./roles";
import type { SectionInput } from "./sections";
import type { UseCaseDefinition, UseCaseSlug } from "./use-case-definitions";

import { getAllRoles } from "./roles";
import { getAllUseCaseDefinitions } from "./use-case-definitions";

export interface RoleUseCaseContent {
  roleSlug: RoleSlug;
  useCaseSlug: UseCaseSlug;
  hero: {
    title: string;
    description: string;
  };
  meta: {
    title: string;
    description?: string;
  };
  thumbnail: {
    title: string;
    description: string;
  };
  content: string[];
  examples: {
    title: string;
    description: string;
  }[];
  faqs: {
    question: string;
    answer: string;
  }[];
  /**
   * Sections to showcase on the role+use case page.
   * Can be section IDs (e.g., "assistant", "opensource") or objects with overrides.
   */
  sections: SectionInput[];
  /**
   * Template slugs to display on the role+use case page.
   * Up to 3 templates will be shown. If empty or not provided, no section is shown.
   */
  templateSlugs?: string[];
  /**
   * Demo states to show in the interactive demo section.
   * If not provided, defaults to all states.
   */
  demoStates?: DemoState[];
  /**
   * A statement about why Lydie is great for this role+use case combination.
   * Displayed between the hero and features sections.
   */
  statement?: string;
  /**
   * Common problems with this use case for this role and how Lydie solves them.
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
   * Array of article slugs from our blog.
   * These will be displayed on the role+use case page.
   */
  blogPosts?: string[];
}

export const roleUseCaseContent: RoleUseCaseContent[] = [
  {
    roleSlug: "researchers",
    useCaseSlug: "note-taking",
    meta: {
      title: "The Best Note-taking App for Researchers",
    },
    hero: {
      title: "Make your research notes work together",
      description:
        "Take better research notes with a tool designed for academics. Organize literature reviews, capture insights, and build connections.",
    },
    thumbnail: {
      title: "Note-taking",
      description:
        "Take better research notes with a tool designed for academics. Organize literature reviews, capture insights, and build connections.",
    },
    content: [
      "Research generates an enormous amount of information. Without a proper system, it's easy to lose track of what you've read and what you've learned. Lydie gives you a structured place to capture, organize, and connect your research notes.",
      "Create a page for each paper you read. Jot down key findings, methodologies, and your own insights. Use nested pages to organize by topic, project, or course. Link related papers together to discover connections and patterns.",
      "With powerful search, you can find that paper you read six months ago in seconds. Never lose track of important research again. Your notes become a living, growing body of knowledge.",
    ],
    examples: [
      {
        title: "Literature Notes",
        description:
          "Create structured notes for each paper with key findings, methodologies, and your insights",
      },
      {
        title: "Research Logs",
        description: "Document your research process, experiments, and observations over time",
      },
      {
        title: "Reading Lists",
        description: "Track papers to read, with notes and priorities",
      },
    ],
    sections: ["assistant", "linking", "search"],
    faqs: [],
    workflowExample: {
      title: "Example workflow: capturing and connecting research notes",
      description:
        "See how researchers use Lydie to turn scattered reading notes into a connected knowledge base.",
      steps: [
        "Create a page for each paper with structured fields for key findings",
        "Link related papers together using internal linking",
        "Use search to resurface relevant notes when writing",
        "Build concept pages that synthesize across multiple sources",
      ],
    },
    differentiation: {
      title: "How Lydie differs from typical research note-taking tools",
      points: [
        {
          label: "Built for long-form academic writing",
          description:
            "Not just quick captures, designed for substantial research notes and analysis.",
        },
        {
          label: "Designed for internal linking",
          description: "Connect papers, concepts, and notes naturally to build a web of knowledge.",
        },
        {
          label: "Fast with large documents",
          description: "Performance stays snappy even with extensive literature reviews.",
        },
        {
          label: "AI-powered synthesis",
          description: "Use AI to summarize papers and find connections across your research.",
        },
      ],
    },
  },
  {
    roleSlug: "students",
    useCaseSlug: "note-taking",
    meta: {
      title: "The Best Note-taking App for Students",
    },
    hero: {
      title: "The perfect note-taking environment for students",
      description:
        "Note-taking should be frictionless. Lydie provides the perfect balance of simplicity, structure and speed needed to take efficient notes during lectures and study sessions.",
    },
    thumbnail: {
      title: "Note-taking",
      description:
        "Take better notes, organize coursework, and write with confidence. Built for students who think in connections, not folders.",
    },
    content: [
      "Research generates an enormous amount of information. Without a proper system, it's easy to lose track of what you've read and what you've learned. Lydie gives you a structured place to capture, organize, and connect your research notes.",
      "Create a page for each paper you read. Jot down key findings, methodologies, and your own insights. Use nested pages to organize by topic, project, or course. Link related papers together to discover connections and patterns.",
      "With powerful search, you can find that paper you read six months ago in seconds. Never lose track of important research again. Your notes become a living, growing body of knowledge.",
    ],
    examples: [
      {
        title: "Literature Notes",
        description:
          "Create structured notes for each paper with key findings, methodologies, and your insights",
      },
      {
        title: "Research Logs",
        description: "Document your research process, experiments, and observations over time",
      },
      {
        title: "Reading Lists",
        description: "Track papers to read, with notes and priorities",
      },
    ],
    sections: [
      {
        id: "assistant",
        description:
          "Lydie's built-in AI assistant makes it the ideal AI note-taking tool for students. Quickly summarize long readings, clarify concepts, and get writing suggestions when you're stuck.",
      },
      "linking",
      {
        id: "search",
        title: "Never lose track of your notes again",
        description:
          "Quickly surface notes from previous lectures or readings. Lydie's command menu is always a single keystroke away.",
      },
    ],
    faqs: [
      {
        question: "Can I collaborate on notes with my classmates?",
        answer:
          "Yes. Lydie supports real-time collaboration. Just invite your classmates to the page and start collaborating right away. See more about our collaboration features [here](/features/collaboration).",
      },
    ],
    workflowExample: {
      title: "Example workflow: from lecture notes to essay",
      description:
        "See how students use Lydie to turn scattered notes into connected material you can actually use.",
      steps: [
        "Take notes in a page per lecture or reading, organized by course",
        "Link related concepts across courses so connections are explicit",
        "Use search to pull up relevant notes when drafting an essay",
        "Use AI to summarize long readings or clarify concepts when revising",
      ],
    },
    differentiation: {
      title: "How Lydie differs from typical student note-taking tools",
      points: [
        {
          label: "Built for long-form notes and essays",
          description: "Designed for substantial course notes and drafts, not just quick scraps.",
        },
        {
          label: "Connect ideas across courses",
          description: "Internal linking lets you see how concepts from different classes relate.",
        },
        {
          label: "Fast with heavy course loads",
          description: "Stays responsive even with lots of pages and long documents.",
        },
        {
          label: "AI that helps without doing the work for you",
          description:
            "Summarize readings, clarify ideas, and improve structure while you stay in control.",
        },
      ],
    },
    templateSlugs: [
      "cornell-note-taking-system-nWCg9h",
      "lecture-notes-E9CVwq",
      "study-guide-xUnXnq",
    ],
  },
  {
    roleSlug: "developers",
    useCaseSlug: "note-taking",
    meta: {
      title: "The Best Note-taking App for Developers",
    },
    hero: {
      title: "Note-taking that fits how developers work",
      description:
        "Capture meeting notes, design decisions, and RFC ideas in one fast workspace. Link specs to code context, resurface past decisions, and keep your team's knowledge in sync.",
    },
    thumbnail: {
      title: "Note-taking",
      description:
        "Capture meeting notes, design decisions, and RFC ideas. Link specs, resurface context, and keep technical knowledge in one place.",
    },
    content: [
      "Developers juggle meeting notes, design docs, RFCs, and ADRs. When these live in scattered tools or stale READMEs, context gets lost and decisions get repeated. Lydie gives you a single workspace to capture technical notes, link them to each other, and find them when you need them.",
      "Take notes in standups, architecture reviews, or incident postmortems. Create pages for each project or system. Link related decisions, specs, and meeting outcomes so the next person (or future you) can trace the full picture.",
      "Powerful search and internal linking mean you can resurface that design discussion from three months ago in seconds.",
    ],
    examples: [
      {
        title: "Meeting notes",
        description:
          "Capture standup notes, architecture review outcomes, and postmortem learnings in structured pages",
      },
      {
        title: "RFCs and design docs",
        description:
          "Draft and iterate on RFCs and design docs with linked context and versioned thinking",
      },
      {
        title: "ADRs and decisions",
        description:
          "Document architectural decisions and link them to relevant specs and code areas",
      },
    ],
    sections: [
      {
        id: "opensource",
        description:
          "Lydie is fully open-source under the AGPL license. We strive to keep our code as transparent as possible and gladly accept contributions.",
      },
      {
        id: "assistant",
        description:
          "Use the AI assistant to summarize long meeting notes, turn rough bullet points into clear decisions, and draft outlines for RFCs.",
      },
      {
        id: "search",
        title: "Resurface context in seconds",
        description:
          "Find any past note, decision, or spec via the command menu. No more digging through folders or outdated wikis.",
      },
    ],
    faqs: [
      {
        question: "Can I use Lydie for technical meeting notes?",
        answer:
          "Yes. Lydie is an ideal tool for standups, architecture reviews, and postmortems. Link notes to relevant specs or ADRs so context stays connected.",
      },
      {
        question: "How does note-taking fit with our existing docs?",
        answer:
          "Lydie works alongside READMEs and wikis. Use it for evolving notes, meeting outcomes, and design discussions that you want to link and search, without slowing down as the doc grows.",
      },
    ],
    workflowExample: {
      title: "Example workflow: from meeting notes to documented decisions",
      description:
        "See how developers use Lydie to turn meeting notes into linked, searchable team knowledge.",
      steps: [
        "Capture meeting notes in a page per meeting or project",
        "Link related ADRs, specs, and past notes so context is explicit",
        "Use search to pull up relevant decisions when writing a new RFC",
        "Use AI to summarize long threads or draft decision summaries",
      ],
    },
    differentiation: {
      title: "How Lydie differs from typical developer note-taking",
      points: [
        {
          label: "Built for long-form technical writing",
          description:
            "Designed for specs, RFCs, and meeting notes that grow, stays fast instead of bogging down.",
        },
        {
          label: "Link decisions to context",
          description:
            "Internal linking connects meeting outcomes, ADRs, and specs so nothing lives in isolation.",
        },
        {
          label: "Fast with large docs",
          description:
            "Performance stays snappy even with hundreds of pages and long technical documents.",
        },
        {
          label: "AI that helps without replacing you",
          description:
            "Summarize meetings, clarify bullet points, and draft outlines while you own the content.",
        },
      ],
    },
  },
  {
    roleSlug: "product-managers",
    useCaseSlug: "note-taking",
    meta: {
      title: "The Best Note-taking App for Product Managers",
    },
    hero: {
      title: "Note-taking that keeps up with product thinking",
      description:
        "Product managers need to capture user feedback, track decisions, and organize research. Lydie gives you a fast, structured workspace that connects your notes and resurfaces them when you need them.",
    },
    thumbnail: {
      title: "Note-taking",
      description:
        "Capture user feedback, track decisions, and organize research notes. Build a connected knowledge base for your product work.",
    },
    content: [
      "Product management generates a constant stream of information, user interviews, competitive research, stakeholder feedback, and strategic decisions. Without a proper system, critical insights get lost in scattered notes and forgotten documents.",
      "Use Lydie to create structured notes for user research sessions, competitive analysis, and product decisions. Link related notes together so you can trace the full context behind any decision or feature.",
      "With powerful search, you can find that user interview from three months ago or the rationale behind a past decision in seconds. Your notes become a living, searchable knowledge base that supports better product decisions.",
    ],
    examples: [
      {
        title: "User research notes",
        description:
          "Capture insights from user interviews, usability tests, and feedback sessions with structured notes",
      },
      {
        title: "Decision logs",
        description:
          "Document product decisions, trade-offs, and rationale with links to context and research",
      },
      {
        title: "Stakeholder feedback",
        description:
          "Track feedback from sales, support, and leadership with organized notes and priorities",
      },
    ],
    sections: ["assistant", "linking", "search"],
    faqs: [
      {
        question: "How do product managers take better notes?",
        answer:
          "Create structured pages for different types of notes, user research, decisions, feedback. Link related notes together and use search to resurface context when making decisions. AI can help summarize long feedback threads or organize scattered thoughts.",
      },
    ],
    workflowExample: {
      title: "Example workflow: from user interview to product decision",
      description:
        "See how product managers use Lydie to turn scattered research notes into structured product knowledge.",
      steps: [
        "Take structured notes during user interviews with key insights and quotes",
        "Link research notes to feature ideas, competitive analysis, and decisions",
        "Use search to pull up relevant research when prioritizing features",
        "Use AI to synthesize feedback across multiple interviews and draft decision rationale",
      ],
    },
    differentiation: {
      title: "How Lydie differs from typical note-taking tools for PMs",
      points: [
        {
          label: "Built for structured product notes",
          description:
            "Designed for research summaries, decision logs, and strategic notes that connect.",
        },
        {
          label: "Connect research to decisions",
          description:
            "Internal linking lets you trace the full context behind any product decision.",
        },
        {
          label: "Fast with extensive notes",
          description:
            "Performance stays snappy even with hundreds of research notes and documents.",
        },
        {
          label: "AI for synthesis and structure",
          description:
            "Summarize research, draft decision rationale, and find connections across notes.",
        },
      ],
    },
  },
  {
    roleSlug: "product-managers",
    useCaseSlug: "documentation",
    meta: {
      title: "Documentation Tool for Product Managers",
    },
    hero: {
      title: "Product documentation that actually gets read and updated",
      description:
        "Write PRDs, track decisions, and maintain product documentation that stays current and useful. Lydie helps you create structured, connected docs that your team will actually use.",
    },
    thumbnail: {
      title: "Documentation",
      description:
        "Write PRDs, track decisions, and maintain product documentation that stays current and useful.",
    },
    content: [
      "Product documentation often dies in scattered documents, outdated wikis, and forgotten specs. When PRDs and decisions live in different tools, context gets lost and teams lose alignment.",
      "Lydie gives you a single workspace for product documentation, PRDs, decision logs, research summaries, and team processes. Create structured pages that link together to form a complete picture of your product.",
      "The fast, intuitive editor means updating docs doesn't feel like a chore. Use AI to help draft PRDs from rough notes, clarify requirements, and expand on outlines. Documentation stays current because it's easy to maintain.",
    ],
    examples: [
      {
        title: "Product Requirement Documents",
        description:
          "Write comprehensive PRDs with user stories, requirements, and acceptance criteria",
      },
      {
        title: "Decision logs",
        description:
          "Document product decisions with context, rationale, and trade-offs for future reference",
      },
      {
        title: "Team processes",
        description: "Document workflows, rituals, and guidelines so your team stays aligned",
      },
    ],
    sections: ["assistant", "linking", "search"],
    faqs: [
      {
        question: "Is Lydie good for writing PRDs?",
        answer:
          "Yes. Lydie is designed for long-form structured documents like PRDs. Use nested pages for complex features, link to research and decisions, and use AI to help structure and clarify requirements.",
      },
      {
        question: "How do I keep documentation current?",
        answer:
          "The fast editor makes updates feel effortless. Link docs to related pages so context stays connected. Use AI to help expand and clarify sections. Make documentation a living document that evolves with your product.",
      },
    ],
    workflowExample: {
      title: "Example workflow: writing and maintaining product documentation",
      description:
        "See how product managers use Lydie to create documentation that stays current and useful.",
      steps: [
        "Create structured PRDs with user stories, requirements, and acceptance criteria",
        "Link PRDs to user research, competitive analysis, and related decisions",
        "Share docs with engineering and design for review and feedback",
        "Update docs as requirements change with fast, intuitive editing",
        "Use AI to expand on outlines, clarify ambiguous requirements, and draft sections",
      ],
    },
    differentiation: {
      title: "How Lydie differs from typical documentation tools",
      points: [
        {
          label: "Fast, writer-focused experience",
          description:
            "Documentation gets written because the editor is fast and doesn't get in your way.",
        },
        {
          label: "Connected documentation",
          description:
            "Link PRDs, research, and decisions together so context is always accessible.",
        },
        {
          label: "Structured hierarchy",
          description: "Nested pages provide clear organization for complex products and features.",
        },
        {
          label: "AI assistance",
          description: "Draft PRDs, expand outlines, and clarify requirements with AI help.",
        },
      ],
    },
  },
  {
    roleSlug: "designers",
    useCaseSlug: "note-taking",
    meta: {
      title: "The Best Note-taking App for Designers",
    },
    hero: {
      title: "Note-taking that supports design thinking",
      description:
        "Designers need to capture research insights, track design decisions, and organize their thinking. Lydie gives you a fast, flexible workspace for design notes that connect and resurface when needed.",
    },
    thumbnail: {
      title: "Note-taking",
      description:
        "Capture research insights, track design decisions, and organize design thinking in a connected workspace.",
    },
    content: [
      "Design work generates a wealth of information, user research insights, competitive analysis, design rationale, and feedback. Without a proper system, valuable insights get buried in Figma comments, Slack threads, and forgotten documents.",
      "Lydie gives you a structured place to capture design research, document decisions, and organize your thinking. Create pages for user interviews, usability tests, and design explorations. Link related notes together to build a connected understanding.",
      "Powerful search means you can find that research insight or design rationale from months ago in seconds. Your notes become a living knowledge base that informs future design decisions.",
    ],
    examples: [
      {
        title: "User research notes",
        description:
          "Capture insights from user interviews, usability tests, and research sessions",
      },
      {
        title: "Design rationale",
        description:
          "Document design decisions with context, trade-offs, and rationale for future reference",
      },
      {
        title: "Competitive analysis",
        description: "Track competitor features, patterns, and insights with organized notes",
      },
    ],
    sections: ["assistant", "linking", "search"],
    faqs: [
      {
        question: "How can designers take better notes?",
        answer:
          "Create structured pages for different types of design notes, research, decisions, explorations. Link related notes together so you can trace the full context behind any design decision. Use AI to help synthesize research and organize scattered thoughts.",
      },
    ],
    workflowExample: {
      title: "Example workflow: from research notes to design decisions",
      description:
        "See how designers use Lydie to turn research insights into structured design knowledge.",
      steps: [
        "Take structured notes during user research with key insights and observations",
        "Link research notes to design decisions, explorations, and rationale",
        "Use search to pull up relevant research when presenting or iterating on designs",
        "Use AI to synthesize findings across multiple sessions and draft design rationale",
      ],
    },
    differentiation: {
      title: "How Lydie differs from typical note-taking for designers",
      points: [
        {
          label: "Built for design research",
          description:
            "Designed for capturing and organizing user research insights and design rationale.",
        },
        {
          label: "Connect research to decisions",
          description: "Internal linking lets you trace the full context behind design choices.",
        },
        {
          label: "Fast with extensive notes",
          description: "Performance stays snappy even with lots of research notes and documents.",
        },
        {
          label: "AI for synthesis and structure",
          description:
            "Summarize research, draft design rationale, and find connections across notes.",
        },
      ],
    },
    blogPosts: [
      "how-to-better-organize-your-notes",
      "note-taking-methods-systems-and-templates-for-capturing-what-matters",
    ],
  },
  {
    roleSlug: "designers",
    useCaseSlug: "documentation",
    meta: {
      title: "Documentation Tool for Designers",
    },
    hero: {
      title: "Design documentation that your team will actually use",
      description:
        "Document design systems, write UX guides, and maintain design documentation that stays current. Lydie helps you create structured, connected docs that support your design practice.",
    },
    thumbnail: {
      title: "Documentation",
      description:
        "Document design systems, write UX guides, and maintain design documentation that stays current.",
    },
    content: [
      "Design documentation often lives in scattered Figma files, outdated wikis, and forgotten docs. When design rationale, research, and guidelines are hard to find, teams lose context and consistency suffers.",
      "Lydie gives you a single workspace for design documentation, design systems, UX guides, research summaries, and project documentation. Create structured pages that link together to form a complete picture of your design practice.",
      "The fast, intuitive editor means updating documentation doesn't feel like a chore. Use AI to help draft guidelines, structure design system docs, and clarify complex sections. Documentation stays current because it's easy to maintain.",
    ],
    examples: [
      {
        title: "Design system documentation",
        description: "Document components, patterns, guidelines, and usage with structured pages",
      },
      {
        title: "UX research summaries",
        description: "Summarize user research findings and link to design decisions and rationale",
      },
      {
        title: "Design process docs",
        description:
          "Document workflows, rituals, and team processes for consistent design practice",
      },
    ],
    sections: ["assistant", "linking", "search"],
    faqs: [
      {
        question: "Is Lydie good for design system documentation?",
        answer:
          "Yes. Lydie is great for documenting design systems, components, and patterns. Use nested pages for organizing components, link to usage examples and rationale, and use AI to help structure guidelines.",
      },
      {
        question: "How do I keep design documentation current?",
        answer:
          "The fast editor makes updates feel effortless. Link docs to related pages so context stays connected. Use AI to help expand and clarify sections. Make documentation a living document that evolves with your design practice.",
      },
    ],
    workflowExample: {
      title: "Example workflow: documenting a design system",
      description:
        "See how design teams use Lydie to create and maintain design system documentation.",
      steps: [
        "Create a structured hierarchy with overview, components, patterns, and guidelines",
        "Document each component with usage, anatomy, and examples",
        "Link components to related patterns, design rationale, and research",
        "Update docs as the system evolves with fast, intuitive editing",
        "Share docs with engineering and product for implementation and reference",
      ],
    },
    differentiation: {
      title: "How Lydie differs from typical design documentation tools",
      points: [
        {
          label: "Fast, writer-focused experience",
          description:
            "Documentation gets written because the editor is fast and doesn't get in your way.",
        },
        {
          label: "Connected documentation",
          description:
            "Link design rationale, research, and guidelines together so context is always accessible.",
        },
        {
          label: "Structured hierarchy",
          description:
            "Nested pages provide clear organization for design systems and complex documentation.",
        },
        {
          label: "AI assistance",
          description: "Draft guidelines, structure docs, and clarify sections with AI help.",
        },
      ],
    },
  },
  {
    roleSlug: "developers",
    useCaseSlug: "documentation",
    meta: {
      title: "Documentation Tool for Developers",
    },
    hero: {
      title: "Technical documentation that stays current and useful",
      description:
        "Write API docs, architecture guides, and team documentation that doesn't go stale. Lydie gives you a fast, structured workspace for technical documentation that your team will actually maintain.",
    },
    thumbnail: {
      title: "Documentation",
      description:
        "Write API docs, architecture guides, and team documentation that stays current and searchable.",
    },
    content: [
      "Technical documentation often dies in stale READMEs, outdated wikis, and scattered documents. When docs are hard to update and harder to find, teams lose context and knowledge walks out the door.",
      "Lydie gives you a single workspace for technical documentation, API guides, architecture decisions, onboarding docs, and team processes. Create structured pages that link together to form a complete technical knowledge base.",
      "The fast, intuitive editor means updating docs doesn't feel like a chore. Use AI to help draft documentation from code comments, clarify complex sections, and expand on outlines. Documentation stays current because it's easy to maintain.",
    ],
    examples: [
      {
        title: "API documentation",
        description: "Document endpoints, request/response formats, and usage examples",
      },
      {
        title: "Architecture decision records",
        description: "Document technical decisions with context, trade-offs, and consequences",
      },
      {
        title: "Onboarding guides",
        description:
          "Create structured guides for new team members with links to relevant resources",
      },
    ],
    sections: [
      {
        id: "opensource",
        description:
          "Lydie is fully open-source under the AGPL license. We strive to keep our code as transparent as possible and gladly accept contributions.",
      },
      {
        id: "assistant",
        description:
          "Use AI to draft docs from rough notes, clarify complex sections, and expand on outlines.",
      },
      {
        id: "search",
        title: "Find docs instantly",
        description:
          "Powerful search across all documentation makes it easy to find what you need, even in large codebases.",
      },
    ],
    faqs: [
      {
        question: "Is Lydie good for API documentation?",
        answer:
          "Yes. Lydie works well for writing API guides, endpoint documentation, and integration docs. Structure docs hierarchically, link related endpoints, and use AI to help draft and clarify sections.",
      },
      {
        question: "How do I keep technical documentation current?",
        answer:
          "The fast editor makes updates feel effortless. Link docs to related pages so context stays connected. Use AI to help expand and clarify sections. Make documentation a living document that evolves with your codebase.",
      },
    ],
    workflowExample: {
      title: "Example workflow: creating and maintaining technical documentation",
      description:
        "See how development teams use Lydie to create documentation that stays current and useful.",
      steps: [
        "Create a structured hierarchy with overview, guides, API docs, and ADRs",
        "Write documentation in Lydie with fast, distraction-free editing",
        "Link related docs together so users can navigate naturally",
        "Use AI to draft docs from rough notes and clarify complex sections",
        "Keep docs current with quick updates that don't feel like overhead",
      ],
    },
    differentiation: {
      title: "How Lydie differs from typical documentation tools",
      points: [
        {
          label: "Fast, developer-focused editor",
          description:
            "Documentation gets written because the editor is fast and feels natural to use.",
        },
        {
          label: "Connected documentation",
          description: "Link API docs, ADRs, and guides together so context is always accessible.",
        },
        {
          label: "Structured hierarchy",
          description:
            "Nested pages provide clear organization for complex technical documentation.",
        },
        {
          label: "AI for technical writing",
          description: "Draft docs from code, clarify technical sections, and expand on outlines.",
        },
      ],
    },
  },
];

export function getRoleUseCaseContent(
  roleSlug: RoleSlug | string,
  useCaseSlug: UseCaseSlug | string,
): RoleUseCaseContent | undefined {
  return roleUseCaseContent.find(
    (ruc) => ruc.roleSlug === roleSlug && ruc.useCaseSlug === useCaseSlug,
  );
}

export function getAllRoleUseCaseCombinations(): RoleUseCaseContent[] {
  return roleUseCaseContent;
}

export function getUseCasesForRole(roleSlug: RoleSlug | string): RoleUseCaseContent[] {
  return roleUseCaseContent.filter((ruc) => ruc.roleSlug === roleSlug);
}

export function getRolesForUseCase(useCaseSlug: UseCaseSlug | string): RoleUseCaseContent[] {
  return roleUseCaseContent.filter((ruc) => ruc.useCaseSlug === useCaseSlug);
}

/**
 * Get featured use cases for a role based on the role's featuredUseCases property.
 * These are displayed more prominently than auto-linked use cases.
 */
export function getFeaturedUseCasesForRole(
  role: Role,
): Array<{ useCase: UseCaseDefinition; description: string }> {
  if (!role.featuredUseCases) return [];

  const allUseCases = getAllUseCaseDefinitions();
  const featured: Array<{ useCase: UseCaseDefinition; description: string }> = [];

  for (const [useCaseSlug, value] of Object.entries(role.featuredUseCases)) {
    const useCase = allUseCases.find((uc) => uc.slug === useCaseSlug);
    if (!useCase) continue;

    // Get description from featuredUseCases value or fall back to default
    const description = typeof value === "string" ? value : useCase.thumbnail.description;

    featured.push({ useCase, description });
  }

  return featured;
}

/**
 * Get auto-linked use cases for a role (up to 4, excluding featured ones).
 * These are automatically discovered from role-use-case content.
 */
export function getAutoLinkedUseCasesForRole(
  role: Role,
  limit = 4,
): Array<{ useCase: UseCaseDefinition; description: string }> {
  const featuredSlugs = Object.keys(role.featuredUseCases ?? {});
  const allUseCases = getAllUseCaseDefinitions();

  // Get all use cases that have content for this role
  const useCasesWithContent = getUseCasesForRole(role.slug);

  // Filter out featured ones and map to use case definitions
  const autoLinked: Array<{ useCase: UseCaseDefinition; description: string }> = [];

  for (const content of useCasesWithContent) {
    // Skip if this use case is featured
    if (featuredSlugs.includes(content.useCaseSlug)) continue;

    const useCase = allUseCases.find((uc) => uc.slug === content.useCaseSlug);
    if (!useCase) continue;

    autoLinked.push({
      useCase,
      description: content.thumbnail.description,
    });

    // Stop at limit
    if (autoLinked.length >= limit) break;
  }

  return autoLinked;
}

/**
 * Get all use cases to display for a role (featured first, then auto-linked up to 4 total).
 */
export function getUseCasesToDisplayForRole(
  role: Role,
): Array<{ useCase: UseCaseDefinition; description: string; isFeatured: boolean }> {
  const featured = getFeaturedUseCasesForRole(role);
  const autoLinked = getAutoLinkedUseCasesForRole(role, 4 - featured.length);

  return [
    ...featured.map((item) => ({ ...item, isFeatured: true })),
    ...autoLinked.map((item) => ({ ...item, isFeatured: false })),
  ];
}

/**
 * Get featured roles for a use case based on the use case's featuredRoles property.
 * These are displayed more prominently than auto-linked roles.
 */
export function getFeaturedRolesForUseCase(
  useCase: UseCaseDefinition,
): Array<{ role: Role; description: string }> {
  if (!useCase.featuredRoles) return [];

  const allRoles = getAllRoles();
  const featured: Array<{ role: Role; description: string }> = [];

  for (const [roleSlug, value] of Object.entries(useCase.featuredRoles)) {
    const role = allRoles.find((r) => r.slug === roleSlug);
    if (!role) continue;

    // Get the role+use case content for this combination
    const content = getRoleUseCaseContent(roleSlug, useCase.slug);
    if (!content) continue;

    // Get description from featuredRoles value or fall back to default
    const description = typeof value === "string" ? value : content.thumbnail.description;

    featured.push({ role, description });
  }

  return featured;
}

/**
 * Get auto-linked roles for a use case (up to 4, excluding featured ones).
 * These are automatically discovered from role-use-case content.
 */
export function getAutoLinkedRolesForUseCase(
  useCase: UseCaseDefinition,
  limit = 4,
): Array<{ role: Role; description: string }> {
  const featuredSlugs = Object.keys(useCase.featuredRoles ?? {});
  const allRoles = getAllRoles();

  // Get all roles that have content for this use case
  const rolesWithContent = getRolesForUseCase(useCase.slug);

  // Filter out featured ones and invisible roles, map to role definitions
  const autoLinked: Array<{ role: Role; description: string }> = [];

  for (const content of rolesWithContent) {
    // Skip if this role is featured
    if (featuredSlugs.includes(content.roleSlug)) continue;

    const role = allRoles.find((r) => r.slug === content.roleSlug);
    if (!role) continue;

    autoLinked.push({
      role,
      description: content.thumbnail.description,
    });

    // Stop at limit
    if (autoLinked.length >= limit) break;
  }

  return autoLinked;
}

/**
 * Get all roles to display for a use case (featured first, then auto-linked up to 4 total).
 */
export function getRolesToDisplayForUseCase(
  useCase: UseCaseDefinition,
): Array<{ role: Role; description: string; isFeatured: boolean }> {
  const featured = getFeaturedRolesForUseCase(useCase);
  const autoLinked = getAutoLinkedRolesForUseCase(useCase, 4 - featured.length);

  return [
    ...featured.map((item) => ({ ...item, isFeatured: true })),
    ...autoLinked.map((item) => ({ ...item, isFeatured: false })),
  ];
}
