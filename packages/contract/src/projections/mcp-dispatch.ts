import { mcpToolOf } from "../define.ts";
import type { AnyOperation } from "../define.ts";
import type { Actor } from "../entities.ts";
import { isLydieError, LydieError } from "../errors.ts";
import type { Registry } from "../registry.ts";
import { toJsonSchema } from "./json-schema.ts";
import type { JsonSchema } from "./json-schema.ts";
import { CONNECTION_DEFAULTS, mcpOperations, toMcpTools, WHOAMI_TOOL } from "./mcp.ts";
import type { McpTool } from "./mcp.ts";

// The tools/list and tools/call handling every Lydie MCP server shares (the local server, the
// hosted endpoint): which operation a call means, whoami, the connection's defaults (workspaceId,
// sessionId), strict inputs, and the result and error envelopes. Pure: the server supplies how to
// run an operation and what its connection is.

// A tools/call result (MCP CallToolResult with text content).
export type McpCallResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: true;
};

export type McpDispatchOptions = {
  // Errors that are not LydieErrors: "expose" their message (a local server, whose user is the
  // operator) or "hide" it behind "Internal error" (a server for other people). Default "hide".
  internalErrors?: "expose" | "hide";
};

export type McpWorkspaceRef = { id: string; name: string };

// What whoami returns.
export type McpWhoami = {
  // Who the calls are recorded as (an agent acting for `user`).
  actor: Actor;
  user: { id: string; name: string | null; email: string | null } | null;
  // The workspace tools default to; null when the connection reaches several.
  workspace: McpWorkspaceRef | null;
  workspaces: McpWorkspaceRef[];
  // Hosted: the default workspace's teamspaces the user can see (create_doc's teamspaceId).
  // Empty locally.
  teamspaces: { id: string; name: string; member: boolean }[];
  // The history session of this connection (list_session_changes, undo_session).
  sessionId: string;
};

// What a server knows about one MCP connection.
export type McpConnection = {
  // The workspace tools default to: a hosted token's, a local vault's.
  workspaceId?: string | null;
  // Every workspace the connection may name; another workspaceId is `not_found`.
  workspaces?: readonly string[];
  // The connection's history session, the default for `sessionId` inputs.
  sessionId?: string;
  whoami?: () => McpWhoami | Promise<McpWhoami>;
};

// What a tools/call resolves to: an operation to run with an input, or a result to send as is.
export type McpResolved =
  | { kind: "run"; op: AnyOperation; input: unknown }
  | { kind: "whoami" }
  | { kind: "result"; result: McpCallResult };

export type McpDispatcher = {
  readonly tools: McpTool[];
  resolve(
    name: string,
    args: Record<string, unknown> | undefined,
    connection?: McpConnection,
  ): McpResolved;
  // resolve, then run the operation through `execute` and wrap its output or error.
  call(
    name: string,
    args: Record<string, unknown> | undefined,
    execute: (op: AnyOperation, input: unknown) => Promise<unknown>,
    connection?: McpConnection,
  ): Promise<McpCallResult>;
};

