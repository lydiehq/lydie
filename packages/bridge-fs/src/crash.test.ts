import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { TEMP_MARKER } from "./paths.ts";
import { cleanup, fixtureVault, openTestVault } from "./test-utils.ts";

afterEach(cleanup);

test("a crash between the temp write and the rename leaves the original intact", async () => {
  const folder = fixtureVault({ "Note.md": "original\n" });
  const result = spawnSync(
    process.execPath,
    [
      join(import.meta.dirname, "crash-writer.fixture.ts"),
      join(folder, "Note.md"),
      "replacement\n",
    ],
    { encoding: "utf8" },
  );
  expect(result.signal).toBe("SIGKILL");
  expect(readFileSync(join(folder, "Note.md"), "utf8")).toBe("original\n");
  const leftovers = readdirSync(folder).filter((n) => n.includes(TEMP_MARKER));
  expect(leftovers).toHaveLength(1);
  expect(readFileSync(join(folder, leftovers[0]!), "utf8")).toBe("replacement\n");

  // The leftover is hidden (never indexed) and removed when the vault opens.
  const vault = await openTestVault(folder);
  const tree = await vault.store.listTree(vault.workspaceId);
  expect(tree.map((t) => t.title)).toEqual(["Note"]);
  expect((await vault.store.getDoc(tree[0]!.id))?.body?.markdown).toBe("original\n");
  expect(readdirSync(folder).filter((n) => n.includes(TEMP_MARKER))).toEqual([]);
});
