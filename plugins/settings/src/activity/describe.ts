import type { Activity } from "@lydie/plugin-api";

type ActivityType = Activity["type"];

// An activity row as a sentence after the actor's name ("renamed Plan to Roadmap"). Pure: the page
// draws the parts, so the wording is tested here. One describer per type: event types, and on a
// hosted workspace changes to the workspace itself (members, teamspaces, sharing, tokens,
// publishing), which name what they are about from `data.subject`.

// `link`: the thing can be opened (a page or database that may still exist). Purged things and
// files are named, not linked. `current`: a page that still exists shows its title now ("created
// Roadmap", not the "Untitled" it was created as); a rename keeps the titles it was about.
export type SentencePart =
  | string
  | { kind: "target"; id: string; title: string; link: boolean; current: boolean }
  | { kind: "name"; text: string };

export type Sentence = {
  parts: SentencePart[];
  // A quiet time range after the sentence, for a row that stands for many changes over a while.
  range: { from: string; to: string } | null;
};

const UNTITLED = "Untitled";
// Property keys named before "and N more".
const KEYS_SHOWN = 3;
// Changes closer together than this read as one moment: no range.
const RANGE_MIN_MS = 60_000;

// Page options are frontmatter but not properties: name them for what they are.
const PAGE_OPTIONS: Record<string, string> = {
  icon: "the icon",
  cover: "the cover",
  "cover-position": "the cover",
  "full-width": "the page width",
};

type Describer = (a: Activity) => SentencePart[];

const titleOf = (a: Activity) => a.targetTitle?.trim() || UNTITLED;
// A row without a target (none of the event types) still reads: its title is named, not linked.
const target = (a: Activity, link = true, current = true): SentencePart =>
  a.targetId === null
    ? name(titleOf(a))
    : { kind: "target", current, id: a.targetId, title: titleOf(a), link };
const name = (text: string): SentencePart => ({ kind: "name", text });

type Subject = NonNullable<Activity["data"]["subject"]>;

// What a nameless subject is called.
const SOMEONE: Record<Subject["kind"], string> = {
  user: "someone",
  invitation: "someone",
  workspace: "the workspace",
  teamspace: "a teamspace",
  token: "a token",
  app: "an app",
  connection: "a connection",
  publication: "a destination",
  shareLink: "a share link",
};

const subjectName = (a: Activity, kind: Subject["kind"] = a.data.subject?.kind ?? "user") =>
  a.data.subject?.name?.trim() || SOMEONE[kind];
const subject = (a: Activity) => name(subjectName(a));

const ROLE: Record<string, string> = {
  owner: "owner",
  admin: "admin",
  member: "member",
  guest: "guest",
};
const article = (word: string) => (/^[aeiou]/.test(word) ? `an ${word}` : `a ${word}`);
const role = (r: string | undefined) => article(ROLE[r ?? "member"] ?? r ?? "member");

const LEVEL: Record<string, string> = {
  view: "can view",
  comment: "can comment",
  edit: "can edit",
  full: "full access",
};
const ACCESS: Record<string, string> = {
  view: "view",
  comment: "comment",
  edit: "edit",
  full: "full",
};

// "(can edit)", or nothing when the row does not say.
const levelNote = (a: Activity): string[] =>
  a.data.level ? [` (${LEVEL[a.data.level] ?? a.data.level})`] : [];

// Who a page was shared with: a person, a teamspace or everyone in the workspace.
function grantee(a: Activity): SentencePart[] {
  switch (a.data.subject?.kind) {
    case "teamspace":
      return ["the teamspace ", subject(a)];
    case "workspace":
      return ["everyone in ", name(subjectName(a, "workspace"))];
    default:
      return [subject(a)];
  }
}

// The person a member row is about did it themselves (joined, left).
const self = (a: Activity) =>
  a.data.subject?.kind === "user" &&
  ((a.actor.type === "user" && a.actor.id === a.data.subject.id) ||
    (a.actor.type === "agent" && a.actor.onBehalfOf === a.data.subject.id));

const teamspaceName = (a: Activity) =>
  name(a.data.teamspace?.name?.trim() || subjectName(a, "teamspace"));

// "WordPress", or "WordPress (Blog)" when the connection has a name of its own.
function service(a: Activity): SentencePart[] {
  const what = a.data.service;
  const named = a.data.subject?.name?.trim();
  if (!what) return [subject(a)];
  return named && named !== what ? [name(what), ` (${named})`] : [name(what)];
}

// Where a publication goes: its connection's name, else the service.
const destination = (a: Activity) =>
  name(a.data.subject?.name?.trim() || a.data.service || SOMEONE.publication);

// "and 3 pages", for a run that published more than its page.
function published(a: Activity): string[] {
  const parts: string[] = [];
  const others = (a.data.count ?? 1) - 1;
  if (others > 0) parts.push(` and ${plural(others, "page")} under it`);
  return parts;
}

