import { mcpToolOf } from "../define.ts";
import type { AnyOperation } from "../define.ts";
import type { Registry } from "../registry.ts";
import { toJsonSchema } from "./json-schema.ts";
import type { JsonSchema } from "./json-schema.ts";

// An MCP tool definition (spec 2026-07-28). Identical in local and hosted mode; not versioned.
// Every tool either reads (readOnlyHint) or writes: there are no generic tools that run other
// operations by id, which directories reject and agents use badly.
export type McpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
  // The operation behind the tool; whoami has none.
  _meta: {
    "lydie/operation"?: string;
    "lydie/scopes"?: readonly string[];
    "lydie/connection"?: "whoami";
  };
};

// Who the connection acts as and which workspace the tools default to (Linear's `whoami`,
// Notion's `get-self`). Answered by the dispatcher from the server's connection, not an operation:
// it describes the connection, not the workspace.
export const WHOAMI_TOOL = "whoami";

// Top-level inputs every MCP server fills in from its connection when left out: the workspace a
// hosted token or a local vault serves, and the agent's history session. Operations stay explicit
// for REST, the SDK and the CLI; only the MCP schemas make them optional.
export const CONNECTION_DEFAULTS = ["workspaceId", "sessionId"] as const;
export type ConnectionDefault = (typeof CONNECTION_DEFAULTS)[number];
const DEFAULT_NOTE: Record<ConnectionDefault, string> = {
  workspaceId: "Default: this connection's workspace (whoami).",
  sessionId: "Default: your own session.",
};

// The operations of a registry that are MCP tools, in registry order.
export function mcpOperations(registry: Registry): AnyOperation[] {
  return Object.values(registry).filter((op) => mcpToolOf(op) && !op.internal);
}

// whoami, then one tool per operation that is one. Descriptions are shared with REST and the CLI,
// so they name other operations by id; an agent sees the tool's name instead.
export function toMcpTools(registry: Registry): McpTool[] {
  const ops = mcpOperations(registry);
  const names = new Map(ops.map((op) => [op.id, mcpToolOf(op)!.name]));
  return [
    whoamiTool(),
    ...ops.map((op) => {
      const tool = toMcpTool(op);
      return { ...tool, description: withToolNames(tool.description, names) };
    }),
  ];
}

function withToolNames(text: string, names: Map<string, string>): string {
  return text.replace(/\b[a-z]+\.[a-z][A-Za-z]*\b/g, (id) => names.get(id) ?? id);
}

function withConnectionDefaults(schema: JsonSchema): JsonSchema {
  const required = schema.required as string[] | undefined;
  const properties = schema.properties as Record<string, JsonSchema> | undefined;
  if (!required || !properties) return schema;
  const defaulted = CONNECTION_DEFAULTS.filter((key) => required.includes(key));
  if (defaulted.length === 0) return schema;
  const next = { ...properties };
  for (const key of defaulted) next[key] = { type: "string", description: DEFAULT_NOTE[key] };
  const rest = required.filter((key) => !defaulted.includes(key as ConnectionDefault));
  const { required: _required, $defs, ...without } = schema;
  const out: JsonSchema = {
    ...without,
    properties: next,
    ...(rest.length > 0 ? { required: rest } : {}),
  };
  if (!$defs) return out;
  // Defs only the defaulted keys used (WorkspaceId) go with them.
  const defs = { ...($defs as Record<string, JsonSchema>) };
  for (const name of Object.keys(defs)) {
    const others = JSON.stringify([out, Object.entries(defs).filter(([n]) => n !== name)]);
    if (!others.includes(`"#/$defs/${name}"`)) delete defs[name];
  }
  return Object.keys(defs).length > 0 ? { ...out, $defs: defs } : out;
}

function whoamiTool(): McpTool {
  return {
    name: WHOAMI_TOOL,
    title: "Who am I",
    description:
      "Who this connection acts as (you, and the user you act for), the workspace tools default " +
      "to (id, name), the other workspaces and the teamspaces you can reach, and your history " +
      "session (list_session_changes, undo_session).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    _meta: { "lydie/connection": "whoami" },
  };
}

export function toMcpTool(op: AnyOperation, options: { outputSchema?: boolean } = {}): McpTool {
  const tool = mcpToolOf(op);
  if (!tool) throw new Error(`${op.id} is not an MCP tool`);
  const withOutput = options.outputSchema ?? tool.outputSchema === true;
  return {
    name: tool.name,
    title: tool.title,
    description: op.description ? `${op.summary}. ${op.description}` : `${op.summary}.`,
    inputSchema: withConnectionDefaults(selfContained(op.input, "input")),
    ...(withOutput ? { outputSchema: withUrlProperty(selfContained(op.output, "output")) } : {}),
    annotations: {
      readOnlyHint: op.readOnly,
      destructiveHint: tool.destructive ?? op.destructive,
      idempotentHint: op.idempotent,
      openWorldHint: tool.openWorld ?? false,
    },
    _meta: { "lydie/operation": op.id, "lydie/scopes": op.scopes },
  };
}

