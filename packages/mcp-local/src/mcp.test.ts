import { afterEach, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openVault, runnableOperations } from "@lydie/bridge-fs";
import type { Vault } from "@lydie/bridge-fs";
import { toMcpTools } from "@lydie/contract";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { createMcpControl } from "./control.ts";

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});

async function setup() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "lydie-mcp-")));
  cleanups.push(() => rmSync(base, { recursive: true, force: true }));
  const folder = join(base, "vault");
  mkdirSync(folder);
  writeFileSync(join(folder, "Existing.md"), "---\nkeep: yes\n---\nOriginal text.\n");
  const vault: Vault = await openVault({
    folder,
    databasePath: join(base, "db.sqlite"),
    watch: false,
  });
  cleanups.push(() => vault.close());
  const mcp = createMcpControl(vault, { dataDir: join(base, "data") });
  cleanups.push(() => mcp.close());
  const status = await mcp.setEnabled(true);
  const token = await mcp.token();
  return { folder, vault, mcp, url: status.url!, token };
}

async function connect(url: string, token: string, name = "test-agent") {
  const client = new Client({ name, version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  cleanups.push(() => client.close());
  return { client, transport };
}

test("lists one tool per operation in the registry", async () => {
  const { url, token } = await setup();
  const { client } = await connect(url, token);
  const { tools } = await client.listTools();
  const expected = toMcpTools(runnableOperations());
  expect(tools.map((t) => t.name).sort()).toEqual(expected.map((t) => t.name).sort());
  expect(JSON.stringify({ tools }).length).toBeLessThan(61_000);
  const create = tools.find((t) => t.name === "create_doc")!;
  expect(create.inputSchema).toEqual(
    expected.find((t) => t.name === "create_doc")!.inputSchema as never,
  );
  expect(create.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
});

test("an agent session's changes land on disk and are undone together", async () => {
  const { folder, vault, url, token } = await setup();
  const { client, transport } = await connect(url, token, "claude-code");
  const ws = vault.workspaceId;

  const created = await client.callTool({
    name: "create_doc",
    arguments: { workspaceId: ws, title: "Agent note", markdown: "Written by an agent.\n" },
  });
  expect(created.isError).toBeFalsy();
  const doc = created.structuredContent as { id: string; createdBy: string };
  expect(doc.createdBy).toBe(`agent:claude-code:${transport.sessionId}:local`);
  expect(readFileSync(join(folder, "Agent note.md"), "utf8")).toContain("Written by an agent.\n");

  const existingId = (await vault.store.listTree(ws)).find((d) => d.title === "Existing")!.id;
  const edited = await client.callTool({
    name: "update_doc",
    arguments: {
      id: existingId,
      edits: [{ oldStr: "Original text.", newStr: "Edited by the agent." }],
    },
  });
  expect(edited.isError).toBeFalsy();
  expect(readFileSync(join(folder, "Existing.md"), "utf8")).toBe(
    "---\nkeep: yes\n---\nEdited by the agent.\n",
  );

  const changes = await client.callTool({
    name: "list_session_changes",
    arguments: { sessionId: transport.sessionId },
  });
  const entries = (changes.structuredContent as { entries: { operation: string }[] }).entries;
  expect(entries.map((e) => e.operation)).toEqual(["doc.create", "doc.updateBody"]);

  const undone = await client.callTool({
    name: "undo_session",
    arguments: { sessionId: transport.sessionId },
  });
  expect(undone.isError).toBeFalsy();
  expect((undone.structuredContent as { skipped: unknown[] }).skipped).toEqual([]);
  expect(readFileSync(join(folder, "Existing.md"), "utf8")).toBe(
    "---\nkeep: yes\n---\nOriginal text.\n",
  );
  expect(existsSync(join(folder, "Agent note.md"))).toBe(false);
  expect(existsSync(join(folder, ".trash/Agent note.md"))).toBe(true);
});

test("the vault is the default workspace, whoami names it, and sessions default to the agent's", async () => {
  const { folder, vault, url, token } = await setup();
  const { client, transport } = await connect(url, token, "claude-code");
  const workspace = { id: vault.workspaceId, name: "vault" };
  expect(client.getInstructions()).toContain(`Workspace "vault" (${vault.workspaceId})`);
  const whoami = await client.callTool({ name: "whoami", arguments: {} });
  expect(whoami.structuredContent).toMatchObject({
    actor: { type: "agent", app: "claude-code", id: transport.sessionId },
    workspace,
    workspaces: [workspace],
    sessionId: transport.sessionId,
  });

  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as { text: string }[])[0]!.text;
    return { error: result.isError ? JSON.parse(text).error : null, out: result.structuredContent };
  };
  const created = await call("create_doc", { title: "Defaulted", markdown: "" });
  expect(created.error).toBeNull();
  const id = (created.out as { id: string }).id;
  // An empty body can be filled with append; edits are all or nothing.
  expect(
    (await call("update_doc", { id, edits: [{ type: "append", newStr: "Appended.\n" }] })).error,
  ).toBeNull();
  const failed = await call("update_doc", {
    id,
    edits: [
      { type: "prepend", newStr: "First." },
      { oldStr: "missing", newStr: "x" },
    ],
  });
  expect(failed.error).toMatchObject({ code: "invalid_input", details: { editIndex: 1 } });
  expect(readFileSync(join(folder, "Defaulted.md"), "utf8")).toContain("Appended.\n");
  expect(readFileSync(join(folder, "Defaulted.md"), "utf8")).not.toContain("First.");

  expect((await call("list_databases", { workspaceId: "01NOTAWORKSPACE" })).error).toMatchObject({
    code: "not_found",
  });
  expect((await call("list_docs", { limit: 5 })).error).toMatchObject({
    code: "invalid_input",
    message: 'Unknown input key "limit"',
  });
  const changes = await call("list_session_changes", {});
  expect(
    (changes.out as { entries: { operation: string }[] }).entries.map((e) => e.operation),
  ).toEqual(["doc.create", "doc.updateBody"]);
  expect((await call("undo_session", {})).error).toBeNull();
  expect(existsSync(join(folder, "Defaulted.md"))).toBe(false);
});

test("errors come back as tool errors with the contract's envelope", async () => {
  const { url, token } = await setup();
  const { client } = await connect(url, token);
  const result = await client.callTool({ name: "fetch_doc", arguments: { id: "nope" } });
  expect(result.isError).toBe(true);
  const text = (result.content as { text: string }[])[0]!.text;
  expect(JSON.parse(text).error.code).toBe("invalid_input");
});

test("rejects requests without the token or from another origin", async () => {
  const { url, token } = await setup();
  const init = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "x", version: "1" },
    },
  };
  const post = (headers: Record<string, string>) =>
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...headers,
      },
      body: JSON.stringify(init),
    });
  expect((await post({})).status).toBe(401);
  expect((await post({ Authorization: "Bearer wrong" })).status).toBe(401);
  expect(
    (await post({ Authorization: `Bearer ${token}`, Origin: "https://evil.example" })).status,
  ).toBe(403);
  const ok = await post({ Authorization: `Bearer ${token}` });
  expect(ok.status).toBe(200);
  expect(ok.headers.get("mcp-session-id")).toBeTruthy();
  await ok.body?.cancel();
});