const failedNote = (a: Activity): string[] =>
  a.data.failed ? [` (${plural(a.data.failed, "page")} failed)`] : [];

const VISIBILITY: Record<string, string> = { open: "open", closed: "closed", private: "private" };

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

// "and 3 pages inside it": `count` includes the page itself.
function inside(a: Activity): SentencePart[] {
  const others = (a.data.count ?? 1) - 1;
  return others > 0 ? [` and ${plural(others, "page")} inside it`] : [];
}

export function propertyList(keys: readonly string[]): string {
  const names = [...new Set(keys.map((k) => PAGE_OPTIONS[k] ?? k))];
  if (names.length <= KEYS_SHOWN + 1) return names.join(", ");
  return `${names.slice(0, KEYS_SHOWN).join(", ")} and ${names.length - KEYS_SHOWN} more`;
}

// Partial: event types the log does not describe yet read as "changed <title>".
const DESCRIBERS: Partial<Record<ActivityType, Describer>> = {
  "doc.created": (a) => ["created ", target(a)],
  "doc.renamed": (a) => {
    const before = a.data.previousTitle?.trim();
    return before !== undefined && before !== titleOf(a)
      ? ["renamed ", name(before || UNTITLED), " to ", target(a, true, false)]
      : ["renamed ", target(a, true, false)];
  },
  "doc.moved": (a) => {
    // Moved to another space: a teamspace, or Private (null).
    if (a.data.teamspace !== undefined) {
      return ["moved ", target(a), " to ", name(a.data.teamspace?.name?.trim() || "Private")];
    }
    return a.data.parentId === null && a.data.previousParentId
      ? ["moved ", target(a), " to the top level"]
      : ["moved ", target(a)];
  },
  "doc.deleted": (a) => ["deleted ", target(a), ...inside(a)],
  "doc.restored": (a) => ["restored ", target(a), ...inside(a)],
  "doc.purged": (a) => ["permanently deleted ", target(a, false), ...inside(a)],
  "doc.propertiesChanged": (a) => {
    const keys = a.data.keys ?? [];
    if (keys.length === 0) return ["changed the properties of ", target(a)];
    return keys.every((k) => k in PAGE_OPTIONS)
      ? [`changed ${propertyList(keys)} of `, target(a)]
      : [`changed ${propertyList(keys)} on `, target(a)];
  },
  "doc.bodyUpdated": (a) => ["edited ", target(a)],
  "attachment.created": (a) => ["added file ", target(a, false)],
  "attachment.deleted": (a) => ["deleted file ", target(a, false)],
  "attachment.restored": (a) => ["restored file ", target(a, false)],
  "attachment.purged": (a) => ["permanently deleted file ", target(a, false)],
  "database.changed": (a) => {
    switch (a.data.change) {
      case "views":
        return ["changed the views of ", target(a)];
      case "properties":
        return ["changed the properties of ", target(a)];
      case "options":
        return ["changed property options in ", target(a)];
      default:
        return ["changed the database ", target(a)];
    }
  },

  "workspace.created": (a) => ["created the workspace ", name(subjectName(a, "workspace"))],
  "workspace.renamed": (a) => {
    const before = a.data.previousName?.trim();
    if (before && before !== a.data.subject?.name) {
      return ["renamed the workspace ", name(before), " to ", subject(a)];
    }
    if (a.data.slug) return ["changed the workspace's address to ", name(`/w/${a.data.slug}`)];
    return ["renamed the workspace to ", subject(a)];
  },
  "workspace.imageChanged": () => ["changed the workspace's picture"],
  "workspace.ownershipTransferred": (a) => ["made ", subject(a), " the owner of the workspace"],
  "member.invited": (a) =>
    a.targetId
      ? ["invited ", subject(a), " to ", target(a), ...levelNote(a)]
      : ["invited ", subject(a), ` as ${role(a.data.role)}`],
  "invitation.revoked": (a) =>
    a.targetId
      ? ["cancelled the invitation of ", subject(a), " to ", target(a)]
      : ["cancelled the invitation of ", subject(a)],
  "invitation.declined": (a) =>
    a.targetId
      ? ["declined the invitation to ", target(a)]
      : ["declined the invitation to the workspace"],
  "member.joined": (a) =>
    a.data.role && a.data.role !== "member"
      ? [`joined the workspace as ${role(a.data.role)}`]
      : ["joined the workspace"],
  "member.roleChanged": (a) => {
    const to = ROLE[a.data.role ?? ""] ?? a.data.role ?? "member";
    const from = a.data.previousRole;
    if (self(a)) return [`became ${role(a.data.role)}`];
    return from && from !== a.data.role
      ? ["changed ", subject(a), `'s role from ${ROLE[from] ?? from} to ${to}`]
      : ["changed ", subject(a), `'s role to ${to}`];
  },
  "member.removed": (a) => ["removed ", subject(a), " from the workspace"],
  "member.left": () => ["left the workspace"],

  "teamspace.created": (a) => ["created the teamspace ", subject(a)],
  "teamspace.renamed": (a) => {
    const before = a.data.previousName?.trim();
    return before && before !== a.data.subject?.name
      ? ["renamed the teamspace ", name(before), " to ", subject(a)]
      : ["renamed the teamspace ", subject(a)];
  },
  "teamspace.changed": (a) => ["changed the teamspace ", subject(a)],
  "teamspace.visibilityChanged": (a) => [
    "made the teamspace ",
    subject(a),
    ` ${VISIBILITY[a.data.visibility ?? ""] ?? a.data.visibility ?? "open"}`,
  ],
  "teamspace.deleted": (a) => ["deleted the teamspace ", subject(a)],
  "teamspace.restored": (a) => ["restored the teamspace ", subject(a)],
  "teamspace.memberAdded": (a) => {
    if (self(a)) return ["joined the teamspace ", teamspaceName(a)];
    const owner = a.data.role === "owner" ? " as an owner" : "";
    return ["added ", subject(a), " to ", teamspaceName(a), owner];
  },
  "teamspace.memberRemoved": (a) =>
    self(a)
      ? ["left the teamspace ", teamspaceName(a)]
      : ["removed ", subject(a), " from ", teamspaceName(a)],
  "teamspace.memberRoleChanged": (a) => [
    "made ",
    subject(a),
    ` ${a.data.role === "owner" ? "an owner" : "a member"} of `,
    teamspaceName(a),
  ],

  "share.granted": (a) => [
    "shared ",
    target(a),
    " with ",
    ...grantee(a),
    ...(a.data.role === "guest" ? [" as a guest"] : []),
    ...levelNote(a),
  ],
  "share.changed": (a) => {
    const to = ACCESS[a.data.level ?? ""] ?? a.data.level;
    const from = a.data.previousLevel;
    return from && from !== a.data.level
      ? [
          "changed the access of ",
          ...grantee(a),
          " to ",
          target(a),
          ` from ${ACCESS[from]} to ${to}`,
        ]
      : ["changed the access of ", ...grantee(a), " to ", target(a), ...levelNote(a)];
  },
  "share.revoked": (a) => ["stopped sharing ", target(a), " with ", ...grantee(a)],
  "share.restrictionChanged": (a) =>
    a.data.restricted === false
      ? ["opened access to ", target(a)]
      : ["restricted access to ", target(a)],
  "shareLink.created": (a) => ["created a share link for ", target(a)],
  "shareLink.changed": (a) => ["changed a share link for ", target(a)],
  "shareLink.revoked": (a) => ["revoked a share link for ", target(a)],

  "apiToken.created": (a) => ["created the API token ", subject(a)],
  "apiToken.revoked": (a) => ["revoked the API token ", subject(a)],
  "oauthGrant.created": (a) => ["connected the app ", subject(a)],
  "oauthGrant.revoked": (a) => ["disconnected the app ", subject(a)],
  "connection.added": (a) => ["connected ", ...service(a)],
  "connection.changed": (a) => ["changed the connection to ", ...service(a)],
  "connection.removed": (a) => ["disconnected ", ...service(a)],
  "publication.created": (a) => ["set up publishing ", target(a), " to ", destination(a)],
  "publication.changed": (a) => ["changed publishing ", target(a), " to ", destination(a)],
  "publication.removed": (a) => ["stopped publishing ", target(a), " to ", destination(a)],
  "publication.published": (a) => [
    "published ",
    target(a),
    ...published(a),
    " to ",
    destination(a),
    ...failedNote(a),
  ],
  "publication.unpublished": (a) => ["unpublished ", target(a), " from ", destination(a)],
  "publication.failed": (a) => ["could not publish ", target(a), " to ", destination(a)],
  "backup.frequencyChanged": (a) =>
    a.data.frequency === "off"
      ? ["turned off automatic backups"]
      : [`turned on ${a.data.frequency ?? "automatic"} backups`],
};

export function describeActivity(a: Activity): Sentence {
  const describe = DESCRIBERS[a.type] ?? ((x: Activity) => ["changed ", target(x)]);
  const span = Date.parse(a.lastAt) - Date.parse(a.firstAt);
  return {
    parts: describe(a),
    range: a.count > 1 && span >= RANGE_MIN_MS ? { from: a.firstAt, to: a.lastAt } : null,
  };
}

// "14:02–14:40", or with dates when the range crosses a day.
export function formatRange(from: string, to: string): string {
  const a = new Date(from);
  const b = new Date(to);
  const sameDay = a.toDateString() === b.toDateString();
  const format = new Intl.DateTimeFormat(
    undefined,
    sameDay
      ? { hour: "numeric", minute: "2-digit" }
      : { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" },
  );
  return format.formatRange(a, b);
}

// The whole sentence as text (tests, accessible names).
export function sentenceText(sentence: Sentence): string {
  return sentence.parts
    .map((p) => (typeof p === "string" ? p : p.kind === "target" ? p.title : p.text))
    .join("");
}
