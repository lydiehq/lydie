import { appName } from "@lydie/plugin-api";
import type { Activity, Actor } from "@lydie/plugin-api";

type ActivityType = Activity["type"];

// Who worked on a page, from its activity: one entry per person, per agent and the person it
// worked for, and per system actor, newest first. The seeds are the activity log's, so everyone
// looks the same here, there and in comments.

// The user id a folder or browser workspace runs as.
export const LOCAL_USER_ID = "local";
// An agent that changed the page this recently is shown as still writing.
export const WRITING_MS = 2 * 60_000;

export type Person = { name: string | null; email: string | null; image: string | null };
export type People = ReadonlyMap<string, Person>;

export type Contributor = {
  key: string;
  actor: Actor;
  // What they did, each kind once, in the order of `WORK`.
  types: ActivityType[];
  lastAt: string;
};

const keyOf = (actor: Actor) =>
  actor.type === "agent"
    ? `agent:${actor.app.toLowerCase()}:${actor.onBehalfOf}`
    : `${actor.type}:${actor.id}`;

export function contributorsOf(items: readonly Activity[]): Contributor[] {
  const byKey = new Map<string, { actor: Actor; types: Set<ActivityType>; lastAt: string }>();
  for (const item of items) {
    const key = keyOf(item.actor);
    const entry = byKey.get(key);
    if (!entry) {
      byKey.set(key, { actor: item.actor, types: new Set([item.type]), lastAt: item.lastAt });
      continue;
    }
    entry.types.add(item.type);
    if (item.lastAt > entry.lastAt) entry.lastAt = item.lastAt;
  }
  return [...byKey]
    .map(([key, { actor, types, lastAt }]) => ({
      key,
      actor,
      types: WORK.flatMap(([kinds]) => kinds.filter((t) => types.has(t))),
      lastAt,
    }))
    .sort((a, b) => (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0));
}

// Worth a button only when someone besides you had a hand in it: an agent, or another person.
// The system alone (sync, restores) is not.
export function othersWorkedOn(contributors: readonly Contributor[], me: string | null): boolean {
  return contributors.some(
    (c) => c.actor.type === "agent" || (c.actor.type === "user" && c.actor.id !== me),
  );
}

// The newest contributor while it is an agent that changed the page in the last two minutes:
// until when it counts as writing (ms since the epoch), else null.
export function writingUntil(contributors: readonly Contributor[]): number | null {
  const newest = contributors[0];
  if (newest?.actor.type !== "agent") return null;
  const at = Date.parse(newest.lastAt);
  return Number.isNaN(at) ? null : at + WRITING_MS;
}

const WORK: [ActivityType[], string][] = [
  [["doc.created"], "created the page"],
  [["doc.bodyUpdated"], "edited"],
  [["doc.renamed"], "renamed"],
  [["doc.propertiesChanged"], "changed properties"],
  [["database.changed"], "changed the collection"],
  [["doc.moved"], "moved"],
  [
    [
      "thread.created",
      "thread.replied",
      "thread.updated",
      "thread.resolved",
      "thread.deleted",
      "thread.restored",
    ],
    "commented",
  ],
  [["doc.deleted"], "moved to the trash"],
  [["doc.restored"], "restored"],
];

// "Created the page, edited, commented": what they did, at most three things.
export function workOf(types: readonly ActivityType[]): string {
  const said = WORK.filter(([kinds]) => kinds.some((t) => types.includes(t))).map(([, s]) => s);
  const text = said.slice(0, 3).join(", ") || "changed the page";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export type Who = {
  name: string;
  // The person an agent worked for, when more than one person could have asked.
  forName: string | null;
  avatar:
    | { kind: "person"; seed: string; image: string | null }
    | { kind: "agent"; seed: string; behalf: { seed: string; image: string | null } | null }
    | { kind: "lydie" };
};

// `people`: the workspace's members by user id (empty outside a hosted workspace). `me`: this
// window's user, who reads as "You".
export function whoIs(actor: Actor, people: People, me: string | null): Who {
  const personName = (id: string) => {
    if (id === me || id === LOCAL_USER_ID) return "You";
    const person = people.get(id);
    return person?.name || person?.email || "A former member";
  };
  switch (actor.type) {
    case "user":
      return {
        name: personName(actor.id),
        forName: null,
        avatar: { kind: "person", seed: actor.id, image: people.get(actor.id)?.image ?? null },
      };
    case "agent": {
      const several = people.size > 1;
      return {
        name: appName(actor.app),
        forName: several ? (actor.onBehalfOf === me ? "you" : personName(actor.onBehalfOf)) : null,
        avatar: {
          kind: "agent",
          seed: `agent:${actor.app.toLowerCase()}`,
          behalf: several
            ? { seed: actor.onBehalfOf, image: people.get(actor.onBehalfOf)?.image ?? null }
            : null,
        },
      };
    }
    case "system":
      return {
        name: actor.id === "file-bridge" ? "File sync" : "Lydie",
        forName: null,
        avatar: { kind: "lydie" },
      };
  }
}

// The button's label: "Worked on by Claude, Maya and 2 others".
export function workedOnLabel(names: readonly string[]): string {
  const [first, second, third] = names;
  if (!first) return "Who worked on this";
  if (names.length === 1) return `Worked on by ${first}`;
  if (names.length === 2) return `Worked on by ${first} and ${second}`;
  if (names.length === 3) return `Worked on by ${first}, ${second} and ${third}`;
  const rest = names.length - 2;
  return `Worked on by ${first}, ${second} and ${rest} others`;
}