test("stopping the server closes the port", async () => {
  const { mcp, url, token } = await setup();
  expect((await mcp.setEnabled(false)).running).toBe(false);
  const error = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeTruthy();
});

test("database tools work end to end and land in the folder", async () => {
  const { folder, vault, url, token } = await setup();
  const { client } = await connect(url, token);
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    if (result.isError) throw new Error((result.content as { text: string }[])[0]!.text);
    return result.structuredContent as Record<string, unknown>;
  };
  const db = (await call("create_database", {
    workspaceId: vault.workspaceId,
    title: "Reading",
  })) as {
    database: { id: string };
  };
  const outline = (await call("change_database_schema", {
    databaseId: db.database.id,
    add: [{ name: "Rating", type: "number" }],
  })) as { properties: { name: string }[] };
  expect(outline.properties.map((p) => p.name)).toContain("Rating");
  const written = (await call("write_database_rows", {
    databaseId: db.database.id,
    rows: [{ title: "Dune", values: { Rating: 5 }, markdown: "A desert planet.\n" }],
  })) as { rows: { id: string; title: string; action: string }[] };
  expect(written.rows).toMatchObject([{ title: "Dune", action: "created", uniqueId: null }]);
  expect(readFileSync(join(folder, "Reading/Dune.md"), "utf8")).toContain("A desert planet.\n");
  const rows = (await call("query_database", { databaseId: db.database.id })) as {
    rows: { title: string; properties: Record<string, unknown> }[];
  };
  expect(rows.rows.map((r) => [r.title, r.properties.Rating])).toEqual([["Dune", 5]]);
  expect(readFileSync(join(folder, "Reading/Dune.md"), "utf8")).toContain("Rating: 5\n");
  expect(readFileSync(join(folder, "Reading/Reading.base"), "utf8")).toContain("note.Rating");

  // Views through change_database_views; there are no generic tools to run operations by id.
  const { tools } = await client.listTools();
  for (const name of ["create_database_view", "run_operation", "describe_operation"]) {
    expect(tools.some((t) => t.name === name)).toBe(false);
  }
  await call("change_database_views", {
    databaseId: db.database.id,
    add: [{ name: "Shelf", type: "list" }],
  });
  expect(readFileSync(join(folder, "Reading/Reading.base"), "utf8")).toContain("name: Shelf");

  // A row's title, values and body in one update_doc.
  await call("update_doc", {
    id: written.rows[0]!.id,
    title: "Dune Messiah",
    properties: { Rating: 4 },
    markdown: "The sequel.\n",
  });
  const sequel = readFileSync(join(folder, "Reading/Dune Messiah.md"), "utf8");
  expect(sequel).toContain("Rating: 4\n");
  expect(sequel).toContain("The sequel.\n");
});
