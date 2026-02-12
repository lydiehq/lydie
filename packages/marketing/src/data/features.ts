export interface FAQItem {
  q: string;
  a: string;
}

export interface FeatureSubpage {
  slug: string;
  title: string;
  description: string;
  metaTitle: string;
  metaDescription: string;
  headline: string;
  subheadline: string;
  ctaText: string;
  faqs: FAQItem[];
  content: string[];
  accentColor: string;
  secondaryAccentColor?: string;
}

export interface Feature {
  slug: string;
  title: string;
  description: string;
  metaTitle: string;
  metaDescription: string;
  headline: string;
  subheadline: string;
  ctaText: string;
  ctaHref: string;
  secondaryLink?: {
    href: string;
    text: string;
  };
  iconColor:
    | "coral"
    | "purple"
    | "blue"
    | "mint"
    | "gold"
    | "pink"
    | "periwinkle"
    | "green"
    | "peach"
    | "violet"
    | "cyan"
    | "rose";
  faqs: FAQItem[];
  content: string[];
  subpages?: FeatureSubpage[];
  accentColor: string;
  secondaryAccentColor?: string;
}

export const features: Feature[] = [
  {
    slug: "assistant",
    title: "AI Assistant",
    description:
      "Powerful AI features built directly into your editor. Get writing assistance, generate content, and chat with your documents.",
    metaTitle: "AI Assistant Built-In - Lydie",
    metaDescription:
      "Get writing assistance, generate content, and chat with your documents using our integrated AI features. Built directly into the editor for seamless help.",
    headline: "AI Assistant Built-In",
    subheadline: "Get writing assistance, generate content, and chat with your documents.",
    ctaText: "Start writing with AI",
    ctaHref: "https://app.lydie.co/auth",
    secondaryLink: {
      href: "https://lydie.co/blog",
      text: "Learn more",
    },
    iconColor: "purple",
    accentColor: "#a855f7",
    secondaryAccentColor: "#ec4899",
    faqs: [
      {
        q: "How does the AI assistant work in Lydie?",
        a: "Lydie's AI assistant is integrated directly into the editor using advanced language models. You can access it through slash commands, selected text actions, or the chat sidebar. The AI understands your document context and provides relevant suggestions, completions, and answers based on what you're working on.",
      },
      {
        q: "What can I use the AI assistant for?",
        a: "The AI assistant can help with writing and editing tasks like expanding bullet points into full paragraphs, summarizing long sections, improving grammar and style, brainstorming ideas, generating outlines, and answering questions about your document content. It's designed to enhance your workflow without replacing your creativity.",
      },
      {
        q: "Is my content secure when using AI features?",
        a: "Yes. Lydie processes AI requests securely and does not use your private document content to train AI models. Your data is transmitted over encrypted connections and processed according to strict privacy policies. We only send the necessary context to provide helpful AI responses.",
      },
      {
        q: "Do I need to pay extra for AI features?",
        a: "AI features are included in all Lydie plans with generous usage limits. Free plans include a monthly allowance of AI requests, while paid plans offer significantly higher limits. You can check your current usage and limits in your account settings.",
      },
    ],
    content: [
      "Lydie's AI assistant is built directly into the editor, providing seamless writing assistance, content generation, and document chat capabilities. Unlike browser extensions or add-ons, our AI features are integrated at the core of the editing experience, giving you instant access to powerful AI tools without leaving your document.",
      "Get instant writing suggestions as you type, generate complete drafts from outlines, expand bullet points into full paragraphs, and chat with your documents to find information or get answers. Our AI understands context and provides relevant help whether you're writing articles, documentation, blog posts, or any other content. Perfect for content creators, knowledge workers, and anyone who wants AI-powered writing assistance that feels natural and unobtrusive.",
    ],
    subpages: [
      {
        slug: "chat-with-documents",
        title: "Chat with Documents",
        description:
          "Ask questions about your documents and get instant answers. Our AI understands your content and provides contextual responses.",
        metaTitle: "Chat with Your Documents - Lydie",
        metaDescription:
          "Ask questions about your content, get instant answers from your knowledge base, and have natural conversations with your documents using AI.",
        headline: "Chat with Your Documents",
        subheadline:
          "Ask questions about your content, get instant answers, and unlock insights from your knowledge base using natural conversation.",
        ctaText: "Start chatting",
        accentColor: "#ec4899",
        secondaryAccentColor: "#6366f1",
        faqs: [
          {
            q: "How does document chat work?",
            a: "The AI can read and understand your documents, then answer questions about their content in natural language. You can ask specific questions, request summaries, or have the AI find and explain information from your documents. It's like having a knowledgeable assistant who has read everything in your workspace.",
          },
          {
            q: "Can the AI answer questions about multiple documents?",
            a: "Yes! The AI can search across all your documents to find relevant information and synthesize answers from multiple sources. This is particularly useful when you need to gather information spread across different notes, articles, or research documents.",
          },
          {
            q: "Does the AI provide sources for its answers?",
            a: "Yes. When the AI answers questions based on your documents, it can reference which documents it used and provide context about where the information came from. This makes it easy to verify answers and dive deeper into the original sources if needed.",
          },
        ],
        content: [
          "Lydie's document chat feature transforms your knowledge base into an interactive resource. Instead of manually searching through documents, simply ask questions in natural language and get instant, accurate answers drawn from your content. The AI reads and understands your documents, making it easy to retrieve information, gain insights, and explore your accumulated knowledge.",
          "Ask anything from simple factual questions to complex queries that require synthesizing information from multiple sources. The AI provides contextual answers with references to the original documents, making it easy to verify information and explore further.",
          "## Instant Information Retrieval",
          "Need to quickly find a specific detail, quote, or piece of information? Document chat makes knowledge retrieval instant. Instead of remembering which document contains what information or manually searching through files, just ask the AI. It searches across your entire knowledge base and provides precise answers with source references.",
          "Perfect for researchers who need to quickly locate information across extensive notes, writers who want to reference past work, project managers tracking details across multiple documents, and anyone who maintains a knowledge base and wants faster access to information.",
          "## Context-Aware Document Analysis",
          "When you're working on a document, the chat feature becomes even more powerful. It understands the current context and can answer questions about the document you're editing, suggest related information from other documents, or help you find specific sections. This context awareness makes the AI feel like a knowledgeable collaborator who understands both what you're working on and your broader knowledge base.",
          "The AI can also help you understand complex documents by explaining sections, summarizing key points, and identifying important themes. Turn long, dense documents into digestible insights through natural conversation.",
        ],
      },
      {
        slug: "document-organization",
        title: "Document Organization",
        description:
          "Let AI help you organize your documents with smart tagging, categorization, and structure suggestions.",
        metaTitle: "AI Document Organization - Lydie",
        metaDescription:
          "Let AI help organize your knowledge base, categorize documents, and maintain a clean workspace with intelligent document management assistance.",
        headline: "AI Document Organization",
        subheadline:
          "Let AI help organize your knowledge base, categorize documents, and maintain a clean workspace with intelligent management.",
        ctaText: "Organize with AI",
        accentColor: "#10b981",
        secondaryAccentColor: "#f59e0b",
        faqs: [
          {
            q: "How does AI help with document organization?",
            a: "The AI can analyze your documents, suggest logical categorization schemes, help you move documents to appropriate locations, and maintain an organized knowledge base. It understands document content and relationships, making intelligent suggestions about where documents should be filed and how they should be structured.",
          },
          {
            q: "Can the AI automatically organize my documents?",
            a: "The AI assists with organization but doesn't automatically reorganize without your input. You can ask it to suggest organization schemes, recommend where specific documents should go, or help move multiple documents at once. This ensures you maintain control while benefiting from AI-powered assistance.",
          },
          {
            q: "Can I ask the AI to create new folders or restructure my workspace?",
            a: "Yes! You can describe your desired organization structure, and the AI can help implement it by moving documents, suggesting new folder hierarchies, and helping you maintain consistency. Whether you want to organize by project, topic, date, or any other scheme, the AI adapts to your needs.",
          },
        ],
        content: [
          "As your knowledge base grows, keeping everything organized becomes challenging. Lydie's AI document organization assistant helps you maintain a clean, logical structure by analyzing document content, understanding relationships between documents, and suggesting intelligent organization schemes tailored to your workflow.",
          "Ask the AI to help organize documents by topic, project, date, or any other criteria. It can move multiple documents at once, suggest folder structures that make sense for your content, and help you maintain consistency across your workspace. The AI understands what's in your documents and can categorize them intelligently based on content, not just file names.",
          "## Smart Document Categorization",
          "The AI analyzes your documents to understand their content, purpose, and relationships. It can identify themes, recognize project associations, and suggest logical groupings that align with how you actually work. Whether you're managing a personal knowledge base or organizing team documentation, the AI adapts to your specific needs and preferences.",
          'You can ask natural language questions like "organize all my meeting notes from last month" or "move all documents about project X to their own folder," and the AI will handle the details while keeping you in control of the final decisions.',
          "## Maintain Organization Over Time",
          "Beyond initial organization, the AI helps you maintain a clean workspace as you create new content. It can suggest where new documents should go based on their content, identify documents that might be in the wrong place, and help you evolve your organization structure as your needs change.",
          "Perfect for knowledge workers, project managers, researchers, and anyone managing a large collection of documents who wants to spend less time organizing and more time creating.",
        ],
      },
      {
        slug: "research-assistant",
        title: "Research Assistant",
        description:
          "AI-powered research assistance that helps you find, summarize, and synthesize information from multiple sources.",
        metaTitle: "AI Research Assistant - Lydie",
        metaDescription:
          "Search the web, find information across your documents, and connect ideas with AI-powered research capabilities that bring knowledge to your fingertips.",
        headline: "AI Research Assistant",
        subheadline:
          "Search the web, find information across your documents, and connect ideas intelligently with powerful AI research capabilities.",
        ctaText: "Start researching",
        accentColor: "#06b6d4",
        secondaryAccentColor: "#8b5cf6",
        faqs: [
          {
            q: "How does the AI research assistant find information?",
            a: "The AI research assistant combines web search capabilities with intelligent document search across your entire knowledge base. It can find relevant information from the web, locate specific details in your existing documents, and connect related ideas across different sources to provide comprehensive research results.",
          },
          {
            q: "Can the AI search the web for current information?",
            a: "Yes! The AI has integrated web search capabilities, allowing it to find up-to-date information, verify facts, and research topics beyond your local documents. This is particularly useful for fact-checking, finding current statistics, or researching new topics while you write.",
          },
          {
            q: "How does the AI search my existing documents?",
            a: "The AI can search across all your documents to find relevant information, quotes, references, and ideas. It understands context and can find semantically related content, not just exact keyword matches. This makes it easy to rediscover past research, find related notes, and connect ideas across your knowledge base.",
          },
        ],
        content: [
          "Lydie's AI research assistant brings the power of web search and intelligent document search directly into your writing environment. No need to switch between browser tabs, note-taking apps, and your editor, the AI finds and synthesizes information from the web and your existing documents, presenting it right where you need it.",
          "Ask the AI to research a topic, verify a fact, or find related information, and it will search the web for current data while simultaneously exploring your document library for relevant past research. This dual-source approach ensures you have both fresh information and your accumulated knowledge at your fingertips.",
          "## Intelligent Knowledge Discovery",
          "The AI research assistant goes beyond simple keyword search. It understands context, can interpret semantic queries, and connects related ideas across different documents and sources. Ask questions in natural language, and the AI will find relevant information even if the exact keywords don't match.",
          "Perfect for researchers, journalists, content creators, students, and knowledge workers who need to quickly gather information, verify facts, and connect ideas across multiple sources. The AI handles the tedious work of searching and gathering, letting you focus on analysis and synthesis.",
          "## Web Search Integration",
          "The integrated web search capability means the AI can find current statistics, recent developments, breaking news, and up-to-date information on any topic. Whether you're fact-checking an article, researching a new subject, or looking for the latest developments in your field, the AI brings web research into your workflow seamlessly.",
        ],
      },
      {
        slug: "writing-assistant",
        title: "Writing Assistant",
        description:
          "Get AI-powered writing help with grammar, style, tone, and content suggestions as you write.",
        metaTitle: "AI Writing Assistant - Lydie",
        metaDescription:
          "Generate high-quality content, expand ideas into full drafts, and overcome writer's block with AI-powered writing assistance built directly into your editor.",
        headline: "AI Writing Assistant",
        subheadline:
          "Generate high-quality content, expand ideas into full drafts, and overcome writer's block with intelligent writing suggestions.",
        ctaText: "Start writing with AI",
        accentColor: "#a855f7",
        secondaryAccentColor: "#3b82f6",
        faqs: [
          {
            q: "How does the AI writing assistant help with content creation?",
            a: "The AI writing assistant can help you draft new documents from scratch, expand bullet points into full paragraphs, generate outlines, continue your writing, and suggest improvements to existing content. Simply describe what you want to write, and the AI will generate a draft that you can refine and customize.",
          },
          {
            q: "Can the AI write in my style or tone?",
            a: "Yes! The AI adapts to your writing style by understanding the context of your existing documents. You can also provide specific instructions about tone (professional, casual, technical, etc.) and the AI will adjust its suggestions accordingly. The more you use it, the better it understands your preferences.",
          },
          {
            q: "Does the AI replace human writers?",
            a: "No. The AI writing assistant is designed to augment your creativity, not replace it. Think of it as a collaborative writing partner that helps you overcome writer's block, speeds up drafting, and suggests ideas you might not have considered. The final content always reflects your voice, vision, and expertise.",
          },
        ],
        content: [
          "Lydie's AI writing assistant helps you create high-quality content faster. Whether you're starting from a blank page or expanding existing notes, the AI understands context and generates relevant, well-structured content that matches your style and intent.",
          "Simply describe what you want to write, and the AI will generate a complete draft. Expand bullet points into full paragraphs, create outlines that develop into detailed articles, or let the AI continue your writing when you're stuck. The AI can create new documents, expand existing content, and help you refine your ideas into polished prose.",
          "## Intelligent Content Generation",
          "The writing assistant excels at understanding context from your existing documents. It can adapt to different writing styles, whether you need professional documentation, casual blog posts, technical guides, or creative content. The AI generates coherent drafts that you can edit and customize, saving you hours of initial writing time.",
          "Perfect for content creators, bloggers, technical writers, marketers, and anyone who needs to produce written content regularly. The AI handles the heavy lifting of first drafts, letting you focus on refinement and adding your unique perspective.",
        ],
      },
    ],
  },
  {
    slug: "collaborative-editing",
    title: "Collaborative Editing",
    description:
      "Real-time collaboration with your team. See live cursors, instant updates, and seamless teamwork.",
    metaTitle: "Real-Time Collaborative Editing - Lydie",
    metaDescription:
      "Work together seamlessly with your team. See changes as they happen, with live cursors, instant updates, and built-in communication tools.",
    headline: "Real-Time Collaborative Editing",
    subheadline:
      "Work together seamlessly with your team. See changes as they happen, with live cursors, instant updates, and no version conflicts.",
    ctaText: "Start collaborating",
    ctaHref: "https://app.lydie.co/auth",
    secondaryLink: {
      href: "https://lydie.co/blog/real-time-collaboration-implementation-in-lydie",
      text: "Behind the scenes",
    },
    iconColor: "blue",
    accentColor: "#30bced",
    secondaryAccentColor: "#6eeb83",
    faqs: [
      {
        q: "How does real-time collaboration work in Lydie?",
        a: "Lydie uses CRDT (Conflict-free Replicated Data Type) technology to enable real-time collaboration. When multiple users edit the same document simultaneously, all changes are synchronized instantly across all connected devices. Each user sees live cursors showing where others are working, and edits merge seamlessly without conflicts.",
      },
      {
        q: "Can I see who is currently viewing or editing a document?",
        a: "Yes! Lydie shows presence indicators and live cursors for all active collaborators. You'll see colored cursors with user names showing exactly where each person is working in the document. The sidebar also displays avatars of everyone currently viewing or editing.",
      },
      {
        q: "What happens if two people edit the same text at the same time?",
        a: "Lydie's CRDT-based architecture automatically handles concurrent edits without conflicts. Both changes are preserved and merged intelligently. You never have to worry about 'version conflicts' or lost edits, even when multiple people type in the same area simultaneously.",
      },
      {
        q: "Do I need an internet connection to use collaboration features?",
        a: "Yes. Real-time collaboration requires an internet connection to sync changes between users.",
      },
      {
        q: "Is there a limit to how many people can collaborate on a document?",
        a: "There's no hard limit on the number of collaborators. However, for optimal performance, we recommend keeping documents to under 100 concurrent editors. For most teams and use cases, this is more than sufficient.",
      },
    ],
    content: [
      "Lydie's real-time collaborative editing feature enables multiple team members to work together on the same document simultaneously. Built on advanced CRDT (Conflict-free Replicated Data Type) technology, our collaborative editing software ensures that all changes sync instantly across all devices without conflicts or lost edits.",
      "With live cursors showing where teammates are working, presence indicators displaying who's currently active, and seamless synchronization, Lydie provides a modern alternative to traditional collaborative editing tools like Google Docs. Whether you're working on documentation, articles, or project plans, our real-time collaborative editing makes team collaboration effortless and efficient.",
      "Learn more about how we implemented real-time collaboration in Lydie, including the technical details and architecture decisions behind our collaborative editing system.",
    ],
  },
  {
    slug: "search",
    title: "Search",
    description:
      "Find anything in your workspace instantly. Powerful full-text search with filters, shortcuts, and smart suggestions.",
    metaTitle: "Search - Lydie",
    metaDescription:
      "Find anything in your workspace instantly. Powerful full-text search with filters, shortcuts, and smart suggestions.",
    headline: "Powerful Search",
    subheadline:
      "Find anything in your workspace instantly. Powerful full-text search with filters, shortcuts, and smart suggestions.",
    ctaText: "Start searching",
    ctaHref: "https://app.lydie.co/auth",
    iconColor: "cyan",
    accentColor: "#3b82f6",
    faqs: [
      {
        q: "How does search work in Lydie?",
        a: "Lydie uses full-text search across all your documents. You can search by content, titles, or use filters to narrow results. Search supports fuzzy matching to help you find what you're looking for even with typos.",
      },
      {
        q: "Can I search within specific folders or tags?",
        a: "Yes! Use filters to search within specific folders, by tags, or by document type. This helps you find exactly what you need in large knowledge bases.",
      },
    ],
    content: [
      "Lydie's powerful search helps you find anything in your workspace instantly. Use full-text search across all documents, apply filters to narrow results, and leverage smart suggestions to discover related content.",
      "Search supports keyboard shortcuts for quick access, fuzzy matching to handle typos, and advanced operators for precise queries. Never lose track of important information again.",
    ],
  },
  {
    slug: "linking",
    title: "Internal Linking",
    description:
      "Connect your ideas with bidirectional links. Create a web of knowledge and discover connections between your documents.",
    metaTitle: "Internal Linking - Lydie",
    metaDescription:
      "Connect your ideas with bidirectional links. Create a web of knowledge and discover connections between your documents.",
    headline: "Internal Linking",
    subheadline:
      "Connect your ideas with bidirectional links. Create a web of knowledge and discover connections between your documents.",
    ctaText: "Start linking",
    ctaHref: "https://app.lydie.co/auth",
    iconColor: "violet",
    accentColor: "#8b5cf6",
    faqs: [
      {
        q: "What are bidirectional links?",
        a: "Bidirectional links create connections between documents in both directions. When you link from Document A to Document B, Document B automatically shows that it's linked from Document A. This helps you discover connections and navigate your knowledge base.",
      },
      {
        q: "How do I create links between documents?",
        a: "Simply type @ followed by the document name, or use the link menu in the editor. Lydie will suggest matching documents as you type, making it easy to connect related content.",
      },
    ],
    content: [
      "Lydie's internal linking feature helps you build a web of knowledge by connecting related documents with bidirectional links. See all the documents that link to a page, discover connections you might have missed, and navigate your knowledge base naturally.",
      "Use the @ mention syntax to quickly link to other documents, or browse the backlinks section to see how documents connect. Internal linking turns your knowledge base into a network of related ideas.",
    ],
  },
];

