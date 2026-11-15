import { describe, expect, it } from "bun:test";

import { z } from "zod";

import { defineOperation, defineQuery } from "../define.ts";
import { LydieError } from "../errors.ts";
import { createRegistry, operations } from "../registry.ts";
import { createMcpDispatcher } from "./mcp-dispatch.ts";
import type { McpConnection } from "./mcp-dispatch.ts";
import {
  DESCRIBE_OPERATION_TOOL,
  mcpInstructions,
  RUN_OPERATION_TOOL,
  toMcpTools,
  WHOAMI_TOOL,
} from "./mcp.ts";

const text = (r: { content: { text: string }[] }) => JSON.parse(r.content[0]!.text) as unknown;

describe("createMcpDispatcher", () => {
  const ran: [string, unknown][] = [];
  const execute = async (op: { id: string }, input: unknown) => {
    ran.push([op.id, input]);
    if (op.id === "doc.get")
      throw new LydieError("not_found", "No such document", { hint: "List first." });
    if (op.id === "doc.listTree") throw new Error("disk on fire");
    return { ok: true };
  };

  it("lists the agent tools and runs listed and fine-grained operations", async () => {
    const d = createMcpDispatcher(operations);
    expect(d.tools).toEqual(toMcpTools(operations));
    ran.length = 0;

    expect(await d.call("create_doc", { workspaceId: "ws" }, execute)).toEqual({
      content: [{ type: "text", text: JSON.stringify({ ok: true }, null, 2) }],
      structuredContent: { ok: true },
    });
    const fine = await d.call(
      RUN_OPERATION_TOOL,
      { operation: "database.addOption", input: { propertyId: "p" } },
      execute,
    );
    expect(fine.isError).toBeUndefined();
    expect(ran).toEqual([
      ["doc.create", { workspaceId: "ws" }],
      ["database.addOption", { propertyId: "p" }],
    ]);
    // A fine-grained operation is not a listed tool name.
    const fineTool = (await d.call("add_select_option", {}, execute)) as { isError?: true };
    expect(fineTool.isError).toBe(true);
  });

  it("describes operations and reports errors in the envelope", async () => {
    const d = createMcpDispatcher(operations);
    const described = await d.call(
      DESCRIBE_OPERATION_TOOL,
      { operation: "database.addOption" },
      execute,
    );
    expect(text(described)).toMatchObject({ operation: "database.addOption", inputSchema: {} });
    expect((text(described) as { outputSchema?: unknown }).outputSchema).toBeDefined();

    const unknown = await d.call(RUN_OPERATION_TOOL, { operation: "nope.nope" }, execute);
    expect(unknown.isError).toBe(true);
    expect(text(unknown)).toMatchObject({ error: { code: "unknown_operation" } });
    expect(text(await d.call("no_such_tool", undefined, execute))).toMatchObject({
      error: { code: "unknown_operation", message: 'Unknown tool "no_such_tool"' },
    });
    expect(text(await d.call("fetch_doc", { id: "x" }, execute))).toEqual({
      error: { code: "not_found", message: "No such document", hint: "List first." },
    });
    // Unexpected errors: hidden by default, shown when the server's user is its operator.
    expect(text(await d.call("list_docs", { workspaceId: "ws" }, execute))).toEqual({
      error: { code: "internal", message: "Internal error" },
    });
    const local = createMcpDispatcher(operations, { internalErrors: "expose" });
    expect(text(await local.call("list_docs", { workspaceId: "ws" }, execute))).toEqual({
      error: { code: "internal", message: "disk on fire" },
    });
  });

  it("reaches a larger callable registry by id without listing it", async () => {
    const base = { summary: "x", input: z.object({}), output: z.object({}), scopes: [] as const };
    const extra = defineOperation({
      ...base,
      id: "server.only",
      destructive: false,
      idempotent: true,
      mcp: { name: "server_only", title: "Server only" },
    });
    const listed = createRegistry(
      defineQuery({ ...base, id: "a.read", mcp: { name: "a_read", title: "Read" } }),
    );
    const d = createMcpDispatcher(listed, { callable: { ...listed, [extra.id]: extra } });
    expect(d.tools.map((t) => t.name)).toEqual(["whoami", "a_read"]);
    expect(d.resolve(RUN_OPERATION_TOOL, { operation: "server.only" })).toMatchObject({
      kind: "run",
      op: { id: "server.only" },
      input: {},
    });
    expect(d.resolve("server_only", {})).toMatchObject({ kind: "result" });
  });
});

