export function createOnboardingGuideContent(documentIdMap: Map<string, string>) {
  const welcomeDocId = documentIdMap.get("Welcome to Your Workspace") || "";
  const apolloKickoffId = documentIdMap.get("Project Apollo - Kickoff Notes") || "";
  const apolloArchitectureId = documentIdMap.get("Project Apollo - Architecture") || "";

  return {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "👋 Welcome to Your Workspace!" }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Welcome! This guide will help you get started with your new workspace. Complete the steps below to learn about the key features.",
          },
        ],
      },
      {
        type: "onboardingCallout",
        attrs: {
          type: "tip",
          icon: "lightbulb",
          title: "Learn by doing",
          content:
            "This onboarding happens right in the editor where you'll be working. Try out each feature as you go!",
        },
      },
      {
        type: "onboardingStep",
        attrs: {
          stepNumber: 1,
          title: "Explore the Editor",
          description: "Get familiar with the basics of writing and formatting in the editor.",
          tasks: [
            {
              id: "try-formatting",
              label: "Try bold, italic, or other text formatting",
              completed: false,
            },
            {
              id: "create-heading",
              label: "Create a heading using # at the start of a line",
              completed: false,
            },
            {
              id: "create-list",
              label: "Create a bulleted or numbered list",
              completed: false,
            },
          ],
        },
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Pro tip: You can use Markdown shortcuts like **bold** or *italic* for quick formatting.",
          },
        ],
      },
      {
        type: "onboardingStep",
        attrs: {
          stepNumber: 2,
          title: "Navigate with the Command Menu",
          description: "Learn to quickly find and navigate between documents.",
          tasks: [
            {
              id: "open-command-menu",
              label: "Press ⌘K (Cmd+K) or Ctrl+K to open the command menu",
              completed: false,
            },
            {
              id: "search-documents",
              label: "Search for a document using the command menu",
              completed: false,
            },
            {
              id: "navigate-to-doc",
              label: "Navigate to a demo document from the sidebar",
              completed: false,
            },
          ],
        },
      },
      {
        type: "onboardingCallout",
        attrs: {
          type: "info",
          icon: "info",
          title: "Demo documents",
          content:
            "We've created some demo documents as child pages under this onboarding guide. Check the sidebar to see them!",
        },
      },
      {
        type: "onboardingStep",
        attrs: {
          stepNumber: 3,
          title: "Link Documents Together",
          description: "Create connections between your documents to build a knowledge graph.",
          tasks: [
            {
              id: "create-internal-link",
              label: "Select text and press ⌘K to create an internal link",
              completed: false,
            },
            {
              id: "click-internal-link",
              label: "Click an internal link to navigate between documents",
              completed: false,
            },
            {
              id: "view-backlinks",
              label: "Check the sidebar to see backlinks to this document",
              completed: false,
            },
          ],
        },
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Try creating a link to the ",
          },
          ...(apolloKickoffId
            ? [
                {
                  type: "text",
                  text: "Project Apollo Kickoff Notes",
                  marks: [
                    {
                      type: "link",
                      attrs: {
                        href: `internal://${apolloKickoffId}`,
                      },
                    },
                  ],
                },
              ]
            : [{ type: "text", text: "Project Apollo Kickoff Notes" }]),
          {
            type: "text",
            text: " or browse the ",
          },
          ...(apolloArchitectureId
            ? [
                {
                  type: "text",
                  text: "Architecture Diagram",
                  marks: [
                    {
                      type: "link",
                      attrs: {
                        href: `internal://${apolloArchitectureId}`,
                      },
                    },
                  ],
                },
              ]
            : [{ type: "text", text: "Architecture Diagram" }]),
          {
            type: "text",
            text: ".",
          },
        ],
      },
      {
        type: "onboardingStep",
        attrs: {
          stepNumber: 4,
          title: "Organize with Properties",
          description: "Add custom properties to documents to categorize and filter your content.",
          tasks: [
            {
              id: "view-properties",
              label: "Check the sidebar to see this document's properties",
              completed: false,
            },
            {
              id: "add-property",
              label: "Add a custom property to a document",
              completed: false,
            },
            {
              id: "edit-property",
              label: "Edit an existing property value",
              completed: false,
            },
          ],
        },
      },
      {
        type: "onboardingCallout",
        attrs: {
          type: "tip",
          icon: "lightbulb",
          title: "Custom properties",
          content:
            "Properties help you organize documents by status, priority, type, or any custom field you create!",
        },
      },
      {
        type: "onboardingStep",
        attrs: {
          stepNumber: 5,
          title: "Use the AI Assistant",
          description: "Get help organizing, improving, and working with your documents.",
          tasks: [
            {
              id: "open-assistant",
              label: "Click the assistant icon to open the AI chat",
              completed: false,
            },
            {
              id: "ask-question",
              label: "Ask the assistant a question about your documents",
              completed: false,
            },
            {
              id: "try-command",
              label: "Try asking the assistant to help improve or organize content",
              completed: false,
            },
          ],
        },
      },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "🎉 You're all set!" }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Once you've completed the steps above, you can delete this onboarding guide and all the demo documents. Just delete this page and all child pages will be removed too!",
          },
        ],
      },
      {
        type: "onboardingCallout",
        attrs: {
          type: "success",
          icon: "checkmark",
          title: "Ready to start?",
          content:
            "Feel free to explore the demo documents, or delete this guide and start creating your own content!",
        },
      },
    ],
  };
}
