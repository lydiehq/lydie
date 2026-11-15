import { z } from "zod";

import { defineOperation, defineQuery } from "../define.ts";
import {
  Backlink,
  BlockId,
  ChildEntry,
  Document,
  DocumentBody,
  DocumentVersion,
  OutgoingLink,
  Properties,
  PropertyKey,
  SearchHit,
  SortKey,
  Timestamp,
  Title,
  TreeEntry,
  UnlinkedMention,
  UnresolvedLink,
  Uuid,
  Warning,
  WorkspaceId,
} from "../entities.ts";
import { Thread } from "../thread.ts";

const position = {
  afterId: Uuid.optional().describe("Place directly after this sibling."),
  beforeId: Uuid.optional().describe("Place directly before this sibling."),
  sortKey: SortKey.optional().describe(
    "Explicit fractional key. Overrides afterId/beforeId; recorded by clients so replays converge.",
  ),
};

export const docCreate = defineOperation({
  id: "doc.create",
  summary: "Create a document",
  description:
    "Creates a document in a workspace, optionally under a parent and with an initial Markdown body. " +
    "Without afterId/beforeId it is appended as the last child.",
  input: z.object({
    workspaceId: WorkspaceId,
    id: Uuid.optional().describe("Client-minted id. Generated when omitted."),
    parentId: Uuid.nullable().default(null),
    title: Title.default("Untitled"),
    properties: Properties.default({}),
    markdown: z.string().optional().describe("Initial body as Lydie Markdown."),
    teamspaceId: z
      .string()
      .min(1)
      .max(64)
      .nullable()
      .optional()
      .describe(
        "Hosted: the teamspace a top-level page goes into (null or absent: the creator's " +
          "private section). Ignored for child pages, which share their parent's space, and in " +
          "local mode.",
      ),
    ...position,
  }),
  output: Document,
  scopes: ["docs:write"],
  destructive: false,
  idempotent: false,
  undo: "inverse",
  emits: ["doc.created", "doc.bodyUpdated"],
  rest: { method: "POST", path: "/documents" },
  mcp: { name: "create_doc", title: "Create document" },
  cli: { command: ["doc", "create"], args: ["title"] },
  ui: { commandPalette: { title: "New document", group: "Document" } },
});

export const docRename = defineOperation({
  id: "doc.rename",
  summary: "Rename a document",
  input: z.object({ id: Uuid, title: Title }),
  output: Document,
  scopes: ["docs:write"],
  destructive: false,
  idempotent: true,
  undo: "inverse",
  emits: ["doc.renamed"],
  rest: { method: "POST", path: "/documents/{id}/rename" },
  mcp: { name: "rename_doc", title: "Rename document" },
  cli: { command: ["doc", "rename"], args: ["id", "title"] },
  ui: { commandPalette: { title: "Rename document", group: "Document" } },
});

export const docMove = defineOperation({
  id: "doc.move",
  summary: "Move a document",
  description:
    "Moves a document (and its subtree) under a new parent, or to the top level with parentId null. " +
    "Without afterId/beforeId it becomes the last child.",
  input: z.object({ id: Uuid, parentId: Uuid.nullable(), ...position }),
  output: Document,
  scopes: ["docs:write"],
  destructive: false,
  idempotent: true,
  undo: "inverse",
  emits: ["doc.moved"],
  rest: { method: "POST", path: "/documents/{id}/move" },
  mcp: { name: "move_doc", title: "Move document" },
  cli: { command: ["doc", "mv"], args: ["id", "parentId"] },
  ui: { commandPalette: { title: "Move document", group: "Document" } },
});

export const docDelete = defineOperation({
  id: "doc.delete",
  summary: "Delete a document",
  description:
    "Soft-deletes a document and its subtree. Restore it with doc.restore. Deleting a deleted document is a no-op.",
  input: z.object({ id: Uuid }),
  output: z.object({ id: Uuid, deletedAt: Timestamp, deletedIds: z.array(Uuid) }),
  scopes: ["docs:write"],
  destructive: true,
  idempotent: true,
  undo: "inverse",
  emits: ["doc.deleted"],
  rest: { method: "DELETE", path: "/documents/{id}" },
  mcp: { name: "delete_doc", title: "Delete document", outputSchema: true },
  cli: { command: ["doc", "rm"], args: ["id"] },
  ui: { commandPalette: { title: "Delete document", group: "Document" } },
});

