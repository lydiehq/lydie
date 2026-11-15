import { expect, test } from "bun:test";

import { mcpSnippets } from "./mcp-snippets.ts";

const URL = "https://api.lydie.test/mcp";

test("token snippets carry the bearer token for every client", () => {
  const snippets = mcpSnippets(URL, { kind: "token", token: "lyd_pat_x" });
  expect(snippets.map((s) => s.id)).toEqual(["claude-code", "claude-desktop", "cursor", "vscode"]);
  for (const s of snippets) {
    expect(s.text).toContain(URL);
    expect(s.text).toContain("Bearer lyd_pat_x");
  }
  const cursor = JSON.parse(snippets.find((s) => s.id === "cursor")!.text);
  expect(cursor).toEqual({
    mcpServers: { lydie: { url: URL, headers: { Authorization: "Bearer lyd_pat_x" } } },
  });
  expect(snippets[0]!.text).toBe(
    `claude mcp add --transport http lydie ${URL} --header "Authorization: Bearer lyd_pat_x"`,
  );
});

test("OAuth snippets hold no secret", () => {
  for (const s of mcpSnippets(URL, { kind: "oauth" })) {
    expect(s.text).toContain(URL);
    expect(s.text).not.toContain("Authorization");
  }
  const vscode = JSON.parse(
    mcpSnippets(URL, { kind: "oauth" }).find((s) => s.id === "vscode")!.text,
  );
  expect(vscode).toEqual({ servers: { lydie: { type: "http", url: URL } } });
});
