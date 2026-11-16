import { z } from "zod";

import { isUuid } from "./ids.ts";

// A UUID in lowercase (see `ids.ts`). Document ids are minted on the client so that offline
// creates, files and the operation log all agree on identity before the server sees them.
// The pattern is the short one agents and API clients are shown; `isUuid` checks the exact shape.
export const Uuid = z
  .string()
  .regex(/^[0-9a-f-]{36}$/, "Expected a UUID (lowercase)")
  .refine(isUuid, "Expected a UUID (lowercase)")
  .meta({ id: "Uuid", description: "UUID (lowercase, with hyphens)." });

export const WorkspaceId = z
  .string()
  .min(1)
  .max(64)
  .meta({ id: "WorkspaceId", description: "Workspace id." });

// ISO 8601 in UTC with a `Z` suffix, as produced by `Date#toISOString()`.
export const Timestamp = z.iso
  .datetime()
  .meta({ id: "Timestamp", description: "ISO 8601 UTC timestamp." });

// Fractional index (rocicorp/fractional-indexing, base 62). Siblings sort by `(sortKey, id)` using
// plain byte order, which SQLite's default BINARY collation and Postgres `COLLATE "C"` both give.
export const SortKey = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[0-9A-Za-z]+$/, "Expected a fractional index key")
  .meta({ id: "SortKey", description: "Fractional index key; siblings sort by (sortKey, id)." });

export const Title = z.string().trim().min(1).max(255);

// Typed frontmatter values. Dates are ISO strings; lists are string lists (tags, aliases).
export const PropertyValue = z
  .union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())])
  .meta({ id: "PropertyValue" });
export type PropertyValue = z.infer<typeof PropertyValue>;

export const PropertyKey = z.string().min(1).max(128);

export const Properties = z
  .record(PropertyKey, PropertyValue)
  .meta({ id: "Properties", description: "Typed frontmatter properties." });
export type Properties = z.infer<typeof Properties>;

export const Workspace = z
  .object({
    id: WorkspaceId,
    name: z.string().min(1).max(255),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  })
  .meta({ id: "Workspace" });
export type Workspace = z.infer<typeof Workspace>;

// Who created or last changed an entity, as stored in `created_by`/`updated_by` columns. A user is
// their plain user id (what the core stores), so the column stays a user id for humans; agents and
// the system get a prefix: `agent:<app>:<agentId>:<onBehalfOf>`, `system:<id>`. See `actorRef`.
export const ActorRef = z.string().min(1).meta({
  id: "ActorRef",
  description: "User id, or agent:<app>:<id>:<onBehalfOf>, or system:<id>.",
});
export type ActorRef = z.infer<typeof ActorRef>;

const authorship = {
  // Optional so rows from older peers parse; @lydie/store always fills them (null when unknown).
  createdBy: ActorRef.nullable().optional(),
  updatedBy: ActorRef.nullable().optional(),
};

// Mirrors the synced `documents` table (Postgres in the core, SQLite on the client):
// id, workspace_id, parent_id, title, sort_key, properties (JSON text), created_at, updated_at,
// deleted_at, created_by, updated_by.
export const Document = z
  .object({
    id: Uuid,
    workspaceId: WorkspaceId,
    parentId: Uuid.nullable(),
    title: Title,
    sortKey: SortKey,
    properties: Properties,
    createdAt: Timestamp,
    updatedAt: Timestamp,
    deletedAt: Timestamp.nullable(),
    ...authorship,
  })
  .meta({ id: "Document", description: "Document metadata. The body is not part of it." });
export type Document = z.infer<typeof Document>;

// Hosted only: the space a page is in (its teamspace, or the owner of a private section). Null in
// local mode; absent where the backend does not report it.
const space = {
  teamspaceId: z.string().nullable().optional(),
  privateOwnerId: z.string().nullable().optional(),
};

export const ChildEntry = Document.extend({
  childCount: z.number().int().min(0).describe("Live children, so a tree can show a disclosure."),
  ...space,
}).meta({ id: "ChildEntry" });
export type ChildEntry = z.infer<typeof ChildEntry>;

export const TreeEntry = Document.extend({
  depth: z.number().int().min(0).describe("0 for the top level of the listed tree."),
  ...space,
}).meta({ id: "TreeEntry" });
export type TreeEntry = z.infer<typeof TreeEntry>;

export const DocumentBody = z
  .object({
    markdown: z.string(),
    version: z.string().describe("Opaque content version; pass it as expectedVersion."),
  })
  .meta({ id: "DocumentBody" });
export type DocumentBody = z.infer<typeof DocumentBody>;

// What a link does: navigate to the target, or show it inline (`![[x]]`, `![](x.md)`).
export const LinkKind = z.enum(["link", "embed"]);
export type LinkKind = z.infer<typeof LinkKind>;

// How it is written: `[[Target#Heading|alias]]` or `[text](path/Target.md#heading)`.
export const LinkSyntax = z.enum(["wikilink", "markdown"]);
export type LinkSyntax = z.infer<typeof LinkSyntax>;

