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
        name: "External platform sync",
        description:
          "Sync content to external platforms like GitHub repositories and Shopify blogs",
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
        name: "External platform sync",
        description:
          "Sync content to external platforms like GitHub repositories and Shopify blogs",
        lydie: true,
        competitor: "Limited to Notion's API and integrations",
      },
      {
        name: "Databases",
        description:
          "Create and manage structured databases with various views",
        lydie: "Planned",
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
  {
    slug: "coda",
    name: "Coda",
    description:
      "Looking for an open-source alternative to Coda? Lydie offers powerful document collaboration with AI assistance and self-hosting capabilities. While Coda excels at building apps with formulas and tables, Lydie focuses on flexible document management with real-time collaboration and native AI features.",
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
        competitor: "AI features via Coda AI (paid add-on)",
      },
      {
        name: "Version history",
        description: "Track and restore previous versions of your documents",
        lydie: true,
        competitor: true,
      },
      {
        name: "External platform sync",
        description:
          "Sync content to external platforms like GitHub repositories and Shopify blogs",
        lydie: true,
        competitor: true,
      },
      {
        name: "Databases & Tables",
        description: "Advanced spreadsheet-like functionality with formulas",
        lydie: "Planned",
        competitor: true,
      },
      {
        name: "Self-hosting",
        description: "Host on your own infrastructure",
        lydie: true,
        competitor: false,
      },
    ],
  },
  {
    slug: "confluence",
    name: "Confluence",
    description:
      "Switch from Confluence to Lydie for a modern, lightweight alternative. Built for teams who want simple yet powerful documentation without the complexity of enterprise tools. With native AI, real-time collaboration, and the freedom to self-host, Lydie makes team knowledge management effortless.",
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
        competitor: "Atlassian Intelligence (additional cost)",
      },
      {
        name: "Version history",
        description: "Track and restore previous versions of your documents",
        lydie: true,
        competitor: true,
      },
      {
        name: "External platform sync",
        description:
          "Sync content to external platforms like GitHub repositories and Shopify blogs",
        lydie: true,
        competitor: "Via Atlassian Marketplace",
      },
      {
        name: "Modern interface",
        description: "Clean, intuitive UI built with modern standards",
        lydie: true,
        competitor: "Enterprise-focused UI",
      },
      {
        name: "Lightweight setup",
        description: "Quick to set up without enterprise complexity",
        lydie: true,
        competitor: false,
      },
    ],
  },
  {
    slug: "evernote",
    name: "Evernote",
    description:
      "Move from Evernote to Lydie for a modern, collaborative note-taking experience. While Evernote focuses on personal note-taking, Lydie brings powerful team collaboration, integrated AI, and the flexibility to self-host. Perfect for teams who have outgrown Evernote's limited collaboration features.",
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
        competitor: false,
      },
      {
        name: "Version history",
        description: "Track and restore previous versions of your documents",
        lydie: true,
        competitor: "Available on paid plans only",
      },
      {
        name: "External platform sync",
        description:
          "Sync content to external platforms like GitHub repositories and Shopify blogs",
        lydie: true,
        competitor: "Limited API access",
      },
      {
        name: "Web clipper",
        description: "Save web content directly to your workspace",
        lydie: false,
        competitor: true,
      },
      {
        name: "Offline access",
        description: "Access and edit documents without internet",
        lydie: "Planned",
        competitor: true,
      },
      {
        name: "Team workspaces",
        description: "Dedicated spaces for team collaboration",
        lydie: true,
        competitor: "Limited on lower tiers",
      },
    ],
  },
];

export function getComparison(slug: string): Comparison | undefined {
  return comparisons.find((comparison) => comparison.slug === slug);
}
