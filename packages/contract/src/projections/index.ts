import type { Registry } from "../registry.ts";
import { toCliCommands } from "./cli.ts";
import { toMcpTools } from "./mcp.ts";
import { toOpenApi } from "./openapi.ts";

export { toCliCommand, toCliCommands } from "./cli.ts";
export type { CliCommand, CliOption, CliValueType } from "./cli.ts";
export {
  CONNECTION_DEFAULTS,
  DESCRIBE_OPERATION_TOOL,
  mcpInstructions,
  mcpOperations,
  RUN_OPERATION_TOOL,
  toMcpTool,
  toMcpTools,
  WHOAMI_TOOL,
} from "./mcp.ts";
export type { McpInstructionsOptions, McpTool, McpToolsOptions } from "./mcp.ts";
export {
  createMcpDispatcher,
  describeOperation,
  mcpErrorResult,
  mcpResult,
  unknownKey,
} from "./mcp-dispatch.ts";
export type {
  McpCallResult,
  McpConnection,
  McpDispatcher,
  McpDispatchOptions,
  McpResolved,
  McpWhoami,
  McpWorkspaceRef,
} from "./mcp-dispatch.ts";
export { toOpenApi } from "./openapi.ts";
export type { OpenApiDocument } from "./openapi.ts";
export { toJsonSchema } from "./json-schema.ts";
export type { JsonSchema } from "./json-schema.ts";

// File name (under `generated/`) → content. Used by `scripts/generate.ts` and the drift test.
export function generatedFiles(registry: Registry): Record<string, unknown> {
  return {
    "openapi.json": toOpenApi(registry),
    "mcp-tools.json": { tools: toMcpTools(registry) },
    "cli.json": { commands: toCliCommands(registry) },
  };
}
