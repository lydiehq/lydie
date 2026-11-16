// The button and the list as markup (react-dom/server: no DOM needed). Loading and the popover's
// opening are React Aria's and the host's; what is drawn from the contributors is checked here.
import { describe, expect, it } from "bun:test";

import type { Activity, Actor } from "@lydie/plugin-api";
import { renderToStaticMarkup } from "react-dom/server";

import { contributorsOf, whoIs } from "./contributors.ts";
import { WhoPanel, WhoWorked } from "./WhoWorked.tsx";

const maya: Actor = { type: "user", id: "maya" };
const claude: Actor = { type: "agent", app: "claude-code", id: "s1", onBehalfOf: "maya" };
const people = new Map([
  ["maya", { name: "Maya Lindqvist", email: null, image: null }],
  ["jonas", { name: "Jonas Berg", email: null, image: null }],
]);

let n = 0;
function row(actor: Actor, type: Activity["type"], minutesAgo: number): Activity {
  n += 1;
  const at = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    workspaceId: "w1",
    actor,
    sessionId: null,
    type,
    targetId: "11111111-1111-4111-8111-111111111111",
    targetTitle: "Roadmap",
    data: {},
    count: 1,
    firstAt: at,
    lastAt: at,
  };
}

const contributors = contributorsOf([
  row(claude, "doc.bodyUpdated", 1),
  row(maya, "doc.created", 60),
  row({ type: "user", id: "jonas" }, "thread.created", 90),
  row({ type: "agent", app: "cursor", id: "s2", onBehalfOf: "jonas" }, "doc.renamed", 120),
]);

describe("WhoWorked", () => {
  it("names everyone in the button's label and shows three faces and a count", () => {
    const html = renderToStaticMarkup(
      <WhoWorked
        contributors={contributors}
        people={people}
        me="jonas"
        writing={false}
        onVersions={null}
        onActivity={null}
      />,
    );
    expect(html).toContain('aria-label="Worked on by Claude Code, Maya Lindqvist and 2 others"');
    expect(html.match(/data-bot-avatar/g)).toHaveLength(1);
    expect(html).toContain("+1");
    // Maya and you; in the pile Claude goes without Maya as a badge.
    expect(html.match(/data-avatar/g)).toHaveLength(2);
  });

  it("circles the agent that is writing", () => {
    const html = renderToStaticMarkup(
      <WhoWorked
        contributors={contributors}
        people={people}
        me="jonas"
        writing
        onVersions={null}
        onActivity={null}
      />,
    );
    expect(html.match(/data-writing/g)).toHaveLength(1);
  });
});

describe("WhoPanel", () => {
  it("lists each one with whom an agent worked for, what they did and when", () => {
    const who = contributors.map((c) => whoIs(c.actor, people, "jonas"));
    const html = renderToStaticMarkup(
      <WhoPanel
        contributors={contributors}
        who={who}
        writing
        onVersions={() => {}}
        onActivity={null}
      />,
    );
    const text = html.replace(/<[^>]+>/g, "|");
    expect(text).toContain("Claude Code| for Maya Lindqvist|");
    expect(text).toContain("Writing now");
    expect(text).toContain("Maya Lindqvist||");
    expect(text).toContain("Created the page");
    expect(text).toContain("You");
    expect(text).toContain("Commented");
    expect(text).toContain("Cursor| for you|");
    expect(text).toContain("Version history");
    expect(text).not.toContain("All activity");
  });
});