export function getFeature(slug: string): Feature | undefined {
  return features.find((feature) => feature.slug === slug);
}

export function getFeatureSubpage(
  featureSlug: string,
  subpageSlug: string,
): FeatureSubpage | undefined {
  const feature = getFeature(featureSlug);
  return feature?.subpages?.find((subpage) => subpage.slug === subpageSlug);
}

export function getAllFeatureSlugs(): string[] {
  return features.map((feature) => feature.slug);
}

export function getAllSubpagePaths(): Array<{
  featureSlug: string;
  subpageSlug: string;
}> {
  const paths: Array<{ featureSlug: string; subpageSlug: string }> = [];
  for (const feature of features) {
    if (feature.subpages) {
      for (const subpage of feature.subpages) {
        paths.push({ featureSlug: feature.slug, subpageSlug: subpage.slug });
      }
    }
  }
  return paths;
}

/**
 * Get all feature paths for sitemap generation
 */
export function getAllFeaturePaths(): Array<{ path: string }> {
  const paths: Array<{ path: string }> = [];

  for (const feature of features) {
    paths.push({ path: `/features/${feature.slug}` });
    if (feature.subpages) {
      for (const subpage of feature.subpages) {
        paths.push({ path: `/features/${feature.slug}/${subpage.slug}` });
      }
    }
  }

  return paths;
}