// Obsidian block id: written as ` ^id` at the end of a block, referenced as `[[Note#^id]]`.
export const BlockId = z
  .string()
  .regex(/^[A-Za-z0-9-]{1,64}$/, "Expected a block id (letters, digits and dashes)")
  .meta({ id: "BlockId" });

export const Link = z
  .object({
    id: Uuid,
    workspaceId: WorkspaceId,
    sourceId: Uuid,
    sourceBlockId: BlockId.nullable().describe("The block the link sits in, if it has an id."),
    targetId: Uuid.nullable().describe("null while the link does not resolve to a document."),
    targetRef: z.string().describe("The link target as written (path or title, without #part)."),
    targetHeading: z.string().nullable(),
    targetBlockId: BlockId.nullable(),
    kind: LinkKind,
    syntax: LinkSyntax,
    sourceProperty: z
      .string()
      .nullable()
      .optional()
      .describe("The property (frontmatter key) the link is in: a [[link]] or a relation value."),
  })
  .meta({ id: "Link" });
export type Link = z.infer<typeof Link>;

const LinkSource = Document.pick({ id: true, title: true, parentId: true, workspaceId: true });

export const Backlink = z
  .object({
    source: LinkSource,
    kind: LinkKind,
    syntax: LinkSyntax,
    targetRef: z.string(),
    sourceBlockId: BlockId.nullable(),
    targetHeading: z.string().nullable(),
    targetBlockId: BlockId.nullable(),
    sourceProperty: z
      .string()
      .nullable()
      .optional()
      .describe("Set when the link is in a property (a relation value or a [[link]])."),
  })
  .meta({ id: "Backlink" });
export type Backlink = z.infer<typeof Backlink>;

// A link out of a document, as written, with the live document it resolves to.
export const OutgoingLink = z
  .object({
    id: Uuid,
    kind: LinkKind,
    syntax: LinkSyntax,
    targetRef: z.string().describe("The link target as written (path or title, without #part)."),
    targetHeading: z.string().nullable(),
    targetBlockId: BlockId.nullable(),
    sourceBlockId: BlockId.nullable(),
    sourceProperty: z.string().nullable().optional(),
    target: LinkSource.extend({
      icon: z
        .string()
        .nullable()
        .optional()
        .describe("Its page icon (the `icon` property), or null."),
    })
      .nullable()
      .describe(
        "The live document it resolves to; null when it resolves to nothing or to the trash.",
      ),
  })
  .meta({ id: "OutgoingLink" });
export type OutgoingLink = z.infer<typeof OutgoingLink>;

export const UnresolvedLink = z
  .object({
    source: LinkSource,
    kind: LinkKind,
    syntax: LinkSyntax,
    targetRef: z.string(),
  })
  .meta({ id: "UnresolvedLink" });
export type UnresolvedLink = z.infer<typeof UnresolvedLink>;

export const UnlinkedMention = z
  .object({
    source: LinkSource,
    snippet: z.string().describe("Matching excerpt; the mention is wrapped in <mark></mark>."),
  })
  .meta({ id: "UnlinkedMention" });
export type UnlinkedMention = z.infer<typeof UnlinkedMention>;

// A referenceable block: one that carries a `^id`. Other blocks are not indexed.
export const Block = z
  .object({
    docId: Uuid,
    blockId: BlockId,
    type: z.string().describe("paragraph, heading, listItem, blockquote, code, table, …"),
    text: z.string().describe("Plain text of the block, for previews and search."),
    order: z.number().int().min(0).describe("Position among the document's blocks."),
  })
  .meta({ id: "Block" });
export type Block = z.infer<typeof Block>;

export const SearchHit = z
  .object({
    id: Uuid,
    title: z.string(),
    snippet: z.string().describe("Matching excerpt; matches are wrapped in <mark></mark>."),
    score: z.number().describe("Lower is better (bm25)."),
  })
  .meta({ id: "SearchHit" });
export type SearchHit = z.infer<typeof SearchHit>;

export const Actor = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("user"), id: z.string().min(1) }),
    z.object({
      type: z.literal("agent"),
      id: z.string().min(1),
      app: z.string().min(1),
      onBehalfOf: z.string().min(1),
    }),
    z.object({ type: z.literal("system"), id: z.string().min(1) }),
  ])
  .meta({ id: "Actor", description: "Who performed a write." });
export type Actor = z.infer<typeof Actor>;

export const Warning = z
  .object({
    code: z.enum(["no_match", "ambiguous_match"]),
    message: z.string(),
    editIndex: z.number().int().min(0).optional(),
  })
  .meta({ id: "Warning" });
export type Warning = z.infer<typeof Warning>;

// A saved state of a document's body. Where versions are kept depends on the workspace: the hosted
// core snapshots the collaborative document, a folder keeps snapshots beside its database or reads
// them from git (the runtime's `Versions` port). The operations are the same everywhere.
export const VersionKind = z.enum(["auto", "before_write", "restore", "external"]);
export type VersionKind = z.infer<typeof VersionKind>;

