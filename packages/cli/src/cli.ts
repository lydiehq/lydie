// `lydie <noun> <verb> [args] [--flags]`: every contract operation with a CLI projection, run on a
// local folder through @lydie/bridge-fs, plus `lydie mcp` to serve the vault to agents.
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import {
  defaultDataDir,
  exportsTo,
  LOCAL_USER,
  openVault,
  runnableOperations,
} from "@lydie/bridge-fs";
import type { Vault } from "@lydie/bridge-fs";
import { isLydieError, toCliCommands } from "@lydie/contract";
import type { CliCommand, CliOption } from "@lydie/contract";
import {
  loadOrCreateToken,
  runStdio,
  startHttpMcp,
  tokenPathFor,
  vaultWorkspace,
} from "@lydie/mcp-local";

export type CliIo = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  stdin?: () => Promise<string>;
  env?: Record<string, string | undefined>;
  cwd?: string;
  // `lydie mcp` (HTTP) runs until this resolves. Default: SIGINT/SIGTERM.
  until?: Promise<void>;
};

type Parsed = {
  words: string[];
  flags: Map<string, string | true>;
};

const GLOBAL_FLAGS = new Set(["vault", "db", "json", "help", "version"]);

export function parseArgv(argv: readonly string[]): Parsed {
  const words: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--") {
      words.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq !== -1) {
        flags.set(arg.slice(2, eq), arg.slice(eq + 1));
        continue;
      }
      const name = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags.set(name, next);
        i++;
      } else {
        flags.set(name, true);
      }
    } else if (arg === "-h") {
      flags.set("help", true);
    } else {
      words.push(arg);
    }
  }
  return { words, flags };
}

// Boolean flags take no value (`--include-body`, `--include-body=false`, `--no-include-body`), so
// they must not swallow the next word. Which flags are boolean depends on the command.
function fixBooleans(argv: readonly string[], command: CliCommand): Parsed {
  const booleans = new Set(["json", "help", "stdio"]);
  for (const f of command.flags) {
    if (f.type === "boolean") booleans.add(f.name).add(`no-${f.name}`);
  }
  return parseArgv(
    argv.map((arg) =>
      arg.startsWith("--") && !arg.includes("=") && booleans.has(arg.slice(2))
        ? `${arg}=true`
        : arg,
    ),
  );
}

function findCommand(
  commands: CliCommand[],
  words: string[],
): { command: CliCommand; rest: string[] } | null {
  let best: { command: CliCommand; rest: string[] } | null = null;
  for (const command of commands) {
    const n = command.command.length;
    if (words.length >= n && command.command.every((w, i) => words[i] === w)) {
      if (!best || n > best.command.command.length) best = { command, rest: words.slice(n) };
    }
  }
  return best;
}

async function convert(option: CliOption, raw: string | true, io: CliIo): Promise<unknown> {
  if (option.type === "boolean") {
    if (raw === true || raw === "true") return true;
    if (raw === "false") return false;
    throw new Error(`--${option.name} is true or false`);
  }
  if (raw === true) throw new Error(`--${option.name} needs a value`);
  let value = raw;
  if (value === "-" && io.stdin) value = await io.stdin();
  if (option.nullable && value === "null") return null;
  switch (option.type) {
    case "number":
    case "integer": {
      const n = Number(value);
      if (!Number.isFinite(n) || (option.type === "integer" && !Number.isInteger(n))) {
        throw new Error(
          `--${option.name} must be ${option.type === "integer" ? "an integer" : "a number"}`,
        );
      }
      return n;
    }
    case "json":
      try {
        return JSON.parse(value) as unknown;
      } catch {
        throw new Error(`--${option.name} must be JSON, e.g. '{"key":"value"}' or '["a","b"]'`);
      }
    default:
      return value;
  }
}

// The input for an operation from positional words and flags. `workspaceId` defaults to the vault's.
export async function inputFor(
  command: CliCommand,
  positional: string[],
  flags: Map<string, string | true>,
  workspaceId: string,
  io: CliIo,
): Promise<Record<string, unknown>> {
  const input: Record<string, unknown> = {};
  let args = command.args;
  if (args[0]?.key === "workspaceId" && positional.length === args.length - 1) {
    input.workspaceId = workspaceId;
    args = args.slice(1);
  }
  if (positional.length > args.length) {
    throw new Error(`Too many arguments for "lydie ${command.command.join(" ")}"`);
  }
  for (let i = 0; i < positional.length; i++) {
    input[args[i]!.key] = await convert(args[i]!, positional[i]!, io);
  }
  for (const [name, raw] of flags) {
    if (GLOBAL_FLAGS.has(name)) continue;
    const negated = name.startsWith("no-")
      ? command.flags.find((f) => f.name === name.slice(3))
      : undefined;
    if (negated?.type === "boolean") {
      input[negated.key] = false;
      continue;
    }
    const option =
      command.flags.find((f) => f.name === name) ?? command.args.find((a) => a.name === name);
    if (!option) throw new Error(`Unknown flag --${name} for "lydie ${command.command.join(" ")}"`);
    input[option.key] = await convert(option, raw, io);
  }
  const needsWorkspace =
    command.args.some((a) => a.key === "workspaceId") ||
    command.flags.some((f) => f.key === "workspaceId");
  if (needsWorkspace && input.workspaceId === undefined) input.workspaceId = workspaceId;
  return input;
}

