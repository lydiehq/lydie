import { definePlugin } from "@lydie/plugin-api";

function Instructions() {
  return (
    <p>
      Pick a .zip of the folder, or the Markdown files themselves. Folders become pages, frontmatter
      becomes properties, and images and files the notes embed come along. An Obsidian vault or a
      Lydie export works as it is.
    </p>
  );
}

export const importMarkdownPlugin = definePlugin({
  id: "import-markdown",
  name: "Markdown import",
  description: "Imports a folder of Markdown files, such as an Obsidian vault.",
  activate(ctx) {
    ctx.importers.register({
      id: "markdown",
      name: "Markdown files",
      description: "A folder of notes, such as an Obsidian vault or a Lydie export.",
      order: 20,
      accept: [".zip", ".md", ".markdown"],
      instructions: <Instructions />,
      read: async (files, context) => (await import("./read.ts")).readMarkdownFiles(files, context),
    });
  },
});

export default importMarkdownPlugin;
