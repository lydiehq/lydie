import { definePlugin } from "@lydie/plugin-api";
import type { Editor } from "@lydie/plugin-api/editor";

import { Mermaid } from "./view.ts";

const STARTER = "flowchart LR\n  A[Start] --> B{Choice}\n  B -- Yes --> C[Done]\n  B -- No --> A";

export const mermaidPlugin = definePlugin({
  id: "mermaid",
  name: "Mermaid diagrams",
  description:
    "Draws Mermaid code blocks as diagrams, in the theme's colours. The file keeps the code block, as Obsidian and GitHub read it.",
  activate(ctx) {
    return ctx.editor.register({
      extensions: () => [Mermaid],
      slashItems: [
        {
          id: "mermaid.diagram",
          title: "Diagram",
          description: "A Mermaid diagram: flowchart, sequence, timeline and more.",
          keywords: ["mermaid", "flowchart", "chart", "graph", "sequence"],
          group: "Blocks",
          run: (editor: Editor) =>
            editor
              .chain()
              .focus()
              .insertContent({
                type: "codeBlock",
                attrs: { language: "mermaid" },
                content: [{ type: "text", text: STARTER }],
              })
              .run(),
        },
      ],
    });
  },
});

export default mermaidPlugin;
