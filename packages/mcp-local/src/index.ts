// @lydie/mcp-local: the contract's operations as MCP tools over a local vault. See AGENTS.md.
export { agentActor, createMcpServer, SERVER_NAME } from "./server.ts";
export type { ToolSession } from "./server.ts";
export { startHttpMcp } from "./http.ts";
export type { HttpMcpOptions, HttpMcpServer } from "./http.ts";
export {
  createMcpControl,
  loadOrCreateToken,
  runStdio,
  tokenPathFor,
  vaultWorkspace,
} from "./control.ts";
export type { McpControlOptions } from "./control.ts";
