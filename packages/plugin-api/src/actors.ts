// How an agent is named in the UI: its MCP client name ("claude-code") the way people know it.
// The activity log and comments say the same.

const APP_NAMES: Record<string, string> = {
  "claude-code": "Claude Code",
  "claude-ai": "Claude",
  claude: "Claude",
  "claude-desktop": "Claude",
  cursor: "Cursor",
  "cursor-vscode": "Cursor",
  codex: "Codex",
  "codex-mcp-client": "Codex",
  vscode: "VS Code",
  "visual-studio-code": "VS Code",
  windsurf: "Windsurf",
  zed: "Zed",
  chatgpt: "ChatGPT",
  "gemini-cli": "Gemini CLI",
  opencode: "OpenCode",
  mcp: "An agent",
  // A personal API token (the hosted API's agent for token calls).
  "api-token": "API token",
};

export function appName(app: string): string {
  const known = APP_NAMES[app.toLowerCase()];
  if (known) return known;
  const words = app.split(/[-_.\s]+/).filter(Boolean);
  if (words.length === 0) return "An agent";
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
