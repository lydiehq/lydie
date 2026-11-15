// How to connect common MCP clients to the hosted MCP server. With a token the client sends it as
// a bearer token; with OAuth the client discovers the server's sign-in itself (no secret in the
// config).

export type McpAuth = { kind: "token"; token: string } | { kind: "oauth" };

export type McpSnippet = { id: string; client: string; where: string; text: string };

const json = (value: unknown) => JSON.stringify(value, null, 2);

export function mcpSnippets(url: string, auth: McpAuth): McpSnippet[] {
  const headers = auth.kind === "token" ? { Authorization: `Bearer ${auth.token}` } : undefined;
  return [
    {
      id: "claude-code",
      client: "Claude Code",
      where: "Run in a terminal",
      text:
        `claude mcp add --transport http lydie ${url}` +
        (headers ? ` --header "Authorization: ${headers.Authorization}"` : ""),
    },
    {
      id: "claude-desktop",
      client: "Claude Desktop",
      where: "claude_desktop_config.json",
      text: json({
        mcpServers: {
          lydie: {
            command: "npx",
            args: [
              "-y",
              "mcp-remote",
              url,
              ...(headers ? ["--header", `Authorization:${headers.Authorization}`] : []),
            ],
          },
        },
      }),
    },
    {
      id: "cursor",
      client: "Cursor",
      where: ".cursor/mcp.json",
      text: json({ mcpServers: { lydie: { url, ...(headers ? { headers } : {}) } } }),
    },
    {
      id: "vscode",
      client: "VS Code",
      where: ".vscode/mcp.json",
      text: json({ servers: { lydie: { type: "http", url, ...(headers ? { headers } : {}) } } }),
    },
  ];
}

export const TOKEN_PLACEHOLDER = "<your API token>";
