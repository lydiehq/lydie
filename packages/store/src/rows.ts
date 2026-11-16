import { DatabaseConfig, PropertyConfig, ViewConfig, viewTypeOf } from "@lydie/contract";
import type {
  Activity,
  ActivityData,
  Actor,
  AppliedOperation,
  Attachment,
  Backlink,
  Block,
  ChildEntry,
  Database,
  DatabaseProperty,
  DatabaseView,
  Document,
  DocumentAccess,
  DocumentBody,
  DocumentGrantRow,
  HistorySession,
  InverseStep,
  LinkKind,
  LinkSyntax,
  OutgoingLink,
  Properties,
  PublicAccess,
  PublicPageRow,
  SearchHit,
  TeamspaceMemberRow,
  TeamspaceRow,
  TreeEntry,
  UnlinkedMention,
  UnresolvedLink,
  WorkspaceMemberRow,
  WorkspaceRow,
} from "@lydie/contract";
import type { HistoryRow, LinkRow, ThreadRow } from "@lydie/runtime";

// Row shapes as SQLite returns them, and their mapping to contract types. Every query in this
// package maps through these, so the snake_case columns never leak out.

type Row = Record<string, unknown>;

export type DocumentRow = {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  title: string;
  sort_key: string;
  properties: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: string | null;
  updated_by: string | null;
};

export const DOCUMENT_COLUMNS =
  "id, workspace_id, parent_id, title, sort_key, properties, created_at, updated_at, deleted_at, created_by, updated_by";

export function documentColumns(alias: string): string {
  return DOCUMENT_COLUMNS.split(", ")
    .map((c) => `${alias}.${c}`)
    .join(", ");
}

const str = (value: unknown): string | null =>
  value === null || value === undefined
    ? null
    : typeof value === "string"
      ? value
      : JSON.stringify(value);

export function toDocument(row: Row): Document {
  const r = row as DocumentRow;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    parentId: r.parent_id ?? null,
    title: r.title,
    sortKey: r.sort_key,
    properties: r.properties ? (JSON.parse(r.properties) as Properties) : {},
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at ?? null,
    createdBy: r.created_by ?? null,
    updatedBy: r.updated_by ?? null,
  };
}

// Hosted pages' space; null locally (the columns are empty there).
const spaceOf = (row: Row) => ({
  teamspaceId: str(row.teamspace_id),
  privateOwnerId: str(row.private_owner_id),
});

export function toTreeEntry(row: Row): TreeEntry {
  return { ...toDocument(row), depth: Number(row.depth), ...spaceOf(row) };
}

export function toChildEntry(row: Row): ChildEntry {
  return { ...toDocument(row), childCount: Number(row.child_count), ...spaceOf(row) };
}

export type DocWithBody = { document: Document; body: DocumentBody | null };

export function toDocWithBody(row: Row): DocWithBody {
  const markdown = row.body_markdown;
  return {
    document: toDocument(row),
    body: typeof markdown === "string" ? { markdown, version: String(row.body_version) } : null,
  };
}

// Rows written before the kind/syntax split (or synced from a peer that still writes them) say
// "wikilink" or "markdown" in `kind`.
export function linkKindOf(row: Row): { kind: LinkKind; syntax: LinkSyntax } {
  const kind = String(row.kind);
  const syntax = str(row.syntax);
  if (kind === "embed")
    return { kind: "embed", syntax: syntax === "markdown" ? "markdown" : "wikilink" };
  if (kind === "markdown") return { kind: "link", syntax: "markdown" };
  return { kind: "link", syntax: syntax === "markdown" ? "markdown" : "wikilink" };
}

const sourceOf = (row: Row) => ({
  id: String(row.source_id),
  title: String(row.source_title),
  parentId: str(row.source_parent_id),
  workspaceId: String(row.workspace_id),
});

export function toBacklink(row: Row): Backlink {
  return {
    source: sourceOf(row),
    ...linkKindOf(row),
    targetRef: String(row.target_ref),
    sourceBlockId: str(row.source_block_id),
    targetHeading: str(row.target_heading),
    targetBlockId: str(row.target_block_id),
    sourceProperty: str(row.source_property),
  };
}

export function toOutgoingLink(row: Row): OutgoingLink {
  return {
    id: String(row.link_id),
    ...linkKindOf(row),
    targetRef: String(row.target_ref),
    targetHeading: str(row.target_heading),
    targetBlockId: str(row.target_block_id),
    sourceBlockId: str(row.source_block_id),
    sourceProperty: str(row.source_property),
    target:
      typeof row.target_id !== "string"
        ? null
        : {
            id: row.target_id,
            title: String(row.target_title),
            parentId: str(row.target_parent_id),
            workspaceId: String(row.target_workspace_id),
          },
  };
}

