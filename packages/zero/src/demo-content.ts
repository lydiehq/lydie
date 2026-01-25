export function createIntroDocument(documentIdMap: Map<string, string>) {
  const apolloKickoffId = documentIdMap.get("Project Apollo - Kickoff Notes") || "";
  const apolloArchitectureId = documentIdMap.get("Project Apollo - Architecture") || "";
  const releaseChecklistId = documentIdMap.get("Release Checklist v1.0") || "";

  return {
    title: "Welcome to Your Workspace",
    content: {
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
              text: "This workspace contains demo content to help you explore the editor's powerful features. Let's discover what you can do!",
            },
          ],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "🔗 Internal Linking" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "One of the most powerful features is internal linking. You can create connections between documents to build a knowledge graph. For example, check out the ",
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
              text: " or explore the ",
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
              text: " to see how documents can be interconnected.",
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
              text: "Notice the custom properties in the sidebar! This document has properties like:",
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
                    { type: "text", text: "Getting Started" },
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
                    { type: "text", text: "Type: ", marks: [{ type: "bold" }] },
                    { type: "text", text: "Guide" },
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
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "You can add custom properties to any document to organize and filter your content. Try editing the properties in the sidebar!",
            },
          ],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "📝 Rich Text Editing" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "The editor supports rich formatting: " },
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
            { type: "text", text: ", " },
            { type: "text", text: "italic", marks: [{ type: "italic" }] },
            { type: "text", text: ", " },
            {
              type: "text",
              text: "strikethrough",
              marks: [{ type: "strike" }],
            },
            { type: "text", text: ", and more!" },
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
              text: "You can add syntax-highlighted code blocks. Check out the ",
            },
            ...(apolloArchitectureId
              ? [
                  {
                    type: "text",
                    text: "Architecture document",
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
              : [{ type: "text", text: "Architecture document" }]),
            {
              type: "text",
              text: " to see a Mermaid diagram example, or the ",
            },
            ...(releaseChecklistId
              ? [
                  {
                    type: "text",
                    text: "Release Checklist",
                    marks: [
                      {
                        type: "link",
                        attrs: {
                          href: `internal://${releaseChecklistId}`,
                        },
                      },
                    ],
                  },
                ]
              : [{ type: "text", text: "Release Checklist" }]),
            {
              type: "text",
              text: " to see task lists in action.",
            },
          ],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "📸 Screenshots & Images" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "You can add images and screenshots to your documents. Simply drag and drop images or use the image upload button. Screenshots are great for documenting processes and sharing visual information.",
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "💡 Tip: You can add screenshots here to show users how to use specific features. For example, you might include a screenshot of the custom properties panel or the internal link creation dialog.",
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
              text: "Now that you've seen the basics, explore the demo documents in this workspace. Try:",
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
                      text: "Click on internal links to navigate between documents",
                    },
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
                      text: "Edit documents to see the real-time collaboration features",
                    },
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
                      text: "Try the assistant chat to organize and manage your documents",
                    },
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
                      text: "Add custom properties to documents in the sidebar",
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Happy exploring! 🚀",
            },
          ],
        },
      ],
    },
    customFields: {
      isOnboarding: "true",
      Status: "Getting Started",
      Type: "Guide",
      Priority: "High",
    },
  };
}

