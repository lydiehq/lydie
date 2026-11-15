import { describe, expect, it } from "bun:test";

import { Uuid } from "./entities.ts";
import { gettingStarted, gettingStartedId, starterId } from "./getting-started.ts";
import type { GettingStartedMode, StarterNode } from "./getting-started.ts";
import { uuidFromUlid } from "./ids.ts";

const MODES: GettingStartedMode[] = ["browser", "folder", "hosted", "try"];

function texts(node: StarterNode): string[] {
  if (node.kind === "database") return [node.title, ...node.rows.map((r) => r.title)];
  return [node.title, node.markdown, ...(node.children ?? []).flatMap(texts)];
}

describe("Getting started content (LYD-313)", () => {
  it("derives stable, valid ids per workspace and key", () => {
    const id = gettingStartedId("01JWORKSPACE0000000000000A");
    expect(Uuid.safeParse(id).success).toBe(true);
    expect(gettingStartedId("01JWORKSPACE0000000000000A")).toBe(id);
    expect(gettingStartedId("01JWORKSPACE0000000000000B")).not.toBe(id);
    expect(starterId("01JWORKSPACE0000000000000A", "links")).not.toBe(id);
    // A workspace whose id was rewritten as a UUID keeps its pages' ids.
    const ulid = "01M7BKKHMJ4BTYPD7RDDJ7WVMX";
    expect(gettingStartedId(uuidFromUlid(ulid))).toBe(gettingStartedId(ulid));
    for (const ws of ["bench", "x", "a".repeat(64)]) {
      expect(Uuid.safeParse(gettingStartedId(ws)).success).toBe(true);
    }
  });

  it("keeps a calm tone: no exclamation marks, no shouting", () => {
    for (const mode of MODES) {
      for (const text of texts(gettingStarted({ mode, today: "2026-11-15" }))) {
        // `![[…]]` is an embed, not an exclamation.
        expect(text.replace(/!\[\[/g, "[[")).not.toContain("!");
        expect(text).not.toMatch(/\b[A-Z]{4,}\b/);
      }
    }
  });

  it("tells each kind of workspace how an assistant connects", () => {
    const hosted = gettingStarted({
      mode: "hosted",
      mcpUrl: "https://x.test/mcp",
      today: "2026-11-15",
    });
    expect(hosted.markdown).toContain("`https://x.test/mcp`");
    expect(hosted.markdown).toContain("claude mcp add --transport http lydie https://x.test/mcp");
    const folder = gettingStarted({ mode: "folder", today: "2026-11-15" });
    expect(folder.markdown).toContain("**On this computer**");
    const browser = gettingStarted({ mode: "browser", today: "2026-11-15" });
    expect(browser.markdown).toContain(
      "Nothing is sent anywhere until you move them to Lydie Cloud.",
    );
    expect(browser.markdown).toContain("**Move to cloud…**");
    const tryout = gettingStarted({ mode: "try", today: "2026-11-15" });
    expect(tryout.markdown).toContain("nothing you write here is kept");
    expect(tryout.markdown).not.toContain("**Move to cloud…**");
  });
});
