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
        type: "onboardingTextPractice",
        attrs: {
          tasks: [
            {
              id: "bold",
              label: "Bold some text",
              completed: false,
            },
            {
              id: "italic",
              label: "Italic some text",
              completed: false,
            },
            {
              id: "heading",
              label: "Create a heading",
              completed: false,
            },
          ],
        },
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Try formatting this text! Select text and use ",
              },
              {
                type: "text",
                text: "Cmd/Ctrl+B",
                marks: [{ type: "bold" }],
              },
              {
                type: "text",
                text: " for bold, ",
              },
              {
                type: "text",
                text: "Cmd/Ctrl+I",
                marks: [{ type: "bold" }],
              },
              {
                type: "text",
                text: " for italic, or type ",
              },
              {
                type: "text",
                text: "#",
                marks: [{ type: "bold" }],
              },
              {
                type: "text",
                text: " at the start of a line for a heading.",
              },
            ],
          },
        ],
      },
      {
        type: "onboardingAssistantTask",
        attrs: {
          completedTasks: [],
        },
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "The journalist sat in the dimly lit cafe, reviewing her notes one more time. The story had taken months to piece together—countless interviews, late nights chasing leads, and dead ends that threatened to derail everything. But now, with the evidence spread across the table, she finally had what she needed. Tomorrow's headline would change everything.",
              },
            ],
          },
        ],
      },
      {
        type: "onboardingPlaceholder",
        attrs: {
          title: "🚀 More Features Coming Soon",
          description: "We're adding more onboarding steps to help you learn about linking documents, properties, and more!",
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