export const docRestore = defineOperation({
  id: "doc.restore",
  summary: "Restore a deleted document",
  description:
    "Restores a soft-deleted document and the part of its subtree deleted with it. " +
    "If its parent is gone it is restored to the top level.",
  input: z.object({ id: Uuid }),
  output: Document,
  scopes: ["docs:write"],
  destructive: false,
  idempotent: true,
  undo: "inverse",
  emits: ["doc.restored"],
  rest: { method: "POST", path: "/documents/{id}/restore" },
  mcp: { name: "restore_doc", title: "Restore document" },
  cli: { command: ["doc", "restore"], args: ["id"] },
  ui: { commandPalette: { title: "Restore document", group: "Document" } },
});

export const docPurge = defineOperation({
  id: "doc.purge",
  summary: "Permanently delete a document",
  description:
    "Permanently deletes a document in the trash, its trashed subtree, bodies and outgoing links. " +
    "Links to it become unresolved. Cannot be undone.",
  input: z.object({ id: Uuid }),
  output: z.object({ purgedIds: z.array(Uuid) }),
  scopes: ["docs:write"],
  destructive: true,
  idempotent: true,
  undo: { none: "Purged documents are gone; restore from a backup or the folder's history." },
  emits: ["doc.purged"],
  rest: { method: "POST", path: "/documents/{id}/purge" },
  mcp: { name: "purge_doc", title: "Permanently delete document", outputSchema: true },
  cli: { command: ["doc", "purge"], args: ["id"] },
});

export const docSetProperties = defineOperation({
  id: "doc.setProperties",
  summary: "Set document properties",
  description: "Merges `set` into the document's properties and removes the keys in `unset`.",
  input: z.object({
    id: Uuid,
    set: Properties.default({}),
    unset: z.array(PropertyKey).default([]),
  }),
  output: Document,
  scopes: ["docs:write"],
  destructive: false,
  idempotent: true,
  undo: "inverse",
  emits: ["doc.propertiesChanged"],
  rest: { method: "PATCH", path: "/documents/{id}/properties" },
  mcp: { name: "set_doc_properties", title: "Set document properties" },
  cli: { command: ["doc", "props"], args: ["id"] },
});

// One change to a body (Linear's `patch`). Without `type` it is a replacement, as before.
export const BODY_EDIT_TYPES = [
  "replace",
  "insertBefore",
  "insertAfter",
  "prepend",
  "append",
] as const;
export const BodyEdit = z
  .object({
    type: z.enum(BODY_EDIT_TYPES).default("replace"),
    oldStr: z
      .string()
      .min(1)
      .optional()
      .describe("The exact text to replace or insert at. Not for prepend/append."),
    newStr: z.string(),
    replaceAll: z.boolean().default(false).describe("Every match of oldStr, not exactly one."),
  })
  .refine((e) => (e.type === "prepend" || e.type === "append") === (e.oldStr === undefined), {
    message: "replace, insertBefore and insertAfter need oldStr; prepend and append take none",
  })
  .meta({ id: "BodyEdit" });
export type BodyEdit = z.infer<typeof BodyEdit>;

export const docUpdateBody = defineOperation({
  id: "doc.updateBody",
  summary: "Update a document body",
  description:
    "Replaces the body with markdown, or applies edits in order, all or nothing: replace swaps " +
    "oldStr for newStr, insertBefore/insertAfter put newStr next to oldStr, prepend/append add " +
    "newStr as a block at the start/end (also of an empty body). oldStr is matched against the " +
    "Markdown from fetch_doc and must occur exactly once unless replaceAll; otherwise nothing is " +
    "written and the error names the edit. expectedVersion makes a stale write a conflict.",
  input: z
    .object({
      id: Uuid,
      markdown: z.string().optional(),
      edits: z.array(BodyEdit).min(1).optional(),
      expectedVersion: z.string().optional(),
    })
    .refine((v) => (v.markdown === undefined) !== (v.edits === undefined), {
      message: "Pass exactly one of `markdown` or `edits`",
    }),
  output: z.object({ document: Document, version: z.string(), warnings: z.array(Warning) }),
  scopes: ["docs:write"],
  destructive: false,
  idempotent: false,
  undo: "inverse",
  emits: ["doc.bodyUpdated"],
  rest: { method: "PATCH", path: "/documents/{id}/body" },
  mcp: { name: "update_doc", title: "Update document body" },
  cli: { command: ["doc", "write"], args: ["id"] },
});

