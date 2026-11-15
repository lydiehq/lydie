import { definePlugin } from "@lydie/plugin-api";

function Instructions() {
  return (
    <ol className="list-decimal space-y-1 pl-5">
      <li>
        In Notion, open Settings, then Workspace → General, and choose “Export all workspace
        content”. For one page and what is inside it, use the page’s ••• menu → Export.
      </li>
      <li>
        Set the export format to <strong>HTML</strong>, include everything and, for a page,
        subpages. HTML keeps database property types, colours and relations; Markdown &amp; CSV does
        not.
      </li>
      <li>Notion emails a link to a .zip file. Download it and pick it here, without unzipping.</li>
    </ol>
  );
}

export const importNotionPlugin = definePlugin({
  id: "import-notion",
  name: "Notion import",
  description: "Imports pages and databases from a Notion export.",
  activate(ctx) {
    ctx.importers.register({
      id: "notion",
      name: "Notion",
      description: "Pages, databases, files and the links between them, from a Notion export.",
      order: 10,
      accept: [".zip", ".html"],
      instructions: <Instructions />,
      // The parser is only fetched when someone imports.
      read: async (files, context) => (await import("./read.ts")).readNotionExport(files, context),
    });
  },
});

export default importNotionPlugin;
