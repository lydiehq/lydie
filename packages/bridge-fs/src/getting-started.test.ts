// LYD-313: the Getting started page in a folder. It is written only into an empty folder opened
// for the first time, never into a folder that already has notes (or an Obsidian vault).
import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { gettingStarted, gettingStartedId } from "@lydie/contract";
import type { StarterNode } from "@lydie/contract";
import { extract, parse, serialize } from "@lydie/markdown";

import { cleanup, fixtureVault, openTestVault, snapshot, tempDir } from "./test-utils.ts";

afterEach(cleanup);

function pages(node: StarterNode): { title: string; markdown: string }[] {
  if (node.kind === "database") return [];
  return [node, ...(node.children ?? []).flatMap(pages)];
}

describe("Getting started content", () => {
  for (const mode of ["browser", "folder", "hosted"] as const) {
    it(`parses as Lydie Markdown and round-trips (${mode})`, () => {
      for (const page of pages(gettingStarted({ mode, today: "2026-11-15" }))) {
        const parsed = parse(page.markdown);
        expect(parsed.fallbacks).toEqual([]);
        expect(parse(serialize(parsed.doc)).doc.eq(parsed.doc)).toBe(true);
      }
    });
  }

  it("teaches with to-dos, links and an embedded database", () => {
    const root = gettingStarted({ mode: "folder", today: "2026-11-15" });
    const doc = parse(root.markdown).doc;
    let tasks = 0;
    doc.descendants((node) => {
      if (node.type.name === "taskItem") tasks++;
    });
    expect(tasks).toBeGreaterThanOrEqual(10);
    const targets = extract(root.markdown).links.map((l) => `${l.kind}:${l.target}`);
    expect(targets).toContain("wikilink:Links and backlinks");
    expect(targets).toContain("embed:Reading list.base");
  });
});

describe("openVault({ gettingStarted })", () => {
  it("writes the page into a new, empty folder, once", async () => {
    const folder = tempDir();
    const databasePath = join(tempDir("lydie-db-"), "workspace.sqlite");
    const vault = await openTestVault(folder, { gettingStarted: true, databasePath });
    expect(vault.gettingStartedId).toBe(gettingStartedId(vault.workspaceId));
    await vault.bridge.idle();
    const files = Object.keys(snapshot(folder)).sort();
    expect(files).toContain("Getting started.md");
    expect(files).toContain("Getting started/Links and backlinks.md");
    expect(files).toContain("Getting started/Reading list/Reading list.base");
    expect(files).toContain("Getting started/Reading list/Thinking in Systems.md");
    const page = readFileSync(join(folder, "Getting started.md"), "utf8");
    // Its icon is frontmatter, beside the id the bridge keeps there.
    expect(page).toMatch(/^---\n(?:[^\n]*\n)*?icon: 👋\n(?:[^\n]*\n)*?---\n/);
    expect(page).toContain("- [ ] Type `/` on an empty line");
    expect(page).toContain("![[Reading list.base]]");
    await vault.close();

    // Opening it again, with or without the page, never writes it a second time.
    const again = await openTestVault(folder, { gettingStarted: true, databasePath });
    expect(again.gettingStartedId).toBeNull();
    expect(Object.keys(snapshot(folder)).sort()).toEqual(files);
  });

  it("never writes into a folder that has notes", async () => {
    const folder = fixtureVault({ "Ideas.md": "# Ideas\n" });
    const vault = await openTestVault(folder, { gettingStarted: true });
    expect(vault.gettingStartedId).toBeNull();
    expect(snapshot(folder)).toEqual({ "Ideas.md": "# Ideas\n" });
  });

  it("never writes into an empty Obsidian vault", async () => {
    const folder = fixtureVault({ ".obsidian/app.json": "{}" });
    const vault = await openTestVault(folder, { gettingStarted: true });
    expect(vault.gettingStartedId).toBeNull();
    expect(existsSync(join(folder, "Getting started.md"))).toBe(false);
  });

  it("treats a folder with only system files as empty", async () => {
    const folder = fixtureVault({ ".DS_Store": "" });
    const vault = await openTestVault(folder, { gettingStarted: true });
    expect(vault.gettingStartedId).not.toBeNull();
  });

  it("is off unless asked for (CLI, MCP)", async () => {
    const folder = tempDir();
    const vault = await openTestVault(folder);
    expect(vault.gettingStartedId).toBeNull();
    expect(snapshot(folder)).toEqual({});
  });
});
