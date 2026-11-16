import type { ChangelogEntry } from "../types.ts";

export const lydieV2: ChangelogEntry = {
  id: "lydie-v2",
  date: "2026-11-15",
  title: "Lydie v2",
  summary:
    "We rebuilt Lydie from the ground up. It is a writing app for the web and Mac that works on a folder of plain Markdown files, or on a cloud workspace you edit with your team in real time.",
  sections: [
    {
      heading: "Your files stay plain Markdown",
      paragraphs: [
        "Open a folder and Lydie edits the files in place. There is no import and no special format: the same folder still opens in Obsidian, your code editor or git. You don't need an account, and a folder workspace never touches our servers.",
      ],
    },
    {
      heading: "Fast, and it works offline",
      paragraphs: [
        "Your workspace lives in a database on your device, so opening, switching and searching documents doesn't wait for a server.",
      ],
    },
    {
      heading: "Write the way you're used to",
      paragraphs: [
        "Type `/` for blocks, `[[` to link to another page and `@` for pages, dates and people. Pages can have properties, an icon and a cover, with the outline and the pages that link here beside the text.",
      ],
    },
    {
      heading: "Collections",
      paragraphs: [
        "Turn any page with sub-pages into a collection: the sub-pages share properties, and you see them as a table, board, list or calendar. Collections are saved as `.base` files, so they stay readable outside Lydie too.",
      ],
    },
    {
      heading: "Together in the cloud",
      paragraphs: [
        "Cloud workspaces sync between your devices. Invite your team, write together in real time, comment in the margin and share a page with a public link. You can export a workspace as a zip of plain Markdown files at any time, or have it backed up daily or weekly. Lydie Cloud is free for now; fair use applies.",
      ],
    },
    {
      heading: "Built for agents",
      paragraphs: [
        "Everything you can do in the app is also an API call, an MCP tool and a CLI command, so agents use the same actions you do, with the same permissions.",
      ],
    },
    {
      heading: "Open source",
      paragraphs: [
        "The app is open source under the AGPL-3.0. The hosted service behind cloud workspaces is not.",
      ],
    },
  ],
  links: [
    { label: "Create a free Lydie Cloud account", href: "https://app.lydie.co" },
    { label: "Read the developer docs", href: "https://developers.lydie.co" },
    { label: "See the source on GitHub", href: "https://github.com/lydiehq/lydie" },
  ],
};
