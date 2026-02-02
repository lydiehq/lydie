export interface UseCase {
  slug: string;
  title: string;
  description: string;
  icon?: string;
}

export const useCases: UseCase[] = [
  {
    slug: "personal-knowledge-base",
    title: "Personal Knowledge Base",
    description:
      "Build your personal knowledge base with Lydie. Organize your thoughts, notes, and research in one place with powerful AI assistance.",
  },
  {
    slug: "team-knowledge-base",
    title: "Team Knowledge Base",
    description:
      "Create a collaborative knowledge base for your team. Share documentation, best practices, and institutional knowledge with real-time collaboration.",
  },
];

export function getUseCase(slug: string): UseCase | undefined {
  return useCases.find((useCase) => useCase.slug === slug);
}
