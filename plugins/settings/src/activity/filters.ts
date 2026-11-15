import { actorRef } from "@lydie/plugin-api";
import type { Activity, Actor } from "@lydie/plugin-api";

type ActivityType = Activity["type"];

import { describeActor } from "./actors.ts";
import type { ActorInfo, Person } from "./actors.ts";

// The filters of the activity page and the `activity.list` input they make.

// `hosted`: changes to the workspace itself, which only a hosted workspace records.
export type EventGroup = {
  id: string;
  label: string;
  types: readonly ActivityType[];
  hosted?: boolean;
};

export const EVENT_GROUPS: readonly EventGroup[] = [
  { id: "created", label: "Created", types: ["doc.created"] },
  { id: "edited", label: "Edited", types: ["doc.bodyUpdated"] },
  { id: "renamed", label: "Renamed", types: ["doc.renamed"] },
  { id: "moved", label: "Moved", types: ["doc.moved"] },
  { id: "properties", label: "Properties", types: ["doc.propertiesChanged"] },
  {
    id: "deleted",
    label: "Deleted and restored",
    types: ["doc.deleted", "doc.restored", "doc.purged"],
  },
  {
    id: "files",
    label: "Files",
    types: ["attachment.created", "attachment.deleted", "attachment.restored", "attachment.purged"],
  },
  { id: "databases", label: "Databases", types: ["database.changed"] },
  {
    id: "members",
    label: "Members",
    hosted: true,
    types: [
      "member.invited",
      "invitation.revoked",
      "invitation.declined",
      "member.joined",
      "member.roleChanged",
      "member.removed",
      "member.left",
      "workspace.ownershipTransferred",
    ],
  },
  {
    id: "sharing",
    label: "Sharing",
    hosted: true,
    types: [
      "share.granted",
      "share.changed",
      "share.revoked",
      "share.restrictionChanged",
      "shareLink.created",
      "shareLink.changed",
      "shareLink.revoked",
    ],
  },
  {
    id: "teamspaces",
    label: "Teamspaces",
    hosted: true,
    types: [
      "teamspace.created",
      "teamspace.renamed",
      "teamspace.changed",
      "teamspace.visibilityChanged",
      "teamspace.deleted",
      "teamspace.restored",
      "teamspace.memberAdded",
      "teamspace.memberRemoved",
      "teamspace.memberRoleChanged",
    ],
  },
  {
    id: "integrations",
    label: "Integrations and tokens",
    hosted: true,
    types: [
      "apiToken.created",
      "apiToken.revoked",
      "oauthGrant.created",
      "oauthGrant.revoked",
      "connection.added",
      "connection.changed",
      "connection.removed",
      "publication.created",
      "publication.changed",
      "publication.removed",
      "publication.published",
      "publication.unpublished",
      "publication.failed",
    ],
  },
  {
    id: "workspace",
    label: "Workspace settings",
    hosted: true,
    types: [
      "workspace.created",
      "workspace.renamed",
      "workspace.imageChanged",
      "backup.frequencyChanged",
    ],
  },
];

// The groups a workspace can have rows for.
export const eventGroups = (hosted: boolean) => EVENT_GROUPS.filter((g) => hosted || !g.hosted);

// Someone to filter by. An agent app is one option over every ref it was seen with (its refs
// carry the session), so it filters by the sessions loaded so far.
export type PersonOption = {
  key: string;
  label: string;
  kind: ActorInfo["kind"];
  userId: string | null;
  image: string | null;
  refs: readonly string[];
};

const MAX_ACTORS = 100;

// The options: every member (or "You"), then whoever else was seen in what was loaded (kept
// across filters, so filtering by someone does not hide their option).
export function personOptions(
  members: ReadonlyMap<string, Person>,
  local: boolean,
  seen: readonly Actor[],
): PersonOption[] {
  const options = new Map<string, PersonOption>();
  const add = (info: ActorInfo, ref: string) => {
    const existing = options.get(info.key);
    if (existing) {
      if (!existing.refs.includes(ref))
        options.set(info.key, { ...existing, refs: [...existing.refs, ref] });
      return;
    }
    options.set(info.key, {
      key: info.key,
      label: info.name,
      kind: info.kind,
      userId: info.userId,
      image: info.image,
      refs: [ref],
    });
  };
  if (local && members.size === 0) {
    add(describeActor({ type: "user", id: "local" }, members, local), "local");
  }
  for (const id of members.keys()) {
    add(describeActor({ type: "user", id }, members, local), id);
  }
  for (const actor of seen) add(describeActor(actor, members, local), actorRef(actor));
  const rank = { user: 0, agent: 1, system: 2 } as const;
  return [...options.values()].sort(
    (a, b) => rank[a.kind] - rank[b.kind] || a.label.localeCompare(b.label),
  );
}

export type ActivityFilters = {
  search: string;
  people: readonly string[]; // PersonOption keys
  events: readonly string[]; // EventGroup ids
};

export const NO_FILTERS: ActivityFilters = { search: "", people: [], events: [] };

export const hasFilters = (f: ActivityFilters) =>
  f.search.trim() !== "" || f.people.length > 0 || f.events.length > 0;

export type ActivityQuery = {
  workspaceId: string;
  limit: number;
  search?: string;
  actors?: string[];
  types?: ActivityType[];
};

export function toQuery(
  workspaceId: string,
  filters: ActivityFilters,
  options: readonly PersonOption[],
  limit = 50,
): ActivityQuery {
  const query: ActivityQuery = { workspaceId, limit };
  const search = filters.search.trim().slice(0, 200);
  if (search) query.search = search;
  if (filters.people.length > 0) {
    const refs = new Set<string>();
    for (const key of filters.people) {
      const option = options.find((o) => o.key === key);
      if (option) for (const ref of option.refs) refs.add(ref);
      // A person not among the options (yet) is still their user id.
      else if (key.startsWith("user:")) refs.add(key.slice("user:".length));
    }
    // Nobody to match: ask for an actor that cannot exist rather than everyone.
    query.actors = refs.size > 0 ? [...refs].slice(0, MAX_ACTORS) : ["system:none"];
  }
  if (filters.events.length > 0) {
    const types = new Set<ActivityType>();
    for (const id of filters.events) {
      for (const type of EVENT_GROUPS.find((g) => g.id === id)?.types ?? []) types.add(type);
    }
    if (types.size > 0) query.types = [...types];
  }
  return query;
}

// `seen` with the actors of `items` added (the same array when there is nobody new).
export function addSeen(seen: readonly Actor[], items: readonly Activity[]): readonly Actor[] {
  const refs = new Set(seen.map(actorRef));
  const added: Actor[] = [];
  for (const item of items) {
    const ref = actorRef(item.actor);
    if (refs.has(ref)) continue;
    refs.add(ref);
    added.push(item.actor);
  }
  return added.length > 0 ? [...seen, ...added] : seen;
}

export function toggle(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}
