export interface OnboardingGuideContent {
  parent: {
    title: string;
    content: any;
  };
  child: {
    title: string;
    content: any;
  };
}

export function getOnboardingGuideContent(childId: string): OnboardingGuideContent {
  return {
    parent: {
      title: "📚 Editor Guide",
      content: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: "📚 Welcome to Your Document Editor!" }],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "This guide will help you learn the powerful features of the editor. Let's explore!",
              },
            ],
          },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "🔗 Internal Links" }],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "You can link to other documents in your workspace. For example, check out the ",
              },
              {
                type: "text",
                text: "advanced features page",
                marks: [
                  {
                    type: "link",
                    attrs: {
                      href: `internal://${childId}`,
                    },
                  },
                ],
              },
              {
                type: "text",
                text: " to learn more!",
              },
            ],
          },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "✨ Formatting Options" }],
          },
          {
            type: "paragraph",
            content: [
              { type: "text", text: "You can use " },
              { type: "text", text: "bold", marks: [{ type: "bold" }] },
              { type: "text", text: " and " },
              { type: "text", text: "italic", marks: [{ type: "italic" }] },
              { type: "text", text: " formatting." },
            ],
          },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "💻 Code Blocks" }],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "You can add code blocks with syntax highlighting:",
              },
            ],
          },
          {
            type: "codeBlock",
            attrs: { language: "javascript" },
            content: [
              {
                type: "text",
                text: "function greet(name) {\n  console.log(`Hello, ${name}!`);\n}\n\ngreet('World');",
              },
            ],
          },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "📋 Lists" }],
          },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Create bullet lists" }],
                  },
                ],
              },
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Organize your thoughts" }],
                  },
                ],
              },
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Keep track of tasks" }],
                  },
                ],
              },
            ],
          },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "🎯 Next Steps" }],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Try editing this document, add your own content, and explore the child page below to learn about custom properties!",
              },
            ],
          },
        ],
      },
    },
    child: {
      title: "🚀 Advanced Features",
      content: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: "🚀 Advanced Features" }],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "This is a child page! Notice how it's nested under the main guide. You can create hierarchies of documents to organize your knowledge.",
              },
            ],
          },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "🏷️ Custom Properties" }],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "This document has custom properties set (check the sidebar!). You can add metadata to any document:",
              },
            ],
          },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: "Status: ",
                        marks: [{ type: "bold" }],
                      },
                      { type: "text", text: "In Progress" },
                    ],
                  },
                ],
              },
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: "Priority: ",
                        marks: [{ type: "bold" }],
                      },
                      { type: "text", text: "High" },
                    ],
                  },
                ],
              },
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: "Type: ",
                        marks: [{ type: "bold" }],
                      },
                      { type: "text", text: "Tutorial" },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "🎨 More Formatting" }],
          },
          {
            type: "paragraph",
            content: [
              { type: "text", text: "You can also use: " },
              {
                type: "text",
                text: "strikethrough",
                marks: [{ type: "strike" }],
              },
              { type: "text", text: " and create " },
              {
                type: "text",
                text: "links",
                marks: [{ type: "link", attrs: { href: "https://example.com" } }],
              },
              { type: "text", text: "." },
            ],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Now you're ready to create amazing documentation! Feel free to delete these guide pages when you're done exploring.",
              },
            ],
          },
        ],
      },
    },
  };
}
