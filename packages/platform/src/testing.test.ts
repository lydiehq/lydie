import { describe, expect, it } from "bun:test";

import { createTestPlatform } from "./testing.ts";
import type { FileChange } from "./types.ts";

describe("createTestPlatform", () => {
  it("has no files outside a local scope", () => {
    expect(createTestPlatform().files).toBeNull();
  });

  it("behaves like a folder", async () => {
    const platform = createTestPlatform({ files: { "notes/a.md": "# A" } });
    const files = platform.files!;
    expect(await files.readText("notes/a.md")).toBe("# A");
    expect((await files.list()).map((entry) => entry.path)).toEqual(["notes"]);
    expect((await files.list("", { recursive: true })).map((entry) => entry.path)).toEqual([
      "notes",
      "notes/a.md",
    ]);

    const written = await files.writeText("deep/new/b.md", "b");
    expect(written.kind).toBe("file");
    await expect(files.writeText("b.md", "x", { expectedMtime: 1 })).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(files.readText("../escape")).rejects.toMatchObject({ code: "invalid-path" });
    await expect(files.delete("deep")).rejects.toMatchObject({ code: "not-empty" });
    await files.rename("deep", "moved");
    expect(await files.readText("moved/new/b.md")).toBe("b");
    await files.delete("moved", { recursive: true });
    expect(await files.stat("moved")).toBeNull();
  });

  it("reports own and external changes in batches", async () => {
    const platform = createTestPlatform({ files: {} });
    const batches: FileChange[][] = [];
    platform.files!.watch((batch) => batches.push(batch));
    // Both happen before the batch is delivered on the next microtask.
    void platform.files!.writeText("a.md", "1");
    platform.test.external.write("a.md", "2");
    await platform.test.flush();
    expect(batches).toEqual([
      [
        { type: "create", path: "a.md" },
        { type: "update", path: "a.md" },
      ],
    ]);
  });

  it("records shell interactions", async () => {
    const platform = createTestPlatform();
    platform.test.deepLink("lydie://open?doc=1");
    const links: string[] = [];
    platform.deepLinks.onOpen((url) => links.push(url));
    expect(links).toEqual(["lydie://open?doc=1"]);

    platform.test.dialogAnswers = [true];
    expect(await platform.dialogs.confirm({ message: "Sure?" })).toBe(true);

    await platform.openExternal("https://example.com");
    expect(platform.test.openedExternal).toEqual(["https://example.com"]);
    expect(Object.isFrozen(platform.scope)).toBe(true);
  });
});