export const docGet = defineQuery({
  id: "doc.get",
  summary: "Get a document",
  description:
    "Returns a document's metadata and, unless includeBody is false, its Markdown body, with " +
    "`threads`: the open notes and comments left beside it, when there are any.",
  input: z.object({ id: Uuid, includeBody: z.boolean().default(true) }),
  output: z.object({
    document: Document,
    body: DocumentBody.nullable(),
    threads: z.array(Thread).optional(),
  }),
  scopes: ["docs:read"],
  rest: { method: "GET", path: "/documents/{id}" },
  mcp: { name: "fetch_doc", title: "Fetch document" },
  cli: { command: ["doc", "get"], args: ["id"] },
});

export const docListTree = defineQuery({
  id: "doc.listTree",
  summary: "List the document tree",
  description:
    "Lists documents depth-first in tree order. With rootId, lists that document's descendants only.",
  input: z.object({
    workspaceId: WorkspaceId,
    rootId: Uuid.optional(),
    includeDeleted: z.boolean().default(false),
  }),
  output: z.object({ entries: z.array(TreeEntry) }),
  scopes: ["docs:read"],
  rest: { method: "GET", path: "/workspaces/{workspaceId}/tree" },
  mcp: { name: "list_docs", title: "List documents" },
  cli: { command: ["doc", "tree"], args: ["workspaceId"] },
});

export const docListChildren = defineQuery({
  id: "doc.listChildren",
  summary: "List a document's children",
  description:
    "Lists the direct children of a document (or the top level when parentId is omitted) in order, " +
    "each with its number of live children. Use it to load a tree level by level.",
  input: z.object({
    workspaceId: WorkspaceId,
    parentId: Uuid.optional().describe("Omit for the top level."),
    includeDeleted: z.boolean().default(false),
  }),
  output: z.object({ entries: z.array(ChildEntry) }),
  scopes: ["docs:read"],
  rest: { method: "GET", path: "/workspaces/{workspaceId}/children" },
  mcp: { name: "list_children", title: "List child documents" },
  cli: { command: ["doc", "ls"], args: ["workspaceId"] },
});

