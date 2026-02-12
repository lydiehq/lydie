import type { DemoState } from "../components/landing/DemoStateSelector";
import type { FeaturesMap } from "./feature-showcases";

export interface RoleUseCaseContent {
  roleSlug: string;
  useCaseSlug: string;
  hero: {
    title: string;
    description: string;
  };
  meta: {
    title: string;
    description: string;
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
    q: string;
    a: string;
  }[];
  /**
   * Features to showcase on the role+use case page.
   * Keys are feature identifiers (assistant, search, linking, collaboration).
   * Values can be empty {} to use defaults, or override title/description/ctaText.
   * Badge and slug are automatically inferred from the feature key.
   */
  features: FeaturesMap;
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
      description:
        "Take better research notes with a tool designed for academics. Organize literature reviews, capture insights, and build connections.",
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
    features: {
      assistant: {},
      linking: {},
      search: {},
    },
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
];

export function getRoleUseCaseContent(
  roleSlug: string,
  useCaseSlug: string,
): RoleUseCaseContent | undefined {
  return roleUseCaseContent.find(
    (ruc) => ruc.roleSlug === roleSlug && ruc.useCaseSlug === useCaseSlug,
  );
}

export function getAllRoleUseCaseCombinations(): RoleUseCaseContent[] {
  return roleUseCaseContent;
}

export function getUseCasesForRole(roleSlug: string): RoleUseCaseContent[] {
  return roleUseCaseContent.filter((ruc) => ruc.roleSlug === roleSlug);
}

export function getRolesForUseCase(useCaseSlug: string): RoleUseCaseContent[] {
  return roleUseCaseContent.filter((ruc) => ruc.useCaseSlug === useCaseSlug);
}