// `registry`: every operation the server can run. Its MCP tools are listed, and only those can be
// called (a server with operations beyond the contract, such as the hosted core, passes them all).
export function createMcpDispatcher(
  registry: Registry,
  options: McpDispatchOptions = {},
): McpDispatcher {
  const tools = toMcpTools(registry);
  const byName = new Map<string, { op: AnyOperation; schema: JsonSchema; required: string[] }>();
  for (const op of mcpOperations(registry)) {
    byName.set(mcpToolOf(op)!.name, {
      op,
      schema: tools.find((t) => t._meta["lydie/operation"] === op.id)!.inputSchema,
      required: (toJsonSchema(op.input, "input").schema.required as string[] | undefined) ?? [],
    });
  }
  const whoamiSchema = tools.find((t) => t.name === WHOAMI_TOOL)!.inputSchema;
  const internal = options.internalErrors ?? "hide";

  const fail = (error: LydieError): McpResolved => ({
    kind: "result",
    result: mcpErrorResult(error),
  });

  // Strict keys, then the connection's defaults and its workspace check.
  const resolve = (
    name: string,
    args: Record<string, unknown> = {},
    connection: McpConnection = {},
  ): McpResolved => {
    if (name === WHOAMI_TOOL) {
      const unknown = unknownKey(args, whoamiSchema);
      return unknown ? fail(unknownKeyError(unknown, whoamiSchema)) : { kind: "whoami" };
    }
    const tool = byName.get(name);
    if (!tool) {
      return fail(
        new LydieError("unknown_operation", `Unknown tool "${name}"`, {
          hint: "tools/list names every tool this server has.",
        }),
      );
    }
    const { op, schema, required } = tool;
    const unknown = unknownKey(args, schema);
    if (unknown) return fail(unknownKeyError(unknown, schema));
    const properties = (schema.properties ?? {}) as Record<string, unknown>;
    const input = { ...args };
    for (const key of CONNECTION_DEFAULTS) {
      if (!(key in properties) || input[key] !== undefined) continue;
      const value = key === "workspaceId" ? connection.workspaceId : connection.sessionId;
      if (typeof value === "string") input[key] = value;
      else if (required.includes(key) && key === "workspaceId") {
        return fail(
          new LydieError("invalid_input", "workspaceId is required on this connection", {
            hint: "This connection reaches several workspaces: whoami lists them.",
          }),
        );
      }
    }
    const workspaceId = input.workspaceId;
    if (
      typeof workspaceId === "string" &&
      connection.workspaces &&
      !connection.workspaces.includes(workspaceId)
    ) {
      return fail(
        new LydieError("not_found", `Workspace ${workspaceId} not found`, {
          hint: "whoami lists the workspaces this connection reaches.",
        }),
      );
    }
    return { kind: "run", op, input };
  };

  return {
    tools,
    resolve,
    async call(name, args, execute, connection = {}) {
      const resolved = resolve(name, args, connection);
      if (resolved.kind === "result") return resolved.result;
      try {
        if (resolved.kind === "whoami") {
          if (!connection.whoami) throw new LydieError("internal", "whoami is not available here");
          return mcpResult(await connection.whoami());
        }
        return mcpResult(await execute(resolved.op, resolved.input));
      } catch (error) {
        return mcpErrorResult(error, { internalErrors: internal });
      }
    },
  };
}

export function mcpResult(value: unknown): McpCallResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: (value ?? {}) as Record<string, unknown>,
  };
}

// The error envelope (`{ error: { code, message, hint?, details? } }`) as an MCP error result.
export function mcpErrorResult(
  error: unknown,
  options: { internalErrors?: "expose" | "hide" } = {},
): McpCallResult {
  const envelope = isLydieError(error)
    ? error.toEnvelope()
    : {
        error: {
          code: "internal",
          message:
            options.internalErrors === "expose"
              ? error instanceof Error
                ? error.message
                : String(error)
              : "Internal error",
        },
      };
  return { isError: true, content: [{ type: "text", text: JSON.stringify(envelope, null, 2) }] };
}

// ---- Strict inputs. Zod drops keys it does not know, so `{ limit: 200 }` where the schema wants
// `{ window: { limit } }` used to succeed with the defaults. Agents are told instead, against the
// JSON Schema they were given.

