export interface ComparisonFeature {
  name: string;
  description?: string;
  lydie: boolean | string;
  competitor: boolean | string;
}

export interface Comparison {
  slug: string;
  name: string;
  description: string;
  icon?: string;
  features: ComparisonFeature[];
}

export const comparisons: Comparison[] = [
  {
    slug: "google-docs",
    name: "Google Docs",
    description:
      "Looking for an open-source alternative to Google Docs? Lydie provides powerful document editing with real-time collaboration, built-in AI assistance, and the freedom to self-host. Perfect for teams who want full control over their documents and data.",
    features: [
      {
        name: "Real-time collaboration",
        description: "Collaborate with your team in real-time on documents",
        lydie: true,
        competitor: true,
      },
      {
        name: "Open-source",
        description: "Self-host and customize the platform to your needs",
        lydie: true,
        competitor: false,
      },
      {
        name: "Integrated AI",
        description: "AI-powered features built directly into the editor",
        lydie: true,
        competitor: "Limited AI features via add-ons",
      },
      {
        name: "Version history",
        description: "Track and restore previous versions of your documents",
        lydie: true,
        competitor: true,
      },
      {
        name: "Custom integrations",
        description: "Build and integrate custom tools and workflows",
        lydie: true,
        competitor: "Limited API access",
      },
    ],
  },
  {
    slug: "notion",
    name: "Notion",
    description:
      "Switch from Notion to Lydie for a more flexible, open-source workspace. With native AI capabilities, unlimited customization through self-hosting, and powerful collaboration tools, Lydie gives you complete ownership of your knowledge base and workflows.",
    features: [
      {
        name: "Real-time collaboration",
        description: "Collaborate with your team in real-time on documents",
        lydie: true,
        competitor: true,
      },
      {
        name: "Open-source",
        description: "Self-host and customize the platform to your needs",
        lydie: true,
        competitor: false,
      },
      {
        name: "Integrated AI",
        description: "AI-powered features built directly into the editor",
        lydie: true,
        competitor: "Available on paid plans only",
      },
      {
        name: "Version history",
        description: "Track and restore previous versions of your documents",
        lydie: true,
        competitor: "Available on paid plans only",
      },
      {
        name: "Custom integrations",
        description: "Build and integrate custom tools and workflows",
        lydie: true,
        competitor: "Limited to Notion's API and integrations",
      },
      {
        name: "Database views",
        description: "Organize content with database-like structures",
        lydie: "Document-based with flexible organization",
        competitor: true,
      },
      {
        name: "Free tier",
        description: "Access to core features without payment",
        lydie: true,
        competitor: "Limited free tier with restrictions",
      },
    ],
  },
];

export function getComparison(slug: string): Comparison | undefined {
  return comparisons.find((comparison) => comparison.slug === slug);
}
