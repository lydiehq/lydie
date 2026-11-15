// The "Getting started" page a new workspace starts with (LYD-313): a real page the user reads,
// ticks off and deletes. The content is data here so the local app, the desktop app and the core
// all create the same page through ordinary operations (`createGettingStarted` in @lydie/runtime).
//
// Ids are derived from the workspace id, so the page can be found (the home page links to it while
// it exists), opened first, and never created twice in one workspace.
import type { Color, PropertyType } from "./database/entities.ts";
import { hashSpelling, uuidFromBits } from "./ids.ts";

export const GETTING_STARTED_TITLE = "Getting started";

// Where the workspace lives decides how an AI assistant reaches it.
//   browser: this browser's local workspace (no MCP until it is synced)
//   folder: a folder opened in the desktop app (the local MCP server)
//   hosted: a synced workspace (the hosted /mcp endpoint at `mcpUrl`)
//   try: the try-out on the marketing site, in memory only (nothing is kept)
export type GettingStartedMode = "browser" | "folder" | "hosted" | "try";

export type GettingStartedOptions = {
  mode: GettingStartedMode;
  // Hosted: the MCP endpoint, e.g. https://api.lydie.co/mcp.
  mcpUrl?: string;
  // YYYY-MM-DD; the reading list's dates are relative to it.
  today: string;
};

export type StarterPage = {
  kind: "page";
  key: string;
  title: string;
  markdown: string;
  properties?: Record<string, string>;
  children?: readonly StarterNode[];
};

export type StarterDatabase = {
  kind: "database";
  key: string;
  title: string;
  properties: readonly {
    name: string;
    key: string;
    type: Extract<PropertyType, "select" | "date">;
    options?: readonly { name: string; color: Color }[];
  }[];
  // A board grouped by this property's key, next to the default table.
  boardBy?: string;
  rows: readonly { key: string; title: string; values: Record<string, string> }[];
};

export type StarterNode = StarterPage | StarterDatabase;

// cyrb128: four 32-bit lanes, enough spread that a derived id never meets a minted one. Not a
// security boundary: the worst a collision does is skip the page.
function hash128(text: string): bigint {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1, h2, h3, h4].reduce((acc, h) => (acc << 32n) | BigInt(h >>> 0), 0n);
}

// An id from 128 hashed bits: the same page of the same workspace always gets the same one.
export function starterId(workspaceId: string, key: string): string {
  return uuidFromBits(
    hash128(`lydie:getting-started\u0000${hashSpelling(workspaceId)}\u0000${key}`),
  );
}

// The Getting started page of a workspace (whether or not it exists).
export function gettingStartedId(workspaceId: string): string {
  return starterId(workspaceId, "root");
}

function addDays(today: string, days: number): string {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function assistantSection(options: GettingStartedOptions): string {
  if (options.mode === "hosted") {
    const url = options.mcpUrl ?? "https://api.lydie.co/mcp";
    return `## Connect an AI assistant

Claude, Cursor and other assistants can read and edit this workspace through MCP.

1. Add Lydie to your assistant as a remote MCP server: \`${url}\`
2. Sign in when it asks, and choose this workspace.
3. Ask it to add a book to your reading list.

In Claude Code that is one command: \`claude mcp add --transport http lydie ${url}\`. **Settings → Agents & API** has the setup for other assistants. You can undo everything an assistant changed in one step.`;
  }
  if (options.mode === "folder") {
    return `## Connect an AI assistant

Claude, Cursor and other assistants can read and edit this folder through MCP. Nothing leaves your computer.

1. Open **Settings → Agents & API** (**⌘,**) and turn on the server under **On this computer**.
2. Copy the setup for your assistant from the same page.
3. Ask it to add a book to your reading list.

Its changes are written to the Markdown files in this folder, and you can undo them in one step.`;
  }
  if (options.mode === "try") {
    return `## Connect an AI assistant

Claude, Cursor and other assistants can read and edit your notes through MCP once they are in Lydie Cloud, or when you open a folder in the desktop app.`;
  }
  return `## Connect an AI assistant

Claude, Cursor and other assistants can read and edit your notes through MCP once they are in Lydie Cloud, or when you open a folder in the desktop app. To put these notes there, sign in and choose **Move to cloud…** in the workspace menu. **Settings → Agents & API** then shows the setup.`;
}

// The page tree, in creation order. Keep it short: about three minutes to read and try.
export function gettingStarted(options: GettingStartedOptions): StarterPage {
  const intro =
    options.mode === "browser"
      ? "Lydie keeps your notes in this browser. Nothing is sent anywhere until you move them to Lydie Cloud.\n\n"
      : options.mode === "try"
        ? "This is a try-out: nothing you write here is kept. Open the app to keep your notes.\n\n"
        : "";
  return {
    kind: "page",
    key: "root",
    title: GETTING_STARTED_TITLE,
    // The page icon (frontmatter `icon`, the plugin API's PAGE_ICON_KEY).
    properties: { icon: "👋" },
    markdown: `${intro}This page shows the basics by doing them. Tick each box as you go. When you are done, delete the page: nothing else depends on it.

## Write

- [ ] Type \`/\` on an empty line to add a block: a heading, a to-do, a table, a callout.
- [ ] Type \`[[\` to link to another page. This page has one inside it: [[Links and backlinks]].
- [ ] Type \`@\` to mention a page or a date. Try \`@today\`.
- [ ] Hover over a line and drag the handle on its left to move it.
- [ ] Select a few words to make them bold, add a link or turn them into a heading.

## Find your way

- [ ] Press **⌘O** (Ctrl+O) to open any page by its title.
- [ ] Press **⌘K** (Ctrl+K) to run any command.
- [ ] Press **⌘Z** (Ctrl+Z) to undo. Deleted pages go to the trash, so you can get them back.

## Organise

- [ ] Drag a page onto another one in the sidebar to put it inside.
- [ ] Add a book to the reading list below. Each row is a page of its own, with its properties at the top. Switch to the board to move books between columns.

![[Reading list.base]]

${assistantSection(options)}
`,
    children: [
      {
        kind: "page",
        key: "links",
        title: "Links and backlinks",
        markdown: `You came here through a link. Links are how pages find each other.

- [[Getting started]] links to this page, so it shows under **Linked mentions** in the **Links** panel on the right.
- Link to a part of a page by adding a heading: [[Getting started#Organise]].
- A link can point to a page that does not exist yet, like [[My first idea]]. Click it and choose **Create note**.
`,
      },
      {
        kind: "database",
        key: "reading-list",
        title: "Reading list",
        properties: [
          {
            name: "Status",
            key: "status",
            type: "select",
            options: [
              { name: "To read", color: "gray" },
              { name: "Reading", color: "blue" },
              { name: "Done", color: "green" },
            ],
          },
          { name: "Finished", key: "finished", type: "date" },
        ],
        boardBy: "status",
        rows: [
          {
            key: "book-1",
            title: "The Design of Everyday Things",
            values: { status: "Done", finished: addDays(options.today, -12) },
          },
          { key: "book-2", title: "Thinking in Systems", values: { status: "Reading" } },
          { key: "book-3", title: "How to Take Smart Notes", values: { status: "To read" } },
        ],
      },
    ],
  };
}