describe("MCP connection defaults and strict inputs", () => {
  const d = createMcpDispatcher(operations);
  const connection = { workspaceId: "ws1", workspaces: ["ws1"], sessionId: "mcp:abc" };
  const resolved = (name: string, args: Record<string, unknown>, c: McpConnection = connection) =>
    d.resolve(name, args, c);
  const errorOf = (r: ReturnType<typeof d.resolve>) =>
    r.kind === "result" ? (text(r.result) as { error: Record<string, unknown> }).error : null;

  it("makes workspaceId and sessionId optional and fills them from the connection", () => {
    const tools = Object.fromEntries(d.tools.map((t) => [t.name, t]));
    expect(tools.list_databases!.inputSchema.required).toBeUndefined();
    expect(tools.create_doc!.inputSchema.required ?? []).not.toContain("workspaceId");
    expect(tools.undo_session!.inputSchema.required ?? []).not.toContain("sessionId");
    expect(resolved("list_databases", {})).toMatchObject({ input: { workspaceId: "ws1" } });
    expect(resolved("list_sessions", {})).toMatchObject({ input: { workspaceId: "ws1" } });
    expect(resolved("undo_session", {})).toMatchObject({ input: { sessionId: "mcp:abc" } });
    expect(resolved("fetch_doc", { id: "x" })).toMatchObject({ input: { id: "x" } });
    expect(resolved(RUN_OPERATION_TOOL, { operation: "trash.list", input: {} })).toMatchObject({
      kind: "run",
      input: { workspaceId: "ws1" },
    });
    // A connection with several workspaces has no default.
    expect(
      errorOf(resolved("list_databases", {}, { ...connection, workspaceId: null })),
    ).toMatchObject({
      code: "invalid_input",
      message: "workspaceId is required on this connection",
    });
  });

  it("answers an unknown workspace with not_found", () => {
    for (const [name, args] of [
      ["list_databases", {}],
      ["list_sessions", {}],
      ["list_docs", {}],
      ["search", { query: "x" }],
    ] as const) {
      expect(errorOf(resolved(name, { ...args, workspaceId: "other" }))).toMatchObject({
        code: "not_found",
        message: "Workspace other not found",
      });
    }
  });

  it("rejects unknown keys, with a hint where they belong", () => {
    expect(
      errorOf(resolved("query_database", { databaseId: "d", limit: 200, offset: 100 })),
    ).toEqual({
      code: "invalid_input",
      message: 'Unknown input key "limit"',
      hint: "limit belongs under window or view.config.",
      details: { path: "limit" },
    });
    expect(
      errorOf(
        resolved("write_database_rows", { databaseId: "d", rows: [{ title: "x", body: "y" }] }),
      ),
    ).toMatchObject({ message: 'Unknown input key "rows[0].body"' });
    expect(
      errorOf(resolved(RUN_OPERATION_TOOL, { operation: "doc.get", input: { id: "x", body: 1 } })),
    ).toMatchObject({ message: 'Unknown input key "input.body"' });
    expect(
      errorOf(resolved(RUN_OPERATION_TOOL, { operation: "doc.get", inputs: {} })),
    ).toMatchObject({ message: 'Unknown input key "inputs"' });
    // Open records and discriminated unions are checked as their schema says.
    expect(
      resolved("write_database_rows", { databaseId: "d", rows: [{ values: { Anything: 1 } }] }),
    ).toMatchObject({ kind: "run" });
    const filter = { type: "condition", propertyId: "Status", op: "eq", value: "Done" };
    expect(
      resolved("query_database", { databaseId: "d", view: { config: { filter } } }),
    ).toMatchObject({ kind: "run" });
    expect(
      errorOf(
        resolved("query_database", {
          databaseId: "d",
          view: { config: { filter: { ...filter, property: "x" } } },
        }),
      ),
    ).toMatchObject({ message: 'Unknown input key "view.config.filter.property"' });
  });

  it("answers whoami from the connection and writes the instructions", async () => {
    expect(d.tools[0]!.name).toBe(WHOAMI_TOOL);
    const whoami = {
      actor: { type: "agent" as const, app: "claude", id: "s", onBehalfOf: "u1" },
      user: { id: "u1", name: "Lars", email: null },
      workspace: { id: "ws1", name: "Lydie" },
      workspaces: [{ id: "ws1", name: "Lydie" }],
      teamspaces: [],
      sessionId: "mcp:abc",
    };
    const result = await d.call(WHOAMI_TOOL, {}, async () => null, {
      ...connection,
      whoami: () => whoami,
    });
    expect(text(result)).toEqual(whoami);
    const instructions = mcpInstructions({ mode: "hosted", workspace: whoami.workspace });
    expect(instructions).toContain('Workspace "Lydie" (ws1)');
    expect(instructions).toContain("oldStr");
    expect(instructions).not.toContain("old_str");
  });
});