// MCP wants an object schema at the root, so a top-level `$ref` (e.g. an output that is exactly
// `Document`) is replaced by its definition.
function selfContained(schema: AnyOperation["input"], io: "input" | "output"): JsonSchema {
  const { schema: converted, defs } = toJsonSchema(schema, io);
  let json = converted;
  const ref = json.$ref;
  if (typeof ref === "string" && Object.keys(json).length === 1) {
    const name = ref.slice("#/$defs/".length);
    json = defs[name]!;
    if (!JSON.stringify([json, otherDefs(defs, name)]).includes(`"${ref}"`)) delete defs[name];
  }
  return dropSafeIntegerBounds(Object.keys(defs).length > 0 ? { ...json, $defs: defs } : json);
}

// A server whose documents have links adds `url` to every document in a result (`withDocUrls`
// in mcp-dispatch.ts): an object with `id` and `title`. Output schemas are closed, so they say so.
function withUrlProperty<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withUrlProperty) as T;
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) out[key] = withUrlProperty(v);
  const properties = out.properties as Record<string, unknown> | undefined;
  if (properties?.id && properties.title && !properties.url) {
    out.properties = {
      ...properties,
      url: {
        type: "string",
        format: "uri",
        description: "The document in the Lydie web app, to link to (hosted only).",
      },
    };
  }
  return out as T;
}

// `z.number().int()` adds ±(2^53 - 1) bounds: noise in every tool list an agent reads.
function dropSafeIntegerBounds<T>(value: T): T {
  if (Array.isArray(value)) return value.map(dropSafeIntegerBounds) as T;
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (
      (key === "minimum" || key === "maximum") &&
      Math.abs(v as number) === Number.MAX_SAFE_INTEGER
    )
      continue;
    out[key] = dropSafeIntegerBounds(v);
  }
  return out as T;
}

function otherDefs(defs: Record<string, JsonSchema>, name: string): JsonSchema[] {
  return Object.entries(defs)
    .filter(([key]) => key !== name)
    .map(([, value]) => value);
}

export type McpInstructionsOptions = {
  // "local": a folder of Markdown files served by @lydie/mcp-local.
  mode: "hosted" | "local";
  // The workspace tools default to, when the connection has one.
  workspace?: { id: string; name: string } | null;
};

// The server instructions every Lydie MCP server sends (MCP `initialize`), so hosted and local
// agents read the same guide. Short: tool descriptions carry the details.
export function mcpInstructions(options: McpInstructionsOptions): string {
  const { workspace } = options;
  return [
    options.mode === "local"
      ? "Lydie: a folder of Markdown documents; every write lands on disk."
      : "Lydie: a hosted workspace of Markdown documents.",
    workspace
      ? `Workspace "${workspace.name}" (${workspace.id}): tools default to it, so leave out workspaceId.`
      : "This connection reaches several workspaces: pass workspaceId (whoami lists them).",
    "whoami says who you are, the workspaces and teamspaces you can reach, and your session.",
    ...(options.mode === "hosted"
      ? [
          "Documents in results have a url, the page in the Lydie web app: use it to link the " +
            "user to a document. Don't build links yourself.",
        ]
      : []),
    "Find documents with search or list_docs, read one with fetch_doc. update_doc changes a " +
      "document's title, properties and body in one call (markdown replaces the body; edits are " +
      "{ type, oldStr, newStr }: replace, insertBefore, insertAfter, prepend or append, all or " +
      "nothing; pass expectedVersion from fetch_doc).",
    "What the next reader should know about a text but that is not part of it (why it says " +
      "this, what it was checked against, an open question) goes in a note beside the document, " +
      "not in its body: create_thread, with quote to attach it to a passage. fetch_doc returns " +
      "the open notes and comments; answer with reply_to_thread, close with resolve_thread.",
    "A database is a document whose child documents are its rows; a row's values are its " +
      "properties. get_database shows properties and views; query_database reads rows through a " +
      "view (page with window.offset and window.limit until hasMore is false); " +
      "write_database_rows creates, updates and deletes rows with their values and body in one " +
      "call; change_database_schema and change_database_views change properties and views.",
    "Name things by id or name: properties by id, key or name, views by id or name, rows by id " +
      'or unique id ("LYD-12"). Ambiguous names and unknown input keys are errors.',
    "Your changes form a session per run of work: list_session_changes and undo_session review " +
      "and revert the current one. list_activity shows what changed in the workspace, by whom " +
      "and in which session.",
  ].join("\n");
}