export const DocumentVersion = z
  .object({
    id: z.string().describe("Opaque: a snapshot id, or a commit when history is kept in git."),
    documentId: Uuid,
    kind: VersionKind.describe(
      "auto: the body after a round of edits. before_write: the state before a write that was " +
        "not recorded (an API write, a restore, a change made while the app was closed). " +
        "restore: the result of a restore. external: recorded outside Lydie (a git commit by " +
        "another program).",
    ),
    authors: z
      .array(z.string())
      .describe("Actor refs of whoever changed the body since the previous version."),
    restoredFrom: z.string().nullable(),
    sizeBytes: z.number().int(),
    createdAt: z.string(),
    label: z
      .string()
      .nullable()
      .optional()
      .describe("A note that came with the version (git: the commit subject and its author)."),
  })
  .meta({ id: "DocumentVersion" });
export type DocumentVersion = z.infer<typeof DocumentVersion>;

// Bytes live in the Blob port under `sha256`; this is the metadata row. Mirrors the core's
// `attachments` table (filename, content_type, size, sha256).
export const Attachment = z
  .object({
    id: Uuid,
    workspaceId: WorkspaceId,
    documentId: Uuid.nullable().describe("The document it belongs to; null for workspace files."),
    filename: z.string().trim().min(1).max(255),
    contentType: z.string().min(1).max(255),
    size: z.number().int().min(0),
    sha256: z.string().regex(/^[0-9a-f]{64}$/, "Expected a lowercase hex SHA-256"),
    createdAt: Timestamp,
    updatedAt: Timestamp,
    deletedAt: Timestamp.nullable(),
    ...authorship,
  })
  .meta({ id: "Attachment" });
export type Attachment = z.infer<typeof Attachment>;

export const TrashItem = z
  .object({
    kind: z.enum(["document", "attachment"]),
    id: Uuid,
    workspaceId: WorkspaceId,
    title: z.string().describe("Document title or attachment filename."),
    parentId: Uuid.nullable().describe("Where a document goes back to on restore, if still there."),
    deletedAt: Timestamp,
    deletedBy: ActorRef.nullable(),
    descendantCount: z.number().int().min(0).describe("Documents trashed together with it."),
  })
  .meta({ id: "TrashItem" });
export type TrashItem = z.infer<typeof TrashItem>;

// One operation to run to undo another one.
// A change the schema makes to a database's rows (an option renamed or deleted, a property's key
// or type changed, a limit-one relation reassigned, a new uniqueId numbering the rows): it applies
// to every row, including rows the caller cannot see. Backends that hide rows run it through their
// `databases.rewrite` port.
export const SchemaRewrite = z
  .object({
    databaseId: Uuid,
    propertyId: Uuid,
    reason: z.enum(["option", "key", "type", "relation", "uniqueId"]),
  })
  .meta({ id: "SchemaRewrite" });
export type SchemaRewrite = z.infer<typeof SchemaRewrite>;

export const InverseStep = z
  .object({
    op: z.string(),
    input: z.unknown(),
    // Set when the step undoes a schema rewrite: it runs as one too, so it restores every row.
    // Only the journal carries it; operation inputs never do.
    rewrite: SchemaRewrite.optional(),
  })
  .meta({ id: "InverseStep" });
export type InverseStep = z.infer<typeof InverseStep>;

// One applied operation in the local history journal (kept after upload, unlike the upload queue).
export const HistoryEntry = z
  .object({
    id: Uuid,
    operation: z.string(),
    input: z.unknown(),
    inverse: z
      .array(InverseStep)
      .nullable()
      .describe("Operations that undo it, in the order to run them; null if it cannot be undone."),
    actor: Actor,
    sessionId: z.string().nullable(),
    groupId: Uuid.describe("Operations applied together (one transaction) share a group."),
    workspaceId: WorkspaceId.nullable(),
    createdAt: Timestamp,
    undoneAt: Timestamp.nullable(),
  })
  .meta({ id: "HistoryEntry" });
export type HistoryEntry = z.infer<typeof HistoryEntry>;

export const HistorySession = z
  .object({
    sessionId: z.string(),
    actor: Actor,
    workspaceId: WorkspaceId.nullable(),
    firstAt: Timestamp,
    lastAt: Timestamp,
    count: z.number().int().min(0),
    undoneCount: z.number().int().min(0),
  })
  .meta({ id: "HistorySession" });
export type HistorySession = z.infer<typeof HistorySession>;

// `ActorRef` for an actor. Users are their plain id.
export function actorRef(actor: Actor): ActorRef {
  switch (actor.type) {
    case "user":
      return actor.id;
    case "agent":
      return `agent:${actor.app}:${actor.id}:${actor.onBehalfOf}`;
    case "system":
      return `system:${actor.id}`;
  }
}

// The actor an `ActorRef` names. App names and ids must not contain ":" for agents to round-trip.
export function parseActorRef(ref: ActorRef): Actor {
  if (ref.startsWith("system:")) return { type: "system", id: ref.slice("system:".length) };
  if (ref.startsWith("agent:")) {
    const [, app = "", id = "", ...rest] = ref.split(":");
    return { type: "agent", app, id, onBehalfOf: rest.join(":") };
  }
  return { type: "user", id: ref };
}
