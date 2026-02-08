import type React from "react";

import type { DemoState } from "../components/landing/DemoStateSelector";

export interface FAQItem {
  q: string;
  a: React.ReactNode;
}

export interface UseCase {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  description: string;
  content: string[];
  faqs: FAQItem[];
  demoStates: DemoState[];
  ctaText: string;
  secondaryLink?: {
    href: string;
    text: string;
  };
}

export const useCases: UseCase[] = [
  {
    slug: "personal-knowledge-base",
    title: "Personal Knowledge Base",
    metaTitle: "The best tool for your personal knowledge base - Lydie",
    metaDescription:
      "Stop losing your best ideas in scattered notes. Lydie helps you capture ideas when they come and find them when you need them.",
    description:
      "Lydie helps you capture ideas when they come and find them when you need them. No more digging through dozens of files or forgetting what you wrote last week.",
    content: [
      "Your brain is for having ideas, not holding them. Lydie gives you a place to capture everything: notes, ideas, learnings, and insights. You can focus on thinking and creating instead of trying to remember.",
      "Lydie is built for knowledge management. It is not a general-purpose workspace. It is designed for people who want to think deeply and organize what they know.",
      "Build a system that works for you. Create nested pages to organize by project, topic, or however you think. Link related ideas together to build connections and discover patterns. Lydie helps you grow your knowledge over time.",
      "With search, you can find anything in seconds. No more digging through folders or wondering where you saved that note. AI features help you discover connections you might have missed and summarize complex information.",
      "Lydie is free to start. Begin capturing today with no cost. Unlock AI features and advanced capabilities as your knowledge base grows.",
    ],
    faqs: [
      {
        q: "What is a personal knowledge base?",
        a: "A personal knowledge base is a place to keep your private notes, ideas and information, that lets you easily capture, organize and find what you learn. Keeping an organized knowlegdge base can help offload information so that you can focus on more important things at hand - while being able to come back to it when you need it. For a deeper insight into what a personal knowledge base is, check out our post on [What is a knowledge base?](https://lydie.co/blog/knowledge-bases).",
      },
      {
        q: "What is the best way to organize my personal knowledge base?",
        a: (
          <div>
            There are many ways to organize a personal knowledge base, hence the "personal", but a
            good starting point is to start simple - create a few broad categories that reflect your
            life and interests: work projects, learning notes, personal goals, hobbies. Use nested
            pages to go deeper into specifics. Link related notes together. Lydie makes it easy to
            reorganize as your system evolves.
            <br />
            <br />
            <a
              href="https://lydie.co/blog/knowledge-base-best-practices"
              className="underline text-black/85 hover:text-black focus:outline-none focus:underline"
            >
              Read our best practices for maintaining a knowledge base
            </a>
          </div>
        ),
      },
      {
        q: "What types of content can I store in my knowledge base?",
        a: "Anything you want to remember or reference later: meeting notes, book summaries, project ideas, research findings, journal entries, goals and plans, code snippets, inspiration, and more. Lydie supports rich text, images, code blocks, and embeds.",
      },
      {
        q: "How does AI help with a personal knowledge base?",
        a: "AI changes how you interact with your knowledge base. Lydie's AI can summarize long notes, suggest connections between related ideas, expand on concepts you are developing, and help you reorganize content. It is like having a research assistant that knows everything you have written. AI helps you discover insights you might have missed.",
      },
    ],
    demoStates: ["search", "ai-assistant", "linking"],
    ctaText: "Start for free",
  },
  {
    slug: "company-wiki",
    title: "Company Wiki",
    metaTitle: "Company Wiki & Knowledge Base - Lydie",
    metaDescription:
      "Build a company wiki that grows with your team. Centralize documentation and make it easy for people to find what they need.",
    description:
      "Centralize your company's knowledge so everyone can find what they need, from day one.",
    content: [
      "When company information is in one place, everything gets easier. Teams find what they need without digging through emails or chat. New hires get up to speed faster. Decisions are made with better context.",
      "Lydie works for companies of any size. Build company-wide knowledge bases for goals and mission statements. Let teams create their own spaces for engineering docs, marketing playbooks, or product specs.",
      "Start with templates or build from scratch. Create databases for meeting notes, project docs, and shared resources. With search, linking, and collaborative editing, your wiki grows with your company.",
    ],
    faqs: [
      {
        q: "What is a company wiki?",
        a: "A company wiki is where your team stores information like processes, documentation, policies, and project specs in one place. It reduces information silos and helps people get the context they need to do their work.",
      },
      {
        q: "How does a company wiki help with onboarding?",
        a: "New hires get up to speed faster when company knowledge is documented and easy to find. Instead of asking the same questions repeatedly, they can look up company values, benefits, technical docs, and team processes. This reduces onboarding time and helps them feel more confident.",
      },
      {
        q: "Can different teams have their own wikis?",
        a: "Yes. You can maintain company-wide wikis for shared information while individual teams create their own spaces. Engineering can store technical docs, marketing can keep brand guidelines, and product can maintain roadmaps. Each team gets what they need while staying connected.",
      },
      {
        q: "How do we keep our company wiki up to date?",
        a: "Assign owners to key pages, use inline comments for updates, and check version history to track changes. Treating docs with the same care as code helps ensure your wiki stays useful.",
      },
      {
        q: "Is there a limit to how much we can store?",
        a: "No practical limit. Create as many pages and databases as your team needs. Search and organization tools scale with your content.",
      },
    ],
    demoStates: ["collaboration", "search", "linking"],
    ctaText: "Create company wiki",
  },
  {
    slug: "blog-cms",
    title: "Blog CMS",
    metaTitle: "Blog CMS - Lydie",
    metaDescription:
      "Run your blog with Lydie's APIs and content management. Built for marketing blogs, developer blogs, and publishing.",
    description: "Manage content in Lydie. Publish anywhere you want, with total flexibility.",
    content: [
      "We built our own blog on Lydie. Every post was created and managed in Lydie, then served via our APIs. This is how we actually run lydie.co/blog.",
      "Writers get a collaborative editor for creating content. Developers get clean APIs to fetch that content and render it how they want. No fighting with themes or plugin limitations. Just flexibility.",
      "Whether you are running a marketing blog, developer documentation, or a publishing platform, Lydie gives you tools to create content and APIs to deliver it anywhere.",
    ],
    faqs: [
      {
        q: "How can I use Lydie as a blog CMS?",
        a: "Lydie gives you a content management system through its APIs. You create, edit, and manage blog posts in Lydie. Then you use the APIs to fetch and display them on your website. This works for marketing sites, developer blogs, or publishing platforms. Writers work in Lydie while developers build the frontend with any framework.",
      },
      {
        q: "What makes Lydie different from traditional blog platforms?",
        a: "Traditional blog platforms lock you into their themes and plugins. Lydie gives you full control over your frontend and a good editing experience. Writers get a modern interface for creating content. Developers fetch content via API and render it how they want. No theme constraints or plugin bloat.",
      },
      {
        q: "Can I manage multiple blogs with Lydie?",
        a: "Yes. You can create separate spaces for different blogs in your Lydie workspace. Each space can have its own structure and organization. This works well for companies running multiple blogs: a marketing blog, a developer blog, internal newsletters. All managed from one place.",
      },
      {
        q: "How do I integrate Lydie with my blog frontend?",
        a: "Lydie provides REST APIs to fetch your blog content. Retrieve posts, pages, and media with simple API calls. We also have webhooks for real-time updates so your blog stays in sync as content changes. Integration works with Next.js, Astro, or any other framework.",
      },
      {
        q: "Does Lydie support SEO-optimized blogs?",
        a: "Yes. You can store SEO metadata alongside your content: titles, descriptions, keywords, and custom fields. Fetch this data via API to populate your meta tags, sitemaps, and structured data. Since you control the frontend, you can implement best practices for page speed and Core Web Vitals.",
      },
    ],
    demoStates: ["linking", "ai-assistant"],
    ctaText: "Start your blog",
    secondaryLink: {
      href: "https://lydie.co/blog",
      text: "See our blog",
    },
  },
  {
    slug: "researchers",
    title: "Researchers",
    metaTitle: "Research Documentation & Notes - Lydie",
    metaDescription:
      "Organize your research, synthesize findings, and build knowledge that compounds. Built for academics, scientists, and independent researchers.",
    description:
      "Keep your research organized, your sources connected, and your insights discoverable. Build a knowledge base that compounds over time.",
    content: [
      "Research generates an enormous amount of information: papers, notes, data, insights, and ideas. Without a proper system, it is easy to lose track of what you have read and what you have learned. Lydie gives researchers a structured place to capture, organize, and connect their work.",
      "Create nested pages for different projects, papers, or topics. Link related concepts across your knowledge base to discover patterns and connections you might have missed. Use databases to track papers, experiments, or literature reviews.",
      "AI features help you process information faster. Summarize long papers, extract key insights, and get help synthesizing findings across multiple sources. The AI assistant understands the context of your research and can help you think through problems.",
      "Collaboration features let you work with co-authors, advisors, or research teams. Share specific pages or keep your entire workspace open. Comment on each other's work and build on shared knowledge.",
      "Everything is searchable. Find that paper you read six months ago, locate a specific data point, or rediscover an insight you had forgotten. Your research becomes a living, growing body of knowledge.",
    ],
    faqs: [
      {
        q: "How can researchers use Lydie?",
        a: "Researchers use Lydie to organize literature reviews, take notes on papers, track research projects, and synthesize findings. Create pages for each paper with your notes and highlights. Link related concepts across your knowledge base. Use databases to track your reading list, research questions, and project progress.",
      },
      {
        q: "Can I use Lydie for academic writing?",
        a: "Yes. Lydie works well for organizing your thoughts before writing. Create outlines, draft sections, and keep your sources organized. While Lydie is not a word processor for final formatting, it excels at the research and organization phase of academic writing. Export your work when you are ready to format it for submission.",
      },
      {
        q: "How does AI help with research?",
        a: "Lydie's AI can summarize academic papers, help you understand complex concepts, suggest connections between different sources, and assist with synthesizing findings. It can also help you brainstorm research questions, outline papers, and check your writing for clarity. The AI works with your own notes and knowledge base, giving you personalized assistance.",
      },
      {
        q: "Can I collaborate with my research team?",
        a: "Yes. Share pages or entire spaces with collaborators. Work together on literature reviews, methodology sections, or data analysis. Comments and real-time collaboration make it easy to give and receive feedback. Version history lets you track changes and revert if needed.",
      },
      {
        q: "Is my research data secure?",
        a: "Your data is encrypted in transit and at rest. You control who has access to your work. For sensitive research, you can keep everything private or share only specific pages with trusted collaborators. We take data security seriously and do not use your content to train AI models without your explicit consent.",
      },
    ],
    demoStates: ["ai-assistant", "search", "linking", "collaboration"],
    ctaText: "Start researching",
  },
];

export function getUseCase(slug: string): UseCase | undefined {
  return useCases.find((useCase) => useCase.slug === slug);
}

export function getAllUseCaseSlugs(): string[] {
  return useCases.map((useCase) => useCase.slug);
}
