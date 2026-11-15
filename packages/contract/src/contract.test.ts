import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import {
  createRegistry,
  defineOperation,
  defineQuery,
  docMove,
  Document,
  docUpdateBody,
  EVENT_TYPES,
  generatedFiles,
  LydieEvent,
  operations,
  RUN_OPERATION_TOOL,
  toCliCommand,
  toMcpTool,
  toMcpTools,
  toOpenApi,
} from "./index.ts";

const generatedDir = join(import.meta.dirname, "..", "generated");

describe("parity", () => {
  // Plan §2: every operation reaches REST, MCP and the CLI, or says why not.
  const all = Object.values(operations);
  it.each(all.filter((op) => !op.internal))("$id has REST, MCP and CLI projections", (op) => {
    expect(op.rest, `${op.id} has no REST projection`).toBeDefined();
    expect(op.mcp, `${op.id} has no MCP projection`).toBeDefined();
    expect(op.cli, `${op.id} has no CLI projection`).toBeDefined();
  });

  it.each(all.filter((op) => op.kind === "mutation"))("$id declares how to undo it", (op) => {
    expect(op.undo, `${op.id} has no undo declaration`).not.toBeNull();
    if (op.undo && op.undo !== "inverse") expect(op.undo.none.trim()).not.toBe("");
    // Something that cannot be undone must say so to agents.
    if (op.undo !== "inverse") expect(op.destructive).toBe(true);
  });

  it("gives every internal operation a reason", () => {
    for (const op of all.filter((o) => o.internal)) {
      expect(op.internal?.reason.trim()).not.toBe("");
    }
  });

  it("projects every public operation", () => {
    const publicOps = Object.values(operations).filter((op) => !op.internal);
    const openapi = toOpenApi(operations);
    const restIds = Object.values(openapi.paths).flatMap((item) =>
      Object.values(item).map((o) => (o as { operationId: string }).operationId),
    );
    expect(restIds.sort()).toEqual(publicOps.map((op) => op.id).sort());
    expect(toMcpTools(operations, { expose: "all" })).toHaveLength(publicOps.length);
  });

  // Everything the UI can do, an agent can do: each operation is a listed tool or reachable
  // through run_operation (whose schema names every operation id).
  it("makes every public operation reachable through MCP", () => {
    const publicOps = Object.values(operations).filter((op) => !op.internal);
    const tools = toMcpTools(operations);
    const listed = new Set(tools.map((t) => t._meta["lydie/operation"]).filter(Boolean));
    const run = tools.find((t) => t.name === RUN_OPERATION_TOOL)!;
    const runnable = new Set(
      (run.inputSchema.properties as { operation: { enum: string[] } }).operation.enum,
    );
    for (const op of publicOps) {
      expect(listed.has(op.id) || runnable.has(op.id), `${op.id} is not reachable`).toBe(true);
    }
    expect([...runnable].sort()).toEqual(publicOps.map((op) => op.id).sort());
  });

  it("keeps the agent tool list small", () => {
    expect(JSON.stringify({ tools: toMcpTools(operations) }).length).toBeLessThan(61_000);
  });

  it("declares only known events", () => {
    for (const op of Object.values(operations)) {
      for (const type of op.emits) expect(EVENT_TYPES).toContain(type);
    }
  });
});

describe("generated files", () => {
  // Byte-level drift (including formatting) is checked by `generate --check`; this catches content drift.
  it.each(Object.entries(generatedFiles(operations)))("%s is up to date", (fileName, value) => {
    const committed = JSON.parse(readFileSync(join(generatedDir, fileName), "utf8")) as unknown;
    expect(committed, "Run `bun --filter=@lydie/contract run generate`").toEqual(
      JSON.parse(JSON.stringify(value)),
    );
  });
});

describe("MCP tools", () => {
  it("have object schemas at the root and correct hints", () => {
    for (const tool of toMcpTools(operations, { expose: "all" })) {
      expect(tool.inputSchema.type).toBe("object");
      if (tool.outputSchema) expect(tool.outputSchema.type).toBe("object");
    }
    for (const op of Object.values(operations)) {
      if (!op.mcp || op.internal) continue;
      expect(toMcpTool(op, { outputSchema: true }).outputSchema?.type).toBe("object");
    }
    const tools = Object.fromEntries(toMcpTools(operations).map((t) => [t.name, t]));
    expect(tools.delete_doc?.annotations).toMatchObject({
      destructiveHint: true,
      readOnlyHint: false,
    });
    expect(tools.search?.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true });
  });
});

describe("CLI commands", () => {
  it("derive positional args and kebab-case flags", () => {
    const cmd = toCliCommand(docMove);
    expect(cmd.command).toEqual(["doc", "mv"]);
    expect(cmd.args.map((a) => [a.key, a.type, a.nullable])).toEqual([
      ["id", "string", false],
      ["parentId", "string", true],
    ]);
    expect(cmd.flags.map((f) => f.name)).toEqual(["after-id", "before-id", "sort-key"]);
    expect(toCliCommand(docUpdateBody).flags.find((f) => f.key === "edits")?.type).toBe("json");
  });
});

describe("registry", () => {
  const base = {
    summary: "x",
    input: z.object({}),
    output: z.object({}),
    scopes: [] as const,
  };

  it("rejects duplicate MCP names and routes", () => {
    const a = defineQuery({ ...base, id: "a.one", mcp: { name: "same", title: "A" } });
    const b = defineQuery({ ...base, id: "a.two", mcp: { name: "same", title: "B" } });
    expect(() => createRegistry(a, b)).toThrow(/MCP tool same/);
  });

  it("validates ids and tool names", () => {
    expect(() => defineQuery({ ...base, id: "Bad" })).toThrow(/namespace/);
    expect(() =>
      defineOperation({
        ...base,
        id: "a.b",
        destructive: false,
        idempotent: true,
        mcp: { name: "Not-Snake", title: "x" },
      }),
    ).toThrow(/snake_case/);
  });
});

describe("schemas", () => {
  it("parse a document and an event", () => {
    const doc = Document.parse({
      id: "01933e6f-2284-b878-270f-04d17c6d9e48",
      workspaceId: "ws",
      parentId: null,
      title: "Hello",
      sortKey: "a0",
      properties: { tags: ["x"], done: false },
      createdAt: "2026-11-12T10:00:00.000Z",
      updatedAt: "2026-11-12T10:00:00.000Z",
      deletedAt: null,
    });
    const event = LydieEvent.parse({
      id: doc.id,
      workspaceId: "ws",
      at: doc.createdAt,
      actor: { type: "user", id: "u1" },
      operationId: doc.id,
      type: "doc.created",
      data: { document: doc },
    });
    expect(event.type).toBe("doc.created");
  });

  it("requires exactly one of markdown or edits", () => {
    const id = "01933e6f-2284-b878-270f-04d17c6d9e48";
    expect(docUpdateBody.input.safeParse({ id }).success).toBe(false);
    expect(docUpdateBody.input.safeParse({ id, markdown: "x", edits: [] }).success).toBe(false);
    expect(docUpdateBody.input.safeParse({ id, markdown: "x" }).success).toBe(true);
  });
});