export const docSearch = defineQuery({
  id: "doc.search",
  summary: "Search documents",
  description:
    "Full-text search over titles and bodies. Words are matched as prefixes; all words must match. " +
    "A title equal to the query comes first. When nothing matches, titles similar to the query " +
    "(sharing most of its letter trigrams, so typos still find them) are returned instead, " +
    "without <mark> highlights.",
  input: z.object({
    workspaceId: WorkspaceId,
    query: z.string().trim().min(1).max(500),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  output: z.object({ hits: z.array(SearchHit) }),
  scopes: ["docs:read"],
  rest: { method: "GET", path: "/workspaces/{workspaceId}/search" },
  mcp: { name: "search", title: "Search documents", outputSchema: true },
  cli: { command: ["search"], args: ["workspaceId", "query"] },
  ui: { commandPalette: { title: "Search", group: "Navigation" } },
});

export const docBacklinks = defineQuery({
  id: "doc.backlinks",
  summary: "List backlinks",
  description: "Lists live documents that link to this document.",
  input: z.object({ id: Uuid }),
  output: z.object({ backlinks: z.array(Backlink) }),
  scopes: ["docs:read"],
  rest: { method: "GET", path: "/documents/{id}/backlinks" },
  mcp: { name: "list_backlinks", title: "List backlinks" },
  cli: { command: ["doc", "backlinks"], args: ["id"] },
});

export const docOutgoingLinks = defineQuery({
  id: "doc.outgoingLinks",
  summary: "List outgoing links",
  description:
    "Lists the links in this document (body first, then properties, in document order), each " +
    "with the live document it resolves to or null.",
  input: z.object({ id: Uuid }),
  output: z.object({ links: z.array(OutgoingLink) }),
  scopes: ["docs:read"],
  rest: { method: "GET", path: "/documents/{id}/links" },
  mcp: { name: "list_outgoing_links", title: "List outgoing links" },
  cli: { command: ["doc", "links"], args: ["id"] },
});

export const docBlockBacklinks = defineQuery({
  id: "doc.blockBacklinks",
  summary: "List backlinks to a block",
  description:
    "Lists live documents that link to one block (`[[Note#^blockId]]`) of this document.",
  input: z.object({ id: Uuid, blockId: BlockId }),
  output: z.object({ backlinks: z.array(Backlink) }),
  scopes: ["docs:read"],
  rest: { method: "GET", path: "/documents/{id}/blocks/{blockId}/backlinks" },
  mcp: { name: "list_block_backlinks", title: "List block backlinks" },
  cli: { command: ["doc", "block-backlinks"], args: ["id", "blockId"] },
});

export const docUnlinkedMentions = defineQuery({
  id: "doc.unlinkedMentions",
  summary: "List unlinked mentions",
  description:
    "Lists live documents whose text mentions this document's title without linking to it.",
  input: z.object({ id: Uuid, limit: z.number().int().min(1).max(100).default(50) }),
  output: z.object({ mentions: z.array(UnlinkedMention) }),
  scopes: ["docs:read"],
  rest: { method: "GET", path: "/documents/{id}/unlinked-mentions" },
  mcp: { name: "list_unlinked_mentions", title: "List unlinked mentions" },
  cli: { command: ["doc", "mentions"], args: ["id"] },
});

export const docUnresolvedLinks = defineQuery({
  id: "doc.unresolvedLinks",
  summary: "List unresolved links",
  description: "Lists links in live documents whose target does not exist (yet).",
  input: z.object({ workspaceId: WorkspaceId }),
  output: z.object({ links: z.array(UnresolvedLink) }),
  scopes: ["docs:read"],
  rest: { method: "GET", path: "/workspaces/{workspaceId}/unresolved-links" },
  mcp: { name: "list_unresolved_links", title: "List unresolved links" },
  cli: { command: ["links", "unresolved"], args: ["workspaceId"] },
});

// Version history of document bodies. One set of operations for every kind of workspace; what
// keeps the versions is the runtime's `Versions` port (hosted: the core; a folder: snapshots or
// git). A workspace without one answers `internal` ("not supported by this backend").

export const docListVersions = defineQuery({
  id: "doc.listVersions",
  summary: "List a document's versions",
  description: "Lists saved versions of a document's body, newest first.",
  input: z.object({ id: Uuid, limit: z.number().int().min(1).max(200).default(50) }),
  output: z.object({ versions: z.array(DocumentVersion) }),
  scopes: ["docs:read"],
  rest: { method: "GET", path: "/documents/{id}/versions" },
  mcp: { name: "list_doc_versions", title: "List document versions" },
  cli: { command: ["doc", "versions"], args: ["id"] },
});

export const docGetVersion = defineQuery({
  id: "doc.getVersion",
  summary: "Get a document version",
  description: "Returns one saved version of a document's body as Markdown.",
  input: z.object({ id: Uuid, versionId: z.string().min(1).max(64) }),
  output: z.object({ version: DocumentVersion, markdown: z.string() }),
  scopes: ["docs:read"],
  rest: { method: "GET", path: "/documents/{id}/versions/{versionId}" },
  mcp: { name: "get_doc_version", title: "Get document version" },
  cli: { command: ["doc", "version"], args: ["id", "versionId"] },
});

export const docRestoreVersion = defineOperation({
  id: "doc.restoreVersion",
  summary: "Restore a document version",
  description:
    "Makes the body read as a saved version again, as a new edit. The body before the restore " +
    "is kept as a version (`previousVersionId`): restore it to undo.",
  input: z.object({ id: Uuid, versionId: z.string().min(1).max(64) }),
  output: z.object({
    versionId: z
      .string()
      .nullable()
      .describe("The version recording the restored body; null when it is recorded later."),
    previousVersionId: z.string().nullable().describe("The body before the restore."),
    version: z.string().describe("The body's new content version (for expectedVersion)."),
  }),
  scopes: ["docs:write"],
  destructive: false,
  idempotent: true,
  undo: "inverse",
  emits: ["doc.bodyUpdated"],
  rest: { method: "POST", path: "/documents/{id}/versions/{versionId}/restore" },
  mcp: { name: "restore_doc_version", title: "Restore document version" },
  cli: { command: ["doc", "restore-version"], args: ["id", "versionId"] },
});
