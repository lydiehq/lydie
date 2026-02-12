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
            "Designed for specs, RFCs, and meeting notes that grow—stays fast instead of bogging down.",
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
