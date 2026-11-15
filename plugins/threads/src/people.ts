import { appName, parseActorRef } from "@lydie/plugin-api";

export type Member = { name: string | null; image: string | null };
export type Members = ReadonlyMap<string, Member>;

// Who wrote something: a name, and the avatar to draw. The seeds are the activity log's, so a
// person or an agent looks the same in both.
export type Author = {
  name: string;
  avatar:
    | { kind: "person"; seed: string; image: string | null }
    | { kind: "agent"; seed: string; behalf: { seed: string; image: string | null } | null }
    | { kind: "lydie" };
};

export function authorOf(ref: string | null, members: Members): Author {
  if (!ref) return { name: "Someone", avatar: { kind: "person", seed: "someone", image: null } };
  const actor = parseActorRef(ref);
  if (actor.type === "system") {
    return {
      name: actor.id === "file-bridge" ? "Another program" : "Lydie",
      avatar: { kind: "lydie" },
    };
  }
  if (actor.type === "agent") {
    const app = actor.app ? appName(actor.app) : "An agent";
    const person = members.get(actor.onBehalfOf);
    return {
      name: person?.name ? `${app}, for ${person.name}` : app,
      avatar: {
        kind: "agent",
        seed: `agent:${actor.app.toLowerCase()}`,
        // Only where someone else could have asked.
        behalf: members.size > 1 ? { seed: actor.onBehalfOf, image: person?.image ?? null } : null,
      },
    };
  }
  const member = members.get(actor.id);
  // A folder or browser workspace has one person, "local".
  const name = member?.name ?? (actor.id === "local" ? "You" : "Someone");
  return { name, avatar: { kind: "person", seed: actor.id, image: member?.image ?? null } };
}

export function timeOf(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const sameDay = date.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(undefined, {
    ...(sameDay ? {} : { day: "numeric", month: "short" }),
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
