import type { DemoState } from "../components/landing/DemoStateSelector";
import type { Role, RoleSlug } from "./roles";
import { getAllRoles } from "./roles";
import type { SectionInput } from "./sections";
import type { UseCaseDefinition, UseCaseSlug } from "./use-case-definitions";
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
      title: "Capturing and connecting research notes",
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
      title: "From lecture notes to essay",
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
      title: "From meeting notes to documented decisions",
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
      title: "From user interview to product decision",
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
      title: "Writing and maintaining product documentation",
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
      title: "From research notes to design decisions",
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
      title: "Documenting a design system",
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
      title: "Creating and maintaining technical documentation",
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
  {
    roleSlug: "researchers",
    useCaseSlug: "documentation",
    meta: {
      title: "Documentation Tool for Researchers",
    },
    hero: {
      title: "Research documentation that supports your work",
      description:
        "Document methodologies, track research projects, and maintain lab documentation that stays organized. Lydie helps researchers create structured, connected docs that support rigorous research.",
    },
    content: [
      "Research documentation spans methodologies, protocols, project notes, and findings. When docs are scattered or hard to maintain, research reproducibility suffers and institutional knowledge gets lost.",
      "Lydie gives researchers a structured workspace for documentation that stays organized and connected. Create pages for methodologies, track project progress, and link related research together.",
      "The fast editor means you can document as you work without slowing down. Use AI to help structure complex methodologies, draft project summaries, and clarify technical explanations.",
    ],
    examples: [
      {
        title: "Methodology documentation",
        description: "Document research protocols, experimental designs, and analytical approaches",
      },
      {
        title: "Project tracking",
        description: "Track research project progress, milestones, and findings over time",
      },
      {
        title: "Lab documentation",
        description: "Maintain shared documentation for lab procedures, equipment, and protocols",
      },
    ],
    sections: ["assistant", "linking", "search"],
    faqs: [
      {
        question: "Can researchers use Lydie for lab documentation?",
        answer:
          "Yes. Lydie works well for documenting lab protocols, procedures, and shared resources. Create structured pages that your lab can maintain together and link related documentation.",
      },
      {
        question: "How do I document complex methodologies?",
        answer:
          "Use nested pages to break down complex methodologies into sections. Link to related papers, data sources, and tools. Use AI to help structure and clarify technical explanations.",
      },
    ],
    workflowExample: {
      title: "Documenting a research project",
      description: "See how researchers use Lydie to create comprehensive research documentation.",
      steps: [
        "Create a project overview with goals, timeline, and key questions",
        "Document methodologies in structured pages with links to protocols and tools",
        "Track progress and findings in linked pages that build the research narrative",
        "Use AI to help draft summaries and clarify complex methods",
        "Link final publications back to the research documentation for full context",
      ],
    },
    differentiation: {
      title: "How Lydie differs from typical research documentation tools",
      points: [
        {
          label: "Built for academic writing",
          description:
            "Designed for long-form documentation that researchers need to write and maintain.",
        },
        {
          label: "Connect research elements",
          description:
            "Link methodologies, data sources, and findings to build complete research context.",
        },
        {
          label: "Fast with complex docs",
          description:
            "Performance stays snappy even with extensive methodologies and technical content.",
        },
        {
          label: "AI for academic clarity",
          description: "Help structure complex explanations and draft technical summaries.",
        },
      ],
    },
  },
  {
    roleSlug: "students",
    useCaseSlug: "personal-knowledge-base",
    meta: {
      title: "Personal Knowledge Base for Students",
    },
    hero: {
      title: "Build a knowledge base that helps you learn and remember",
      description:
        "Students need to connect concepts across courses and build understanding over time. Lydie helps you create a personal knowledge base that grows with your education.",
    },
    content: [
      "Learning isn't just about memorizing facts, it's about connecting ideas and building understanding. A personal knowledge base helps you see how concepts relate across courses and over time.",
      "Use Lydie to capture notes, insights, and questions as you learn. Link related concepts together so you can trace how ideas connect. Build a knowledge base that grows more valuable throughout your education.",
      "Powerful search means you can find that concept from last semester when it comes up again. Your knowledge base becomes a tool for deeper learning and better retention.",
    ],
    examples: [
      {
        title: "Course concept maps",
        description: "Create pages that connect key concepts across lectures and readings",
      },
      {
        title: "Cross-course connections",
        description: "Link ideas that appear in multiple courses to build deeper understanding",
      },
      {
        title: "Study synthesis",
        description: "Build summary pages that synthesize learning across multiple sources",
      },
    ],
    sections: ["assistant", "linking", "search"],
    faqs: [
      {
        question: "How can students build a personal knowledge base?",
        answer:
          "Start by taking notes in Lydie for each course. Link related concepts together as you discover connections. Over time, you'll build a web of knowledge that helps you see the big picture and prepare for exams.",
      },
      {
        question: "Can I use my knowledge base for exam prep?",
        answer:
          "Yes. Your knowledge base becomes the perfect study tool. Search for concepts, follow links to related ideas, and use AI to help create study summaries and practice questions.",
      },
    ],
    workflowExample: {
      title: "Building your academic knowledge base",
      description:
        "See how students use Lydie to create a knowledge base that supports deeper learning.",
      steps: [
        "Take notes in Lydie for each lecture and reading",
        "Link related concepts across courses as you discover connections",
        "Create summary pages that synthesize key topics",
        "Use search to review concepts before exams",
        "Use AI to help create study guides and find knowledge gaps",
      ],
    },
    differentiation: {
      title: "How Lydie differs from typical study tools",
      points: [
        {
          label: "Built for connected learning",
          description: "Link concepts naturally to see how ideas relate across courses.",
        },
        {
          label: "Grows with your education",
          description:
            "Your knowledge base compounds in value as you add more courses and connections.",
        },
        {
          label: "Fast and distraction-free",
          description: "Focus on learning, not fighting with slow or cluttered software.",
        },
        {
          label: "AI for deeper understanding",
          description: "Use AI to explain complex concepts and create study materials.",
        },
      ],
    },
  },
  {
    roleSlug: "developers",
    useCaseSlug: "personal-knowledge-base",
    meta: {
      title: "Personal Knowledge Base for Developers",
    },
    hero: {
      title: "A knowledge base for your technical learning",
      description:
        "Developers need to track what they learn, from languages and frameworks to system design patterns. Lydie helps you build a technical knowledge base that grows with your career.",
    },
    content: [
      "The technology landscape changes constantly. To keep up, developers need to document what they learn, languages, frameworks, patterns, and architectural decisions. Without a system, valuable learning gets lost.",
      "Lydie gives you a workspace to capture technical notes, document patterns, and track your learning journey. Link related concepts together so you can trace how your understanding develops over time.",
      "Powerful search means you can find that pattern you documented months ago or reference that architecture decision when similar problems arise. Your knowledge base becomes a tool for continuous learning.",
    ],
    examples: [
      {
        title: "Technology notes",
        description: "Document languages, frameworks, and tools as you learn them",
      },
      {
        title: "Pattern library",
        description: "Track design patterns, architectural approaches, and best practices",
      },
      {
        title: "Learning logs",
        description: "Capture insights from courses, books, and projects as you progress",
      },
    ],
    sections: [
      {
        id: "opensource",
        description:
          "Lydie is fully open-source under the AGPL license. We strive to keep our code as transparent as possible and gladly accept contributions.",
      },
      "assistant",
      "linking",
      "search",
    ],
    faqs: [
      {
        question: "How can developers build a personal knowledge base?",
        answer:
          "Create pages for technologies you learn, patterns you discover, and insights from projects. Link related concepts together to build a web of technical knowledge you can reference and build upon.",
      },
      {
        question: "Can I use my knowledge base for onboarding?",
        answer:
          "Yes. Your personal knowledge base becomes a valuable resource when joining new teams. Share relevant pages about technologies, patterns, and approaches that apply to your new role.",
      },
    ],
    workflowExample: {
      title: "Documenting your technical journey",
      description:
        "See how developers use Lydie to build a knowledge base that supports continuous learning.",
      steps: [
        "Create pages for new technologies and frameworks as you learn them",
        "Document patterns and architectural decisions from projects",
        "Link related concepts together to see connections",
        "Use search to reference past learning when solving new problems",
        "Use AI to help explain complex concepts and find connections",
      ],
    },
    differentiation: {
      title: "How Lydie differs from typical developer note-taking",
      points: [
        {
          label: "Built for technical content",
          description: "Designed for documenting code, patterns, and architectural concepts.",
        },
        {
          label: "Connect technical concepts",
          description:
            "Link technologies, patterns, and decisions to build a web of technical knowledge.",
        },
        {
          label: "Fast with technical docs",
          description:
            "Performance stays snappy even with lots of code snippets and technical content.",
        },
        {
          label: "AI for technical learning",
          description:
            "Use AI to explain complex concepts and find connections in your technical knowledge.",
        },
      ],
    },
  },
  {
    roleSlug: "writers",
    useCaseSlug: "note-taking",
    meta: {
      title: "Note-taking for Writers",
    },
    hero: {
      title: "Capture ideas before they disappear",
      description:
        "Writers are constantly collecting ideas, quotes, and observations. Lydie gives you a fast, frictionless way to capture these sparks before they fade and connect them into something bigger.",
    },
    content: [
      "Writing begins long before you sit down at the keyboard. Ideas come during walks, conversations, and reading. Without a system to capture them, these sparks disappear into the void.",
      "Lydie gives writers a fast way to capture ideas as they strike. Jot down quotes, observations, and insights. Link related notes together to see how ideas connect and develop over time.",
      "When you're ready to write, search brings up relevant notes from months ago. Your idea collection becomes a rich reservoir of material to draw from for articles, stories, and projects.",
    ],
    examples: [
      {
        title: "Idea journal",
        description: "Capture article ideas, story concepts, and creative sparks as they come",
      },
      {
        title: "Reading notes",
        description: "Take notes on books, articles, and research with quotes and insights",
      },
      {
        title: "Observation log",
        description: "Document observations, conversations, and experiences for future writing",
      },
    ],
    sections: ["assistant", "linking", "search"],
    faqs: [
      {
        question: "How should writers take notes?",
        answer:
          "Capture ideas immediately when they strike, even if rough. Use Lydie to jot down quotes, observations, and insights. Link related notes together and search them when writing to find relevant material.",
      },
      {
        question: "Can I organize notes by writing project?",
        answer:
          "Yes. Create nested pages for different projects, topics, or themes. Link notes across projects to see how ideas connect. Use AI to help synthesize notes into outlines and drafts.",
      },
    ],
    workflowExample: {
      title: "From idea capture to published article",
      description: "See how writers use Lydie to turn scattered notes into finished pieces.",
      steps: [
        "Capture ideas, quotes, and observations in quick notes as they come",
        "Link related notes together to see how ideas connect and develop",
        "When starting an article, search for relevant notes from your collection",
        "Use AI to help synthesize notes into an outline",
        "Draft and revise in Lydie, referencing your linked notes for context",
      ],
    },
    differentiation: {
      title: "How Lydie differs from typical note-taking for writers",
      points: [
        {
          label: "Built for creative capture",
          description: "Fast, frictionless writing that doesn't get in the way of your ideas.",
        },
        {
          label: "Connect ideas over time",
          description: "Link notes to see how ideas develop and connect across projects.",
        },
        {
          label: "Find ideas when you need them",
          description: "Powerful search helps you resurface that perfect quote from months ago.",
        },
        {
          label: "AI for creative synthesis",
          description: "Use AI to help organize scattered notes into coherent outlines and drafts.",
        },
      ],
    },
  },
  {
    roleSlug: "writers",
    useCaseSlug: "personal-knowledge-base",
    meta: {
      title: "Personal Knowledge Base for Writers",
    },
    hero: {
      title: "A knowledge base for your writing life",
      description:
        "Writers need to manage research, ideas, and references across many projects. Lydie helps you build a personal knowledge base that supports your writing practice and grows more valuable over time.",
    },
    content: [
      "Every writer builds up a body of knowledge, research, ideas, sources, and references. Without a system, this valuable material gets scattered across notebooks, bookmarks, and half-remembered thoughts.",
      "Lydie gives you a workspace to organize your writing knowledge. Create pages for research topics, track sources and references, and link related ideas together. Build a knowledge base that supports multiple projects.",
      "Over time, your knowledge base becomes a rich resource. Search brings up relevant research from past projects. Linked ideas spark new connections and creative insights. Your knowledge compounds with every project.",
    ],
    examples: [
      {
        title: "Research collections",
        description: "Organize research by topic with sources, notes, and insights",
      },
      {
        title: "Source library",
        description: "Track books, articles, interviews, and references you can cite",
      },
      {
        title: "Theme explorations",
        description: "Develop ideas and themes that recur across your writing",
      },
    ],
    sections: ["assistant", "linking", "search"],
    faqs: [
      {
        question: "How do writers build a knowledge base?",
        answer:
          "Start collecting research, ideas, and sources in organized pages. Link related topics together. Over time, you'll build a rich resource of material you can draw from for any writing project.",
      },
      {
        question: "Can I reuse research across projects?",
        answer:
          "Yes. Your knowledge base becomes a reusable resource. Search past research, follow links to related topics, and discover connections that spark new writing ideas.",
      },
    ],
    workflowExample: {
      title: "Building your writer's knowledge base",
      description:
        "See how writers use Lydie to create a knowledge base that supports their practice.",
      steps: [
        "Create pages for research topics and collect sources, quotes, and insights",
        "Link related topics together to see connections in your research",
        "When starting a new project, search your knowledge base for relevant material",
        "Add new research and link it to existing knowledge",
        "Use AI to help synthesize research and find unexpected connections",
      ],
    },
    differentiation: {
      title: "How Lydie differs from typical knowledge tools for writers",
      points: [
        {
          label: "Built for creative research",
          description: "Organize sources, quotes, and insights in a way that supports writing.",
        },
        {
          label: "Connect ideas across projects",
          description: "Link research and themes to see how your writing evolves over time.",
        },
        {
          label: "Find material when you need it",
          description: "Search your entire knowledge base to find that perfect source or quote.",
        },
        {
          label: "AI for research synthesis",
          description: "Use AI to help synthesize research and discover new connections.",
        },
      ],
    },
  },
  {
    roleSlug: "engineering-managers",
    useCaseSlug: "note-taking",
    meta: {
      title: "Note-taking for Engineering Managers",
    },
    hero: {
      title: "Keep track of what matters across your team",
      description:
        "Engineering managers juggle 1:1s, team meetings, and project updates. Lydie gives you a structured way to capture notes, track decisions, and maintain context that helps you lead effectively.",
    },
    content: [
      "Engineering leadership requires keeping track of many conversations and contexts, 1:1s with engineers, team meetings, project updates, and stakeholder discussions. Without a system, important details slip through the cracks.",
      "Lydie gives you a workspace to capture structured notes for all your leadership activities. Take notes in 1:1s, document team decisions, and track action items. Link related notes to see the full context.",
      "Search means you can quickly reference past conversations or decisions. Your notes become a tool for more effective leadership, helping you remember commitments, track patterns, and support your team better.",
    ],
    examples: [
      {
        title: "1:1 notes",
        description: "Track conversations, goals, and action items with each team member",
      },
      {
        title: "Meeting summaries",
        description: "Document team meetings, retrospectives, and planning sessions",
      },
      {
        title: "Decision logs",
        description: "Track team decisions with context and rationale for future reference",
      },
    ],
    sections: ["assistant", "linking", "search"],
    faqs: [
      {
        question: "How should engineering managers take notes?",
        answer:
          "Create structured pages for 1:1s, team meetings, and important decisions. Take notes during conversations, track action items, and link related discussions together. Use search to reference past context.",
      },
      {
        question: "Can I track team goals and progress?",
        answer:
          "Yes. Use Lydie to document team goals, track progress in updates, and link goals to related work. AI can help summarize progress and identify patterns across your notes.",
      },
    ],
    workflowExample: {
      title: "Effective leadership note-taking",
      description: "See how engineering managers use Lydie to stay organized and lead effectively.",
      steps: [
        "Create pages for each 1:1 and take structured notes during conversations",
        "Document team meetings with decisions, action items, and context",
        "Link related notes together to see patterns and context",
        "Use search to reference past conversations before follow-ups",
        "Use AI to help summarize themes and track action items across notes",
      ],
    },
    differentiation: {
      title: "How Lydie differs from typical note-taking for managers",
      points: [
        {
          label: "Built for leadership context",
          description:
            "Structured note-taking that captures the context engineering managers need.",
        },
        {
          label: "Connect conversations over time",
          description: "Link notes to track patterns and maintain continuity with your team.",
        },
        {
          label: "Find context quickly",
          description: "Search past notes to reference conversations and decisions instantly.",
        },
        {
          label: "AI for leadership insights",
          description:
            "Use AI to summarize themes and identify patterns across your leadership notes.",
        },
      ],
    },
  },
  {
    roleSlug: "engineering-managers",
    useCaseSlug: "documentation",
    meta: {
      title: "Documentation for Engineering Teams",
    },
    hero: {
      title: "Team documentation that engineers actually use",
      description:
        "Engineering managers need to maintain team processes, onboarding docs, and technical context. Lydie helps you create documentation that stays current and helps your team stay aligned.",
    },
    content: [
      "Team documentation keeps engineering organizations aligned and effective. From onboarding guides to technical decisions, good documentation reduces repetitive explanations and helps teams move faster.",
      "Lydie gives you a workspace to create and maintain team documentation that engineers actually use. Write process docs, track decisions, and organize technical context. Link related documentation together.",
      "The fast editor means updating docs isn't a chore. Use AI to help draft documentation, clarify processes, and expand on technical explanations. Documentation stays current because it's easy to maintain.",
    ],
    examples: [
      {
        title: "Team processes",
        description: "Document workflows, rituals, and team conventions for consistency",
      },
      {
        title: "Onboarding guides",
        description: "Create structured guides for new engineers with links to resources",
      },
      {
        title: "Decision records",
        description: "Track technical and process decisions with context and rationale",
      },
    ],
    sections: [
      {
        id: "opensource",
        description:
          "Lydie is fully open-source under the AGPL license. We strive to keep our code as transparent as possible and gladly accept contributions.",
      },
      "assistant",
      "linking",
      "search",
    ],
    faqs: [
      {
        question: "How do engineering managers maintain team documentation?",
        answer:
          "Create pages for team processes, onboarding, and important decisions. Encourage the team to update docs as things change. Link related docs together and use search to find information quickly.",
      },
      {
        question: "Can documentation help with team alignment?",
        answer:
          "Yes. Good documentation becomes a single source of truth for team processes and decisions. When everyone can find and update docs easily, alignment improves naturally.",
      },
    ],
    workflowExample: {
      title: "Maintaining effective team documentation",
      description:
        "See how engineering managers use Lydie to create documentation that helps their teams.",
      steps: [
        "Create structured documentation for team processes and onboarding",
        "Link related docs together to create navigable team knowledge",
        "Track decisions with context so the rationale is preserved",
        "Update docs regularly with fast, intuitive editing",
        "Use AI to help draft and clarify documentation",
      ],
    },
    differentiation: {
      title: "How Lydie differs from typical team documentation tools",
      points: [
        {
          label: "Engineer-friendly editor",
          description: "Fast, intuitive documentation that engineers actually enjoy writing.",
        },
        {
          label: "Connected team knowledge",
          description: "Link processes, decisions, and resources for complete team context.",
        },
        {
          label: "Easy to maintain",
          description: "Fast updates mean docs stay current without feeling like overhead.",
        },
        {
          label: "AI for team docs",
          description: "Use AI to draft processes, clarify explanations, and expand documentation.",
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
    const description = typeof value === "string" ? value : useCase.hero.description;

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
      description: content.hero.description,
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
    const description = typeof value === "string" ? value : content.hero.description;

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
      description: content.hero.description,
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
