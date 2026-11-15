import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runnableOperations } from "@lydie/bridge-fs";
import { toCliCommands } from "@lydie/contract";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { parseArgv, runCli } from "./cli.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function setup() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "lydie-cli-")));
  dirs.push(base);
  const vault = join(base, "vault");
  mkdirSync(join(vault, "Notes"), { recursive: true });
  writeFileSync(join(vault, "Home.md"), "# Home\n\nSee [[Idea]].\n");
  writeFileSync(join(vault, "Notes/Idea.md"), "---\nstatus: draft\n---\nAn idea.\n");
  const db = join(base, "db.sqlite");
  return { base, vault, db };
}

async function lydie(args: string[], env: { vault: string; db: string }, stdin = "") {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli([...args, "--vault", env.vault, "--db", env.db], {
    stdout: (t) => out.push(t),
    stderr: (t) => err.push(t),
    stdin: async () => stdin,
    env: {},
  });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

test("every operation with a CLI projection is a command", async () => {
  const { code, out } = await lydie(["--help"], { vault: "/nonexistent", db: "/nonexistent" });
  expect(code).toBe(0);
  for (const c of toCliCommands(runnableOperations())) expect(out).toContain(c.command.join(" "));
});

test("parses words and flags", () => {
  const { words, flags } = parseArgv(["doc", "mv", "X", "--parent-id=null", "--after-id", "Y"]);
  expect(words).toEqual(["doc", "mv", "X"]);
  expect([...flags]).toEqual([
    ["parent-id", "null"],
    ["after-id", "Y"],
  ]);
});

test("commands change the folder and print results", async () => {
  const env = setup();
  const tree = await lydie(["doc", "tree", "--json"], env);
  expect(tree.code).toBe(0);
  const entries = JSON.parse(tree.out).entries as { id: string; title: string }[];
  expect(entries.map((e) => e.title)).toEqual(["Home", "Notes", "Idea"]);
  const idea = entries.find((e) => e.title === "Idea")!;

  // Positional title, JSON and boolean-free flags; workspaceId comes from the vault.
  const created = await lydie(
    [
      "doc",
      "create",
      "From the CLI",
      "--markdown",
      "Hello",
      "--properties",
      '{"status":"new"}',
      "--json",
    ],
    env,
  );
  expect(created.code).toBe(0);
  const id = JSON.parse(created.out).id as string;
  expect(readFileSync(join(env.vault, "From the CLI.md"), "utf8")).toBe(
    `---\nid: ${id}\nstatus: new\n---\nHello`,
  );

  expect((await lydie(["doc", "props", idea.id, "--set", '{"status":"done"}'], env)).code).toBe(0);
  expect(readFileSync(join(env.vault, "Notes/Idea.md"), "utf8")).toBe(
    "---\nstatus: done\n---\nAn idea.\n",
  );

  // A string flag given as - is read from stdin.
  const written = await lydie(["doc", "write", idea.id, "--markdown", "-"], env, "New body.\n");
  expect(written.code).toBe(0);
  expect(readFileSync(join(env.vault, "Notes/Idea.md"), "utf8")).toBe(
    "---\nstatus: done\n---\nNew body.\n",
  );

  const renamed = await lydie(["doc", "rename", idea.id, "Big idea"], env);
  expect(renamed.code).toBe(0);
  expect(readFileSync(join(env.vault, "Home.md"), "utf8")).toBe("# Home\n\nSee [[Big idea]].\n");

  const search = await lydie(["search", "body"], env);
  expect(search.out).toContain("Big idea");

  const got = await lydie(["doc", "get", idea.id], env);
  expect(got.out).toBe(`# Big idea  ${idea.id}\nstatus: "done"\n\nNew body.\n`);

  // Each run is a session; one can be undone.
  const sessions = JSON.parse((await lydie(["history", "sessions", "--json"], env)).out)
    .sessions as {
    sessionId: string;
  }[];
  expect(sessions.length).toBe(4);
  expect((await lydie(["history", "undo", sessions[0]!.sessionId], env)).code).toBe(0);
  expect(readFileSync(join(env.vault, "Home.md"), "utf8")).toBe("# Home\n\nSee [[Idea]].\n");
});

test("errors exit 1 with the contract's error", async () => {
  const env = setup();
  const bad = await lydie(["doc", "get", "not-a-uuid"], env);
  expect(bad.code).toBe(1);
  expect(bad.err).toContain("error (invalid_input)");
  const unknown = await lydie(["doc", "explode"], env);
  expect(unknown.code).toBe(1);
  const flag = await lydie(["doc", "tree", "--nope", "1"], env);
  expect(flag.err).toContain("Unknown flag --nope");
});

test("lydie mcp --stdio serves the vault to an MCP client", async () => {
  const env = setup();
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      join(import.meta.dirname, "main.ts"),
      "mcp",
      "--stdio",
      "--vault",
      env.vault,
      "--db",
      env.db,
    ],
    env: { ...process.env, LYDIE_DATA_DIR: join(env.base, "data") } as Record<string, string>,
    stderr: "pipe",
  });
  const client = new Client({ name: "cli-test", version: "1.0.0" });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    expect(tools.some((t) => t.name === "create_doc")).toBe(true);
    const list = await client.callTool({
      name: "list_docs",
      arguments: { workspaceId: await workspaceOf(env.vault) },
    });
    const titles = (list.structuredContent as { entries: { title: string }[] }).entries.map(
      (e) => e.title,
    );
    expect(titles).toEqual(["Home", "Notes", "Idea"]);
  } finally {
    await client.close();
  }
}, 30_000);

async function workspaceOf(vault: string): Promise<string> {
  return JSON.parse(readFileSync(join(vault, ".lydie/workspace.json"), "utf8"))
    .workspaceId as string;
}
