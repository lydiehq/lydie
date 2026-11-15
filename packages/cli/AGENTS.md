# AGENTS.md - @lydie/cli

The `lydie` command: `lydie <noun> <verb> [args] [--flags]` for every contract operation with a CLI
projection (`toCliCommands`), run on a local folder through `@lydie/bridge-fs`, plus `lydie mcp`.
Runs under Bun (`src/main.ts`, `bin: lydie`). Licence: AGPL-3.0-only.

## May depend on

`@lydie/contract`, `@lydie/runtime`, `@lydie/store`, `@lydie/bridge-fs`, `@lydie/mcp-local` (for
`lydie mcp`). `client/scripts/check-boundaries.ts` is authoritative.

## Usage

```bash
lydie --help                                   # every command, generated from the registry
lydie doc tree --vault ~/Notes                 # workspaceId arguments default to the vault's
lydie doc create "Title" --markdown "Hi" --properties '{"status":"draft"}' --json
lydie doc write <id> --markdown - < note.md    # a string flag given as - is read from stdin
lydie doc props <id> --set '{"status":"done"}' --unset '["tags"]'
lydie search "query"
lydie history sessions                         # each CLI run is one session
lydie history undo <sessionId>
lydie mcp --vault ~/Notes [--port 4711] [--allow-origin http://localhost:6274]   # Streamable HTTP
lydie mcp --vault ~/Notes --stdio              # for clients that launch the server
```

- Vault: `--vault`, else `$LYDIE_VAULT`, else the current folder if it has `.lydie/` or `.obsidian/`.
- Database: `--db <file>`, else `<defaultDataDir()>/workspaces/<hash>.sqlite` (`$LYDIE_DATA_DIR`
  overrides the data folder). It is separate from the desktop app's database; both see each
  other's writes as changes to the folder.
- Values: positional args per the command's `args`; flags are `--kebab-case`; JSON values for
  objects and lists; `null` for nullable fields; booleans as `--flag`, `--flag=false`, `--no-flag`.
- Output: human-readable for trees, search hits and documents, pretty JSON otherwise; `--json`
  always prints the operation's output. Errors go to stderr with the contract's code; exit code 1.
- One-shot commands open the vault without a watcher (incremental index), run, wait for the files
  to land, and close. `lydie mcp` watches the folder while it runs.

## Tests

`bun --filter=@lydie/cli run test`: help lists every command; commands change files (create,
props, write from stdin, rename with link rewriting, search, get, session undo); errors; and
`lydie mcp --stdio` driven by the SDK's stdio client.
