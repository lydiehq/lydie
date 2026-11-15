// The local MCP server: every contract operation with an MCP projection becomes a tool, run through
// the vault's runtime as an agent actor with the MCP session as its session, so a session's changes
// can be listed (`list_session_changes`) and reverted together (`undo_session`).
import { createMcpDispatcher, mcpInstructions, mcpOperations, toMcpTools } from "@lydie/contract";
import type { Actor, AnyOperation, McpWorkspaceRef, Registry } from "@lydie/contract";
import type { Runtime } from "@lydie/runtime";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export const SERVER_NAME = "lydie";

export type ToolSession = {
  sessionId: string;
  // Who the user is (the agent acts on their behalf). Default "local".
  onBehalfOf?: string;
  // The vault's workspace: tools default to it, and other workspace ids are not found.
  workspace?: McpWorkspaceRef;
};

// Builds the actor for a session from the client's name ("claude-code", "cursor", …).
export function agentActor(clientName: string | undefined, session: ToolSession): Actor {
  const clean = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 64) || "mcp";
  return {
    type: "agent",
    app: clean(clientName ?? "mcp"),
    id: clean(session.sessionId),
    onBehalfOf: session.onBehalfOf ?? "local",
  };
}

// The tools of a registry (the agent set plus run_operation/describe_operation), the operation
// behind each listed tool name, and every operation an MCP client may run by id.
export function toolsOf(registry: Registry) {
  const tools = toMcpTools(registry);
  const listed = new Set(tools.map((t) => t.name));
  const byName = new Map<string, AnyOperation>();
  const byId = new Map<string, AnyOperation>();
  for (const op of mcpOperations(registry)) {
    byId.set(op.id, op);
    if (listed.has(op.mcp!.name)) byName.set(op.mcp!.name, op);
  }
  return { tools, byName, byId };
}

// One MCP server (one session). Connect it to a transport (stdio, Streamable HTTP).
export function createMcpServer(runtime: Runtime, session: ToolSession, version = "0.0.0"): Server {
  // The local user runs this server: unexpected errors show their message.
  const dispatcher = createMcpDispatcher(runtime.registry, { internalErrors: "expose" });
  const { workspace } = session;
  const server = new Server(
    { name: SERVER_NAME, version },
    {
      capabilities: { tools: {} },
      instructions: mcpInstructions({ mode: "local", workspace: workspace ?? null }),
    },
  );
  const actor = () => agentActor(server.getClientVersion()?.name, session);

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: dispatcher.tools }));
  server.setRequestHandler(CallToolRequestSchema, (request) =>
    dispatcher.call(
      request.params.name,
      request.params.arguments,
      (op, input) =>
        runtime.execute(op.id as never, input as never, {
          actor: actor(),
          sessionId: session.sessionId,
        }),
      {
        // A getter: an HTTP session learns its id after the server is created.
        get sessionId() {
          return session.sessionId;
        },
        ...(workspace ? { workspaceId: workspace.id, workspaces: [workspace.id] } : {}),
        whoami: () => ({
          actor: actor(),
          user: { id: session.onBehalfOf ?? "local", name: null, email: null },
          workspace: workspace ?? null,
          workspaces: workspace ? [workspace] : [],
          teamspaces: [],
          sessionId: session.sessionId,
        }),
      },
    ),
  );
  return server;
}
