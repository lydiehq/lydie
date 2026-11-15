import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openVault } from "@lydie/bridge-fs";

import { seedDemo } from "./demo.ts";

const dirs: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "lydie-demo-test-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// Keeps the demo valid as the contract changes, and checks that every link in it resolves.
test("the demo workspace seeds into a folder", async () => {
  const folder = tempDir();
  const vault = await openVault({ folder, dataDir: tempDir(), watch: false });
  try {
    const result = await seedDemo(vault.runtime.ops, {
      workspaceId: vault.workspaceId,
      today: "2026-03-10",
    });
    await vault.bridge.idle();
    expect(result.databases).toBe(5);
    expect(result.documents).toBeGreaterThan(80);

    const { links } = await vault.runtime.ops.doc.unresolvedLinks({
      workspaceId: vault.workspaceId,
    });
    expect(links).toEqual([]);
    expect(existsSync(join(folder, "Tasks", "Tasks.base"))).toBe(true);
    expect(existsSync(join(folder, "Daily notes", "2026-03-10.md"))).toBe(true);
    // The two-way relation reached the project's file.
    expect(readFileSync(join(folder, "Projects", "Kitchen renovation.md"), "utf8")).toContain(
      '"[[Tasks/Book the skip]]"',
    );
  } finally {
    await vault.close();
  }
});