type UnknownKey = { path: string; key: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The first key of `value` the schema has no place for, or null.
export function unknownKey(value: unknown, root: JsonSchema): UnknownKey | null {
  const defs = (root.$defs ?? {}) as Record<string, JsonSchema>;
  return walk(value, root, defs, "");
}

function deref(schema: JsonSchema, defs: Record<string, JsonSchema>): JsonSchema {
  let current = schema;
  for (let i = 0; i < 10 && typeof current.$ref === "string"; i++) {
    const { $ref, ...rest } = current;
    current = { ...defs[($ref as string).slice("#/$defs/".length)], ...rest };
  }
  return current;
}

function walk(
  value: unknown,
  raw: JsonSchema,
  defs: Record<string, JsonSchema>,
  path: string,
): UnknownKey | null {
  const schema = deref(raw, defs);
  const branches = (schema.anyOf ?? schema.oneOf) as JsonSchema[] | undefined;
  if (branches) {
    if (!isRecord(value) && !Array.isArray(value)) return null;
    const kind = Array.isArray(value) ? "array" : "object";
    // Branches of another JSON type (`null` in a nullable object) say nothing about the keys.
    const candidates = branches.filter((b) => {
      const type = deref(b, defs).type;
      return type === undefined || type === kind || (Array.isArray(type) && type.includes(kind));
    });
    // A discriminated union: the branch whose `type` constant matches.
    const tag = isRecord(value) ? value.type : undefined;
    const tagged = candidates.find((b) => {
      const props = deref(b, defs).properties as Record<string, JsonSchema> | undefined;
      return props?.type?.const !== undefined && props.type.const === tag;
    });
    if (tagged) return walk(value, tagged, defs, path);
    let first: UnknownKey | null = null;
    for (const branch of candidates) {
      const found = walk(value, branch, defs, path);
      if (!found) return null;
      first ??= found;
    }
    return first;
  }
  if (Array.isArray(value)) {
    const items = schema.items as JsonSchema | undefined;
    if (!items) return null;
    for (const [i, item] of value.entries()) {
      const found = walk(item, items, defs, `${path}[${i}]`);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  const properties = schema.properties as Record<string, JsonSchema> | undefined;
  const additional = schema.additionalProperties;
  for (const [key, item] of Object.entries(value)) {
    const at = path ? `${path}.${key}` : key;
    const known = properties?.[key];
    if (known) {
      const found = walk(item, known, defs, at);
      if (found) return found;
    } else if (additional !== undefined && additional !== false) {
      if (typeof additional === "object") {
        const found = walk(item, additional as JsonSchema, defs, at);
        if (found) return found;
      }
    } else if (properties || additional === false) {
      return { path: at, key };
    }
  }
  return null;
}

function unknownKeyError(unknown: UnknownKey, root: JsonSchema): LydieError {
  const defs = (root.$defs ?? {}) as Record<string, JsonSchema>;
  const places = placesOf(unknown.key, root, defs, "", 0).filter((p) => p !== unknown.path);
  const hint =
    places.length > 0
      ? `${unknown.key} belongs under ${places.map((p) => p.slice(0, -unknown.key.length - 1) || "the top level").join(" or ")}.`
      : "Check the tool's input schema in tools/list.";
  return new LydieError("invalid_input", `Unknown input key "${unknown.path}"`, {
    hint,
    details: { path: unknown.path },
  });
}

// Where `key` is a property in the schema, as paths (`window.limit`, `rows[].values`).
function placesOf(
  key: string,
  raw: JsonSchema,
  defs: Record<string, JsonSchema>,
  path: string,
  depth: number,
): string[] {
  if (depth > 4) return [];
  const schema = deref(raw, defs);
  const out: string[] = [];
  const branches = (schema.anyOf ?? schema.oneOf) as JsonSchema[] | undefined;
  for (const b of branches ?? []) out.push(...placesOf(key, b, defs, path, depth + 1));
  if (schema.items)
    out.push(...placesOf(key, schema.items as JsonSchema, defs, `${path}[]`, depth));
  const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
  for (const [name, sub] of Object.entries(properties)) {
    const at = path ? `${path}.${name}` : name;
    if (name === key) out.push(at);
    else out.push(...placesOf(key, sub, defs, at, depth + 1));
  }
  const levels = (p: string) => p.split(/\.|\[\]/).length;
  return [...new Set(out)].sort((a, b) => levels(a) - levels(b)).slice(0, 3);
}