export function resolveVault(flags: Map<string, string | true>, io: CliIo): string | null {
  const flag = flags.get("vault");
  if (typeof flag === "string") return resolve(io.cwd ?? process.cwd(), flag);
  const env = io.env?.LYDIE_VAULT;
  if (env) return resolve(env);
  const cwd = io.cwd ?? process.cwd();
  if (existsSync(join(cwd, ".lydie")) || existsSync(join(cwd, ".obsidian"))) return cwd;
  return null;
}

function helpText(commands: CliCommand[]): string {
  const width = Math.max(...commands.map((c) => usage(c).length));
  const lines = commands.map((c) => `  ${usage(c).padEnd(width)}  ${c.summary}`).sort();
  return [
    "Usage: lydie <command> [args] [--flags] [--vault <folder>] [--json]",
    "",
    "Commands (every operation of the Lydie contract):",
    ...lines,
    `  ${"mcp [--stdio] [--port <n>]".padEnd(width)}  Serve the vault to agents over MCP`,
    "",
    "Global flags:",
    "  --vault <folder>   The folder to work on (default: $LYDIE_VAULT, or the current folder if",
    "                     it has .lydie/ or .obsidian/)",
    "  --db <file>        Database file (default: a per-user cache, outside the folder)",
    "  --json             Print results as JSON",
    "  --help             Help for a command: lydie <command> --help",
    "",
    "workspaceId arguments default to the vault's workspace. A string flag given as - is read from",
    "stdin, e.g. lydie doc write <id> --markdown - < note.md",
  ].join("\n");
}

function usage(c: CliCommand): string {
  const args = c.args.map((a) => (a.key === "workspaceId" ? `[${a.name}]` : `<${a.name}>`));
  return [...c.command, ...args].join(" ");
}

