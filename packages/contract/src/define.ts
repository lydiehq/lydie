import type { z } from "zod";

import type { EventType } from "./events.ts";

// inbox:write only adds to the inbox (inbox.capture): what a web clipper or an automation needs,
// without reading or changing anything else. docs:write covers it.
export const SCOPES = ["docs:read", "docs:write", "inbox:write"] as const;
export type Scope = (typeof SCOPES)[number];

export function hasScope(granted: readonly Scope[], scope: Scope): boolean {
  return granted.includes(scope) || (scope === "inbox:write" && granted.includes("docs:write"));
}

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type RestProjection = {
  method: HttpMethod;
  // OpenAPI path template relative to the `/v1` server, e.g. `/documents/{id}/move`.
  // Every `{param}` must be a top-level input field.
  path: string;
};

// MCP tools are chosen, not generated one per operation (Linear's and Notion's servers, Anthropic's
// "Writing effective tools for agents"): an operation is a tool when an agent does that task on its
// own, and otherwise says which tool covers it or why agents should not have it.
export type McpToolSpec = {
  // snake_case tool name, identical in local and hosted mode.
  name: string;
  title: string;
  // true: the tool lists an outputSchema. Off by default: an agent gets every result as JSON text
  // and structuredContent anyway, and most output schemas (documents, definitions, query results)
  // are large without telling it anything it needs. Turn it on for small results worth describing.
  outputSchema?: boolean;
};

// Not a tool. The reason names the tool that covers the operation ("update_doc sets the title"),
// or why agents are not given it (permanent deletion, account administration).
export type McpNone = { none: string };

export type McpProjection = McpToolSpec | McpNone;

// The operation's tool, or null when it has none.
export function mcpToolOf(op: { mcp?: McpProjection }): McpToolSpec | null {
  return op.mcp && "name" in op.mcp ? op.mcp : null;
}

export type CliProjection = {
  // Words after `lydie`, e.g. `["doc", "mv"]`.
  command: readonly string[];
  // Input fields taken positionally, in order. Everything else becomes a `--flag`.
  args?: readonly string[];
};

export type UiProjection = {
  // bindable false: not offered a keyboard shortcut (CommandDef.bindable).
  commandPalette?: { title: string; group?: string; bindable?: boolean };
};

type CommonFields<Id extends string, I extends z.ZodType, O extends z.ZodType> = {
  id: Id;
  summary: string;
  description?: string;
  input: I;
  output: O;
  scopes: readonly Scope[];
  rest?: RestProjection;
  mcp?: McpProjection;
  cli?: CliProjection;
  ui?: UiProjection;
  // Opt-out of the REST/MCP/CLI parity rule. The reason is shown in the parity test output.
  internal?: { reason: string };
};

// How a mutation is undone. "inverse": the handler records operations that restore the previous
// state exactly (`ctx.inverse(...)` in @lydie/runtime), and undo runs them as ordinary operations.
// `{ none }`: the change cannot be undone (e.g. a permanent purge); the reason is shown to users.
export type UndoSpec = "inverse" | { none: string };

export type OperationConfig<
  Id extends string,
  I extends z.ZodType,
  O extends z.ZodType,
> = CommonFields<Id, I, O> & {
  destructive: boolean;
  idempotent: boolean;
  // Required for every operation in the registry (the parity test enforces it). Optional in the
  // type only so operations defined elsewhere (the core's) keep compiling until they declare it.
  undo?: UndoSpec;
  // Runs other operations (`ctx.exec`) and is not logged itself: only the operations it runs are,
  // so replaying the log never applies a change twice. Example: history.undoSession.
  composite?: boolean;
  emits?: readonly EventType[];
};

export type QueryConfig<Id extends string, I extends z.ZodType, O extends z.ZodType> = CommonFields<
  Id,
  I,
  O
>;

export type OperationKind = "mutation" | "query";

export type OperationDef<
  Id extends string = string,
  I extends z.ZodType = z.ZodType,
  O extends z.ZodType = z.ZodType,
  K extends OperationKind = OperationKind,
> = CommonFields<Id, I, O> & {
  kind: K;
  destructive: boolean;
  idempotent: boolean;
  readOnly: boolean;
  // null for queries and for mutations that did not declare it (treated as not undoable).
  undo: UndoSpec | null;
  composite: boolean;
  emits: readonly EventType[];
};

export type AnyOperation = OperationDef<string, z.ZodType, z.ZodType, OperationKind>;

export type InputOf<O extends AnyOperation> = z.input<O["input"]>;
export type ParsedInputOf<O extends AnyOperation> = z.output<O["input"]>;
export type OutputOf<O extends AnyOperation> = z.output<O["output"]>;

const OPERATION_ID = /^[a-z][a-zA-Z]*(\.[a-z][a-zA-Z]*)+$/;
const MCP_NAME = /^[a-z][a-z0-9_]{0,63}$/;

function check<Id extends string>(def: CommonFields<Id, z.ZodType, z.ZodType>): void {
  if (!OPERATION_ID.test(def.id)) {
    throw new Error(`Operation id "${def.id}" must look like "namespace.camelCaseName"`);
  }
  const tool = mcpToolOf(def);
  if (tool && !MCP_NAME.test(tool.name)) {
    throw new Error(`${def.id}: MCP tool name "${tool.name}" must be snake_case`);
  }
  if (def.mcp && !tool && !(def.mcp as McpNone).none.trim()) {
    throw new Error(`${def.id}: mcp { none } needs a reason`);
  }
  if (def.internal && !def.internal.reason.trim()) {
    throw new Error(`${def.id}: internal operations need a reason`);
  }
}

// A mutation: changes state, runs inside one transaction, is appended to the operation log.
export function defineOperation<const Id extends string, I extends z.ZodType, O extends z.ZodType>(
  config: OperationConfig<Id, I, O>,
): OperationDef<Id, I, O, "mutation"> {
  check(config);
  if (config.undo && typeof config.undo === "object" && !config.undo.none.trim()) {
    throw new Error(`${config.id}: undo { none } needs a reason`);
  }
  return Object.freeze({
    ...config,
    kind: "mutation" as const,
    readOnly: false,
    undo: config.undo ?? null,
    composite: config.composite ?? false,
    emits: config.emits ?? [],
  });
}

// A read. Projected to REST/MCP/CLI like operations, never logged.
export function defineQuery<const Id extends string, I extends z.ZodType, O extends z.ZodType>(
  config: QueryConfig<Id, I, O>,
): OperationDef<Id, I, O, "query"> {
  check(config);
  return Object.freeze({
    ...config,
    kind: "query" as const,
    readOnly: true,
    destructive: false,
    idempotent: true,
    undo: null,
    composite: false,
    emits: [],
  });
}