export function toUnresolvedLink(row: Row): UnresolvedLink {
  return { source: sourceOf(row), ...linkKindOf(row), targetRef: String(row.target_ref) };
}

export function toMention(row: Row): UnlinkedMention {
  return { source: sourceOf(row), snippet: typeof row.snippet === "string" ? row.snippet : "" };
}

export function toLinkRow(row: Row): LinkRow {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    sourceId: String(row.source_id),
    targetId: str(row.target_id),
    targetRef: String(row.target_ref),
    targetKey: String(row.target_key),
    targetHeading: str(row.target_heading),
    targetBlockId: str(row.target_block_id),
    sourceBlockId: str(row.source_block_id),
    sourceProperty: str(row.source_property),
    ...linkKindOf(row),
  };
}

export function toBlock(row: Row): Block {
  return {
    docId: String(row.doc_id),
    blockId: String(row.block_id),
    type: String(row.type),
    text: String(row.text),
    order: Number(row.ord),
  };
}

export const ATTACHMENT_COLUMNS =
  "id, workspace_id, document_id, filename, content_type, size, sha256, created_at, updated_at, deleted_at, created_by, updated_by";

export function toAttachment(row: Row): Attachment {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    documentId: str(row.document_id),
    filename: String(row.filename),
    contentType: String(row.content_type),
    size: Number(row.size),
    sha256: String(row.sha256),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: str(row.deleted_at),
    createdBy: str(row.created_by),
    updatedBy: str(row.updated_by),
  };
}

export const THREAD_COLUMNS =
  "id, workspace_id, document_id, parent_id, kind, body, quote, quote_prefix, quote_suffix, resolved_at, resolved_by, session_id, created_at, updated_at, deleted_at, created_by, updated_by";

export function toThreadRow(row: Row): ThreadRow {
  const quote = str(row.quote);
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    documentId: String(row.document_id),
    parentId: str(row.parent_id),
    kind: row.kind === "note" || row.kind === "comment" ? row.kind : null,
    body: String(row.body ?? ""),
    anchor: quote
      ? { quote, prefix: str(row.quote_prefix) ?? "", suffix: str(row.quote_suffix) ?? "" }
      : null,
    resolvedAt: str(row.resolved_at),
    resolvedBy: str(row.resolved_by),
    sessionId: str(row.session_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: str(row.deleted_at),
    createdBy: str(row.created_by),
    updatedBy: str(row.updated_by),
  };
}

export function toSearchHit(row: Row): SearchHit {
  return {
    id: String(row.id),
    title: String(row.title),
    snippet: typeof row.snippet === "string" ? row.snippet : "",
    score: Number(row.score),
  };
}

export function toAppliedOperation(row: Row): AppliedOperation {
  return {
    id: String(row.id),
    operation: String(row.operation),
    input: JSON.parse(String(row.input)) as unknown,
    actor: JSON.parse(String(row.actor)) as AppliedOperation["actor"],
    sessionId: str(row.session_id),
    workspaceId: str(row.workspace_id),
    createdAt: String(row.created_at),
    version: String(row.version),
  };
}

export const HISTORY_COLUMNS =
  "id, operation, input, inverse, touches, actor, session_id, group_id, scope, workspace_id, created_at, undone_at";

export function toHistoryRow(row: Row): HistoryRow {
  return {
    id: String(row.id),
    operation: String(row.operation),
    input: JSON.parse(String(row.input)) as unknown,
    inverse: row.inverse === null ? null : (JSON.parse(row.inverse as string) as InverseStep[]),
    touches: JSON.parse(String(row.touches)) as string[],
    actor: JSON.parse(String(row.actor)) as Actor,
    sessionId: str(row.session_id),
    groupId: String(row.group_id),
    scope: str(row.scope),
    workspaceId: str(row.workspace_id),
    createdAt: String(row.created_at),
    undoneAt: str(row.undone_at),
  };
}

export function toHistorySession(row: Row): HistorySession {
  return {
    sessionId: String(row.session_id),
    actor: JSON.parse(String(row.actor)) as Actor,
    workspaceId: str(row.workspace_id),
    firstAt: String(row.first_at),
    lastAt: String(row.last_at),
    count: Number(row.count),
    undoneCount: Number(row.undone_count),
  };
}

