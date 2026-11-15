import { parseActorRef } from "@lydie/plugin-api";
import type { DocumentVersion } from "@lydie/plugin-api";

// Who an actor ref is, in words. Folder workspaces have one person ("local"); agents are named by
// their app; the file bridge stands for whatever other program changed the file.
export function authorName(ref: string): string {
  const actor = parseActorRef(ref);
  if (actor.type === "agent") {
    return actor.app ? actor.app.charAt(0).toUpperCase() + actor.app.slice(1) : "An agent";
  }
  if (actor.type === "system") return actor.id === "file-bridge" ? "Another program" : "Lydie";
  return "You";
}

export function versionTitle(version: DocumentVersion): string {
  const authors = [...new Set(version.authors.map(authorName))];
  const by = authors.length > 0 ? authors.join(", ") : null;
  switch (version.kind) {
    case "restore":
      return by ? `Restored by ${by}` : "Restored";
    case "before_write":
      return "Earlier version";
    case "external":
      return version.label ?? "Changed outside Lydie";
    default:
      return by ? `Edited by ${by}` : "Edited";
  }
}

export function versionTime(iso: string, now = new Date()): string {
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