function commandHelp(c: CliCommand): string {
  const lines = [
    `Usage: lydie ${usage(c)} [--flags]`,
    "",
    c.summary + (c.description ? `\n\n${c.description}` : ""),
  ];
  if (c.flags.length) {
    lines.push("", "Flags:");
    for (const f of c.flags) {
      const type = f.type === "boolean" ? "" : ` <${f.type}${f.nullable ? "|null" : ""}>`;
      const extra = [
        f.required ? "required" : null,
        f.default !== undefined ? `default ${JSON.stringify(f.default)}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      lines.push(
        `  --${f.name}${type}${f.description ? `  ${f.description}` : ""}${extra ? ` (${extra})` : ""}`,
      );
    }
  }
  if (c.destructive) lines.push("", "This operation is destructive.");
  return lines.join("\n");
}

// Human-readable output for the common result shapes; anything else is pretty JSON.
export function format(result: unknown): string {
  const r = result as Record<string, unknown> | null;
  if (
    r &&
    Array.isArray(r.entries) &&
    r.entries.every((e) => typeof (e as { title?: unknown }).title === "string")
  ) {
    return (r.entries as { title: string; id: string; depth?: number; deletedAt?: string | null }[])
      .map(
        (e) =>
          `${"  ".repeat(e.depth ?? 0)}${e.title}  ${e.id}${e.deletedAt ? "  (in trash)" : ""}`,
      )
      .join("\n");
  }
  if (r && Array.isArray(r.hits)) {
    return (r.hits as { title: string; id: string; snippet: string }[])
      .map((h) => `${h.title}  ${h.id}\n  ${h.snippet.replace(/<\/?mark>/g, "")}`)
      .join("\n");
  }
  if (r && "document" in r && "body" in r) {
    const doc = r.document as { title: string; id: string; properties: Record<string, unknown> };
    const body = r.body as { markdown: string } | null;
    const props = Object.entries(doc.properties).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
    return [`# ${doc.title}  ${doc.id}`, ...props, "", body?.markdown ?? "(no body)"].join("\n");
  }
  return JSON.stringify(result, null, 2);
}

export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  const commands = toCliCommands(runnableOperations());
  const first = parseArgv(
    argv.map((arg) =>
      ["--json", "--help", "--stdio", "--version"].includes(arg) ? `${arg}=true` : arg,
    ),
  );
  if (first.flags.has("version")) {
    io.stdout("lydie 0.0.0");
    return 0;
  }
  if (first.words.length === 0 || (first.words[0] === "help" && first.words.length === 1)) {
    io.stdout(helpText(commands));
    return first.words.length === 0 && !first.flags.has("help") ? 1 : 0;
  }
  if (first.words[0] === "mcp") return runMcp(first, io);

  const found = findCommand(commands, first.words);
  if (!found) {
    io.stderr(`Unknown command "lydie ${first.words.join(" ")}". Run lydie --help.`);
    return 1;
  }
  const { command } = found;
  const parsed = fixBooleans(argv, command);
  const positional = parsed.words.slice(command.command.length);
  if (parsed.flags.has("help")) {
    io.stdout(commandHelp(command));
    return 0;
  }
  const folder = resolveVault(parsed.flags, io);
  if (!folder) {
    io.stderr("No vault: pass --vault <folder> or set LYDIE_VAULT.");
    return 1;
  }
  const json = parsed.flags.get("json") === "true";
  let vault: Vault | null = null;
  try {
    vault = await openCliVault(folder, parsed.flags);
    const input = await inputFor(command, positional, parsed.flags, vault.workspaceId, io);
    const result = await vault.runtime.execute(command.operation as never, input as never, {
      actor: LOCAL_USER,
      // One CLI run is one session: `lydie history undo <session>` reverts it.
      sessionId: `cli-${randomUUID()}`,
    });
    await vault.bridge.idle();
    io.stdout(json ? JSON.stringify(result, null, 2) : format(result));
    return 0;
  } catch (error) {
    report(error, json, io);
    return 1;
  } finally {
    await vault?.close();
  }
}

function report(error: unknown, json: boolean, io: CliIo): void {
  if (isLydieError(error)) {
    if (json) {
      io.stderr(
        JSON.stringify(
          { error: { code: error.code, message: error.message, hint: error.hint } },
          null,
          2,
        ),
      );
    } else {
      io.stderr(
        `error (${error.code}): ${error.message}${error.hint ? `\nhint: ${error.hint}` : ""}`,
      );
    }
    return;
  }
  io.stderr(`error: ${error instanceof Error ? error.message : String(error)}`);
}

function openCliVault(folder: string, flags: Map<string, string | true>): Promise<Vault> {
  const db = flags.get("db");
  return openVault({
    folder,
    watch: false,
    // `lydie workspace export` writes the zip into the current directory.
    exports: exportsTo(process.cwd(), basename(folder)),
    ...(typeof db === "string" ? { databasePath: resolve(db) } : {}),
  });
}

async function runMcp(parsed: Parsed, io: CliIo): Promise<number> {
  if (parsed.flags.has("help")) {
    io.stdout(
      [
        "Usage: lydie mcp --vault <folder> [--stdio] [--port <n>] [--allow-origin <origin>]",
        "",
        "Serves the vault's operations as MCP tools. Default: Streamable HTTP on 127.0.0.1 with a",
        "bearer token (printed on start, stored in the user's data folder). --stdio: one session on",
        "stdin/stdout, for clients that launch the server themselves.",
      ].join("\n"),
    );
    return 0;
  }
  const folder = resolveVault(parsed.flags, io);
  if (!folder) {
    io.stderr("No vault: pass --vault <folder> or set LYDIE_VAULT.");
    return 1;
  }
  // A long-running server watches the folder for changes by other programs.
  const db = parsed.flags.get("db");
  const vault = await openVault({
    folder,
    ...(typeof db === "string" ? { databasePath: resolve(db) } : {}),
  });
  try {
    if (parsed.flags.has("stdio")) {
      await runStdio(vault.runtime, `mcp-${randomUUID()}`, { workspace: vaultWorkspace(vault) });
      return 0;
    }
    const port = parsed.flags.get("port");
    const origin = parsed.flags.get("allow-origin");
    const tokenPath = tokenPathFor(realpathSync(folder), defaultDataDir());
    const server = await startHttpMcp({
      runtime: vault.runtime,
      workspace: vaultWorkspace(vault),
      token: await loadOrCreateToken(tokenPath),
      ...(typeof port === "string" ? { port: Number(port) } : {}),
      ...(typeof origin === "string" ? { allowedOrigins: [origin] } : {}),
    });
    io.stderr(
      [
        `Lydie MCP server for ${vault.folder}`,
        `  url:   ${server.url}`,
        `  token: ${readFileSync(tokenPath, "utf8").trim()}  (${tokenPath})`,
        `  header: Authorization: Bearer <token>`,
      ].join("\n"),
    );
    await (io.until ??
      new Promise<void>((done) => {
        process.once("SIGINT", done);
        process.once("SIGTERM", done);
      }));
    await server.close();
    return 0;
  } finally {
    await vault.close();
  }
}
