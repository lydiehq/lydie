import type { SectionOverride } from "./comparison-sections";

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
  sections?: (string | SectionOverride)[]; // Section IDs or objects with overrides
}

export const comparisons: Comparison[] = [
  {
    slug: "google-docs",
    name: "Google Docs",
    description:
      "Looking for an open-source alternative to Google Docs? Lydie provides powerful document editing with real-time collaboration, built-in AI assistance, and the freedom to self-host. Perfect for teams who want full control over their documents and data.",
    sections: [
      {
        id: "opensource",
        description:
          "Unlike Google Docs, which locks your data in Google's cloud, Lydie is fully open-source and self-hostable. Take back control of your documents and data, or use our cloud version if you prefer. The choice is yours.",
      },
      "ai",
      {
        id: "collaboration",
        title: "Real-time collaboration like Google Docs",
        description:
          "Get the same real-time collaboration you love from Google Docs, but with more control. See live cursors, instant updates, and seamless teamwork - all without being locked into Google's ecosystem.",
      },
    ],
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
      {
        name: "API access",
        description: "Programmatic access to documents and data via API",
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
    sections: [
      {
        id: "opensource",
        title: "Open-source alternative to Notion",
        description:
          "Notion locks you into their platform with no way to self-host or customize. Lydie is fully open-source, giving you complete control over your data and the ability to customize it to your needs. No vendor lock-in, no data silos - just the freedom to run your workspace your way.",
      },
      {
        id: "ai",
        title: "AI built-in, not a paid add-on",
        description:
          "Notion charges extra for AI features on paid plans. With Lydie, AI assistance is built directly into the editor and available to everyone. Get writing help, generate content, and chat with your documents without paying premium prices for AI capabilities.",
      },
      {
        id: "performance",
        title: "Fast and responsive, not slow like Notion",
        description:
          "Notion's performance can be sluggish, especially with large databases and complex pages. Lydie is built for speed with modern web technologies, delivering instant loading and smooth editing even with large documents. No more waiting for pages to load or edits to sync.",
      },
      {
        id: "integrations",
        title: "Better integrations than Notion's limited API",
        description:
          "Notion's API access is limited and requires workarounds for many use cases. Lydie offers powerful integrations right out of the box - sync to GitHub repositories, publish to Shopify blogs, or connect to your existing workflow. Our extensible API makes it easy to fit Lydie into your tech stack.",
      },
    ],
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
        name: "API access",
        description: "Programmatic access to documents and data via API",
        lydie: true,
        competitor: "Limited API with restrictions",
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
    sections: ["opensource", "ai", "collaboration"],
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
        competitor: true,
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
        name: "API access",
        description: "Programmatic access to documents and data via API",
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
    sections: [
      {
        id: "knowledgebase",
        title: "Better knowledge base organization",
        description:
          "Unlike Confluence's complex space hierarchy, Lydie offers a simpler, more intuitive way to organize your team's knowledge. Create nested pages, link related documents, and build a knowledge base that actually makes sense. No more getting lost in Confluence's maze of spaces and permissions.",
      },
      {
        id: "opensource",
        title: "Open-source alternative to Confluence",
        description:
          "Tired of Confluence's enterprise pricing and vendor lock-in? Lydie is fully open-source and self-hostable, giving you complete control over your documentation platform. No more paying per-user fees or being locked into Atlassian's ecosystem.",
      },
      {
        id: "ai",
        title: "AI built-in, not an add-on",
        description:
          "While Confluence requires Atlassian Intelligence (at additional cost), Lydie includes powerful AI features right out of the box. Get writing assistance, generate content, and chat with your documents without paying extra for AI capabilities.",
      },
      {
        id: "collaboration",
        title: "Real-time collaboration without the complexity",
        description:
          "Lydie's real-time collaboration is as powerful as Confluence's, but without the enterprise complexity. See changes as they happen, work together seamlessly, and keep your team in sync - all in a modern, lightweight interface.",
      },
    ],
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
        name: "API access",
        description: "Programmatic access to documents and data via API",
        lydie: true,
        competitor: "REST API available",
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
    sections: ["opensource", "ai", "collaboration"],
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
        name: "API access",
        description: "Programmatic access to documents and data via API",
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
  {
    slug: "microsoft-word",
    name: "Microsoft Word",
    description:
      "Replace Microsoft Word with Lydie for a modern, cloud-native document editor. While Word excels at offline editing and complex formatting, Lydie offers real-time collaboration, integrated AI, and the freedom to self-host. Perfect for teams who want seamless collaboration without Microsoft's ecosystem lock-in.",
    sections: [
      {
        id: "opensource",
        title: "Open-source alternative to Microsoft Word",
        description:
          "Microsoft Word locks you into their ecosystem with licensing fees and cloud dependencies. Lydie is fully open-source and self-hostable, giving you complete control over your documents and data. No more subscription fees or vendor lock-in.",
      },
      {
        id: "collaboration",
        title: "Better real-time collaboration than Word",
        description:
          "While Word Online offers some collaboration features, Lydie's real-time collaboration is built from the ground up. See live cursors, instant updates, and seamless teamwork without the complexity of Microsoft's co-authoring system.",
      },
      {
        id: "ai",
        title: "AI built-in, not a premium add-on",
        description:
          "Microsoft Copilot requires a separate subscription. With Lydie, AI assistance is built directly into the editor and available to everyone. Get writing help, generate content, and chat with your documents without paying extra.",
      },
    ],
    features: [
      {
        name: "Real-time collaboration",
        description: "Collaborate with your team in real-time on documents",
        lydie: true,
        competitor: "Word Online only",
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
        competitor: "Microsoft Copilot (separate subscription)",
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
        competitor: "Limited to Microsoft ecosystem",
      },
      {
        name: "API access",
        description: "Programmatic access to documents and data via API",
        lydie: true,
        competitor: "Microsoft Graph API (requires subscription)",
      },
      {
        name: "Offline editing",
        description: "Edit documents without internet connection",
        lydie: "Planned",
        competitor: true,
      },
      {
        name: "Advanced formatting",
        description: "Complex document formatting and styling options",
        lydie: "Basic formatting available",
        competitor: true,
      },
      {
        name: "Cloud-native",
        description: "Built for cloud collaboration from the start",
        lydie: true,
        competitor: "Desktop-first, cloud added later",
      },
    ],
  },
  {
    slug: "obsidian",
    name: "Obsidian",
    description:
      "Switch from Obsidian to Lydie for a collaborative, cloud-native knowledge base. While Obsidian excels at personal note-taking with local-first architecture, Lydie brings powerful team collaboration, integrated AI, and seamless cloud sync. Perfect for teams who need to share and collaborate on knowledge.",
    sections: [
      {
        id: "collaboration",
        title: "Real-time collaboration vs. local-first",
        description:
          "Obsidian is built for personal use with local-first architecture, making team collaboration challenging. Lydie is built for collaboration from the ground up, with real-time editing, live cursors, and seamless teamwork. Share knowledge instantly with your team.",
      },
      {
        id: "ai",
        title: "AI built-in, not a plugin",
        description:
          "While Obsidian has AI plugins, they require setup and may have limitations. Lydie includes powerful AI features right out of the box. Get writing assistance, generate content, and chat with your documents without configuring plugins.",
      },
      {
        id: "opensource",
        title: "Open-source with cloud collaboration",
        description:
          "Like Obsidian, Lydie is open-source and self-hostable. But unlike Obsidian's local-first approach, Lydie offers seamless cloud collaboration while still giving you the freedom to self-host. Get the best of both worlds.",
      },
    ],
    features: [
      {
        name: "Real-time collaboration",
        description: "Collaborate with your team in real-time on documents",
        lydie: true,
        competitor: "Limited (via plugins or Obsidian Sync)",
      },
      {
        name: "Open-source",
        description: "Self-host and customize the platform to your needs",
        lydie: true,
        competitor: true,
      },
      {
        name: "Integrated AI",
        description: "AI-powered features built directly into the editor",
        lydie: true,
        competitor: "Via plugins",
      },
      {
        name: "Version history",
        description: "Track and restore previous versions of your documents",
        lydie: true,
        competitor: "Via Git or plugins",
      },
      {
        name: "External platform sync",
        description:
          "Sync content to external platforms like GitHub repositories and Shopify blogs",
        lydie: true,
        competitor: "Via plugins",
      },
      {
        name: "API access",
        description: "Programmatic access to documents and data via API",
        lydie: true,
        competitor: "No official API (plugins may provide access)",
      },
      {
        name: "Graph view",
        description: "Visualize connections between documents",
        lydie: "Planned",
        competitor: true,
      },
      {
        name: "Local-first",
        description: "Store files locally with optional cloud sync",
        lydie: false,
        competitor: true,
      },
      {
        name: "Markdown support",
        description: "Native Markdown editing and rendering",
        lydie: true,
        competitor: true,
      },
      {
        name: "Team workspaces",
        description: "Dedicated spaces for team collaboration",
        lydie: true,
        competitor: false,
      },
    ],
  },
];

export function getComparison(slug: string): Comparison | undefined {
  return comparisons.find((comparison) => comparison.slug === slug);
}
