// Stable identifiers for onboarding documents
export const ONBOARDING_GUIDE_ID = "onboarding-guide";

export function createOnboardingGuideContent() {
  return {
    type: "doc",
    content: [
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
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "💡 Tip: Learn by doing - This onboarding happens right in the editor where you'll be working. Try out each feature as you go!",
          },
        ],
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
          description:
            "We're adding more onboarding steps to help you learn about linking documents, properties, and more!",
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
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "✓ Ready to start? Feel free to explore the demo documents, or delete this guide and start creating your own content!",
          },
        ],
      },
    ],
  };
}

export const demoContent = [
  {
    id: "demo-project-apollo-kickoff",
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
    id: "demo-apollo-technical-rqmts",
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
    id: "demo-marketing-brainstorming",
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
    id: "demo-user-interview-sarah",
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
    id: "demo-user-interview-mike",
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
    id: "demo-competitor-analysis-2024",
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
    id: "demo-q1-goals-company-wide",
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
    id: "demo-office-wifi-misc",
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
    id: "demo-friday-lunch-options",
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
    id: "demo-project-apollo-architecture",
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
    id: "demo-release-checklist-v1",
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
    id: "demo-bug-report-login-failures",
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
    id: "demo-newsletter-draft-feb",
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
    id: "demo-team-sync-jan-15",
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