export const ACTIVITY_COLUMNS =
  "id, workspace_id, actor, actor_ref, session_id, type, target_id, target_title, data, count, first_at, last_at";

export function toActivity(row: Row): Activity {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    actor: JSON.parse(String(row.actor)) as Actor,
    sessionId: str(row.session_id),
    type: String(row.type) as Activity["type"],
    targetId: String(row.target_id),
    targetTitle: str(row.target_title),
    data: JSON.parse(String(row.data)) as ActivityData,
    count: Number(row.count),
    firstAt: String(row.first_at),
    lastAt: String(row.last_at),
  };
}

// ---- Databases

export const DATABASE_COLUMNS =
  "id, workspace_id, config, created_at, updated_at, deleted_at, created_by, updated_by";
export const PROPERTY_COLUMNS =
  "id, workspace_id, database_id, name, type, key, config, sort_key, created_at, updated_at, deleted_at, created_by, updated_by";
export const VIEW_COLUMNS =
  "id, workspace_id, database_id, name, type, config, sort_key, created_at, updated_at, deleted_at, created_by, updated_by";

const jsonOf = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const authored = (row: Row) => ({
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  deletedAt: str(row.deleted_at),
  createdBy: str(row.created_by),
  updatedBy: str(row.updated_by),
});

// Configs are parsed with their schemas so rows written by older or newer peers get defaults.
export function toDatabase(row: Row): Database {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    config: parseOr(DatabaseConfig, jsonOf(row.config, {})),
    ...authored(row),
  };
}

export function toProperty(row: Row): DatabaseProperty {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    databaseId: String(row.database_id),
    name: String(row.name),
    type: row.type as DatabaseProperty["type"],
    key: String(row.key),
    config: parseOr(PropertyConfig, jsonOf(row.config, {})),
    sortKey: String(row.sort_key),
    ...authored(row),
  };
}

export function toView(row: Row): DatabaseView {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    databaseId: String(row.database_id),
    name: String(row.name),
    type: viewTypeOf(row.type),
    config: parseOr(ViewConfig, jsonOf(row.config, {})),
    sortKey: String(row.sort_key),
    ...authored(row),
  };
}

function parseOr<T>(
  schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } },
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const fallback = schema.safeParse({});
  if (fallback.success) return fallback.data;
  return value as T;
}

// ---- Team and access rows (hosted only)

export function toWorkspace(row: Row): WorkspaceRow {
  return {
    id: String(row.id),
    name: typeof row.name === "string" ? row.name : "",
    image: str(row.image),
  };
}

export function toWorkspaceMember(row: Row): WorkspaceMemberRow {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    userId: String(row.user_id),
    role: String(row.role) as WorkspaceMemberRow["role"],
    userName: str(row.user_name),
    userEmail: str(row.user_email),
    userImage: str(row.user_image),
    createdAt: String(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function toTeamspace(row: Row): TeamspaceRow {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    name: typeof row.name === "string" ? row.name : "",
    description: str(row.description),
    icon: str(row.icon),
    visibility: String(row.visibility) as TeamspaceRow["visibility"],
    isDefault: Number(row.is_default) === 1,
    createdBy: str(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function toTeamspaceMember(row: Row): TeamspaceMemberRow {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    teamspaceId: String(row.teamspace_id),
    userId: String(row.user_id),
    role: String(row.role) as TeamspaceMemberRow["role"],
    createdAt: String(row.created_at),
  };
}

export function toGrant(row: Row): DocumentGrantRow {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    documentId: String(row.document_id),
    principalType: String(row.principal_type) as DocumentGrantRow["principalType"],
    principalId: String(row.principal_id),
    level: String(row.level) as DocumentGrantRow["level"],
    scopeId: str(row.scope_id),
    createdBy: str(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function toPublicPage(row: Row): PublicPageRow {
  return { documentId: String(row.id), includeSubpages: Number(row.include_subpages) === 1 };
}

export function toPublicAccess(row: Row): PublicAccess {
  return {
    documentId: String(row.id),
    sourceId: String(row.source_id),
    sourceTitle: str(row.source_title) ?? "",
    links: Number(row.links),
  };
}

export function toDocumentAccess(row: Row): DocumentAccess {
  return {
    documentId: String(row.id),
    teamspaceId: str(row.teamspace_id),
    privateOwnerId: str(row.private_owner_id),
    restricted: Number(row.restricted) === 1,
    scopeId: str(row.scope_id),
    level: (str(row.level) as DocumentAccess["level"]) ?? null,
  };
}