export const demoContent = [
  {
    title: "Project Apollo - Kickoff Notes",
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Project Apollo Kickoff" }],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Attendees" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Sarah, Mike, Jessica, David" }],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Meeting Goals" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Align on the vision for Project Apollo (our next gen mobile app).",
            },
          ],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Rough Notes" }],
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
                      text: "Need to focus on speed first. The current app is too slow.",
                    },
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
                      text: "Design needs a refresh. Dark mode is a must-have for v1.",
                    },
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
                      text: "Sarah mentioned we should look at what Competitor X is doing with their notifications.",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    title: "Apollo Technical Rqmts",
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Apollo Technical Requirements" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "DRAFT - FOR REVIEW" }],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Core Stack" }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "React Native for mobile client" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Node.js backend" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Postgres database" }],
                },
              ],
            },
          ],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Performance Targets" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "App load time < 1.5s on 4G." }],
        },
      ],
    },
  },
  {
    title: "Marketing Brainstorming",
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Apollo Launch Ideas" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Just dumping some ideas here..." }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Teaser video with space theme?" }],
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
                      text: "Can we get an influencer to leak it?",
                    },
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
                      text: "Product Hunt launch is scheduled for June 1st.",
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Need new swag. Hoodies?" }],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    title: "User Interview - Sarah J.",
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Interview: Sarah Jenkins" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Date: Jan 12" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Sarah is a power user of our current desktop app but hates the mobile experience.",
            },
          ],
        },
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: '"I just want to be able to check my status quickly when I\'m on the train. The current app takes forever to load."',
                },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Feature request: Offline mode is critical for her.",
            },
          ],
        },
      ],
    },
  },
  {
    title: "User Interview - Mike T.",
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Interview: Mike Tyson (not that one)" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Mike uses the app for team collaboration." }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "He wants better notifications. He misses important updates.",
            },
          ],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "He likes the dark mode in the beta." }],
        },
      ],
    },
  },
  {
    title: "Competitor Analysis 2024",
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Competitor Landscape" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Looking at what Competitor X and Y are doing.",
            },
          ],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Competitor X" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "They just launched a new AI feature. It's okay, but kinda hallucinations-heavy.",
            },
          ],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Competitor Y" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Very cheap, but buggy. Support is terrible.",
            },
          ],
        },
      ],
    },
  },
  {
    title: "Q1 Goals - Company Wide",
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Q1 OKRs" }],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Objective 1: Launch Project Apollo Beta" }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "KR1: 1000 beta users" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "KR2: < 1% crash rate" }],
                },
              ],
            },
          ],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Objective 2: Hire 2 Backend Engineers" }],
        },
      ],
    },
  },
  {
    title: "Office WiFi & Misc",
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Office Stuff" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "WiFi SSID: Apollo_Guest" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Pass: SpaceRockets2024!" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Printer is always broken. Don't ask." }],
        },
      ],
    },
  },
  {
    title: "Friday Lunch Options",
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Where should we go this Friday?" }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Pizza place down the street" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Thai food" }],
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
                      text: "Tacos (Sarah is allergic to cilantro??)",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    title: "Project Apollo - Architecture",
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Architecture Diagram" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "We need to finalize the schema for the user profiles.",
            },
          ],
        },
        {
          type: "codeBlock",
          attrs: { language: "mermaid" },
          content: [
            {
              type: "text",
              text: "graph TD;\n    Client-->API;\n    API-->DB;\n    API-->Cache;",
            },
          ],
        },
      ],
    },
  },
  {
    title: "Release Checklist v1.0",
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Go Live Checklist" }],
        },
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: true },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "QA Signoff" }],
                },
              ],
            },
            {
              type: "taskItem",
              attrs: { checked: false },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Security Audit" }],
                },
              ],
            },
            {
              type: "taskItem",
              attrs: { checked: false },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Marketing Email Scheduled" }],
                },
              ],
            },
            {
              type: "taskItem",
              attrs: { checked: false },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Flip the switch" }],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    title: "Bug Report: Login failures",
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "URGENT: Login 500s" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Seeing a spike in 500 errors on the /login endpoint.",
            },
          ],
        },
        {
          type: "codeBlock",
          attrs: { language: "json" },
          content: [
            {
              type: "text",
              text: '{ "error": "Connection timeout", "code": 500 }',
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "David thinks it's the Redis instance acting up.",
            },
          ],
        },
      ],
    },
  },
  {
    title: "Newsletter Draft - Feb",
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Monthly Update" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Subject: Big things are coming..." }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Hey everyone, just a quick update to let you know we are hard at work on Project Apollo.",
            },
          ],
        },
      ],
    },
  },
  {
    title: "Team Sync - Jan 15",
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Weekly Sync" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Updates:" }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "David is OOO next week." }],
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
                      text: "We need to fix the coffee machine.",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
];
