# AGENTS.md - @lydie/mcp-local

The local MCP server: the contract's MCP tools (`toMcpTools`: the operations that are tools, same
names and schemas as hosted mode), executed through a vault's runtime (`@lydie/bridge-fs`), so every
write lands in the folder with no server. Node only. Licence: AGPL-3.0-only.

## May depend on

`@lydie/contract`, `@lydie/runtime`, `@lydie/store`, `@lydie/bridge-fs`. `client/scripts/check-boundaries.ts`
is authoritative. External: `@modelcontextprotocol/sdk` (low-level `Server`, no zod tool schemas: the
JSON schemas come from the contract).

## Public API (`src/index.ts`)

```ts
createMcpServer(runtime, { sessionId, onBehalfOf?, workspace? }): Server   // one MCP session
// workspace: { id, name } of the vault; tools default to it, whoami and the instructions name it
agentActor(clientName, session): Actor   // { type: "agent", app: <client name>, id: <session>, onBehalfOf }
startHttpMcp({ runtime, token, port? (0 = free), allowedOrigins?, onBehalfOf?, workspace? })
  : Promise<{ url, port, sessions(), close() }>               // Streamable HTTP on 127.0.0.1, path /mcp
createMcpControl(vault, { dataDir, port?, allowedOrigins? })   // the desktop toggle (McpControl of bridge-fs)
  : { status(), setEnabled(bool), subscribe(fn), token(), close() }
runStdio(runtime, sessionId?, { workspace? }?)                 // one session on stdin/stdout
vaultWorkspace(vault) → { id: vault.workspaceId, name: <folder name> }
tokenPathFor(folder, dataDir), loadOrCreateToken(path)
```

The SDK and the HTTP server (`http.ts`, `server.ts`) load on first use (`setEnabled(true)`,
`runStdio`): `control.ts` imports them dynamically and the package is `"sideEffects": false`, so a
process that creates controls (the desktop app, one per folder) does not evaluate the SDK at start.

## Rules

- **Sessions and actors.** Each MCP session (HTTP: the transport's `Mcp-Session-Id`; stdio: one per
  process) is a history session; every call runs as `agent(app = client name, id = session id,
  onBehalfOf = "local")`, so the session's changes are listed with `list_session_changes` and
  reverted with `undo_session`, and never land on the user's Cmd+Z stack.
- **HTTP security.** Bound to 127.0.0.1 only. Every request needs `Authorization: Bearer <token>`
  (401 otherwise); a request with an `Origin` not in `allowedOrigins` gets 403 (MCP spec, DNS
  rebinding); the `Host` must be `127.0.0.1:<port>` or `localhost:<port>`.
- **Token.** 32 random bytes (base64url), created on first start, stored with mode 0600 in
  `<dataDir>/mcp/<hash of the folder path>.token`: the user's data folder, not the vault, because
  `.lydie/` is meant to be synced.
- **Errors** are tool results with `isError: true` and the contract's `{ error: { code, message,
  hint?, details? } }` envelope as text. Results carry `structuredContent` matching `outputSchema`.
- The tool list is the runtime's registry (`runnableOperations()`), so it follows the contract.

## Dispatch

`createMcpServer` uses the contract's `createMcpDispatcher` (with `internalErrors: "expose"`) for
tools/list and tools/call, passing the connection (the vault's workspace, the session, `whoami`),
and sends the contract's `mcpInstructions`. Every Lydie MCP server shares them, so change behaviour
there.

## Size

The server lists `whoami` and the contract's 31 tools, about 50 KB. MCP tools are chosen per
operation (`mcp: { name, title }` or `mcp: { none: reason }`, LYD-443): no generic tools, every
tool reads or writes. Output schemas are opt-in per operation (`mcp.outputSchema: true`). Before
LYD-200 every operation was a tool: ~294 KB / 59 tools. The contract test "keeps the agent tool
list small" caps the list at 55 KB.

## Tests

`bun --filter=@lydie/mcp-local run test`: the official SDK client over Streamable HTTP lists tools
(equal to `toMcpTools`), runs a create/update/undo-session round trip and checks the files, checks
401/403, and stopping. The stdio mode is tested through the CLI (`lydie mcp --stdio`).
