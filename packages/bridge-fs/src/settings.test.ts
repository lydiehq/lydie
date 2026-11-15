// Folder settings (LYD-265): stored in .lydie/workspace.json, validated, applied and emitted.
import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { serveVault } from "./serve.ts";
import { checkPatch, DEFAULT_SETTINGS, SettingsError } from "./settings.ts";
import type { FolderSettings } from "./settings.ts";
import { cleanup, fixtureVault, openTestVault } from "./test-utils.ts";

afterEach(cleanup);

const stored = (folder: string) =>
  JSON.parse(readFileSync(join(folder, ".lydie", "workspace.json"), "utf8")) as Record<
    string,
    unknown
  >;

describe("folder settings", () => {
  it("default to Lydie's, then the folder's Obsidian settings, then what is stored", async () => {
    const plain = await openTestVault(fixtureVault({ "A.md": "a" }));
    expect(plain.settings()).toEqual(DEFAULT_SETTINGS);

    const folder = fixtureVault({
      "A.md": "a",
      ".obsidian/app.json": JSON.stringify({
        attachmentFolderPath: "Files",
        newFileLocation: "folder",
        newFileFolderPath: "Inbox",
        newLinkFormat: "relative",
        useMarkdownLinks: true,
      }),
    });
    const vault = await openTestVault(folder);
    expect(vault.settings()).toEqual({
      attachmentsFolder: "Files",
      exclude: [],
      newNoteLocation: "folder",
      newNoteFolder: "Inbox",
      linkFormat: "markdown",
      linkPath: "relative",
      versionHistory: "snapshots",
    });
    // Stored values win; null goes back to the default.
    await vault.setSettings({
      linkPath: "absolute",
      linkFormat: "wiki",
      newNoteFolder: "/Meta/",
    });
    expect(vault.settings()).toMatchObject({
      linkPath: "absolute",
      linkFormat: "wiki",
      newNoteFolder: "Meta",
    });
    expect(vault.bridge.linkFormat).toBe("wiki");
    await vault.setSettings({ linkPath: null, linkFormat: null });
    expect(vault.settings()).toMatchObject({ linkPath: "relative", linkFormat: "markdown" });
    expect(vault.bridge.linkFormat).toBe("markdown");
    expect(stored(folder)).toMatchObject({ newNoteFolder: "Meta" });
    expect(stored(folder)).not.toHaveProperty("linkPath");
    // Lydie never writes .obsidian/.
    expect(readFileSync(join(folder, ".obsidian", "app.json"), "utf8")).toContain("relative");
  });

  it("validates every field", async () => {
    const bad: [unknown, string][] = [
      [{ nope: 1 }, "nope"],
      [{ attachmentsFolder: "../x" }, "attachmentsFolder"],
      [{ newNoteFolder: "" }, "newNoteFolder"],
      [{ newNoteFolder: ".lydie/x" }, "newNoteFolder"],
      [{ newNoteFolder: "a\\b" }, "newNoteFolder"],
      [{ exclude: "*.tmp" }, "exclude"],
      [{ exclude: [1] }, "exclude[0]"],
      [{ linkFormat: "wikilink" }, "linkFormat"],
      [{ linkPath: "short" }, "linkPath"],
      [{ newNoteLocation: "desktop" }, "newNoteLocation"],
      [null, "settings"],
    ];
    for (const [patch, field] of bad) {
      let error: unknown;
      try {
        checkPatch(patch);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(SettingsError);
      expect((error as SettingsError).field).toBe(field);
    }
    expect(checkPatch({ attachmentsFolder: "", exclude: [" a/ ", ""] })).toEqual({
      attachmentsFolder: "",
      exclude: ["a/"],
    });
    const vault = await openTestVault(fixtureVault({ "A.md": "a" }));
    await expect(vault.setSettings({ newNoteLocation: "folder" })).rejects.toThrow(/newNoteFolder/);
    expect(vault.settings().newNoteLocation).toBe("root");
  });

  it("applies exclude and attachment folder changes to the index, keeping ids", async () => {
    const folder = fixtureVault({ "A.md": "a", "Drafts/B.md": "b", "Files/C.md": "c" });
    const vault = await openTestVault(folder);
    const titles = async () =>
      (await vault.store.listTree(vault.workspaceId)).map((d) => d.title).sort();
    const idOf = async (title: string) =>
      (await vault.store.listTree(vault.workspaceId)).find((d) => d.title === title)!.id;
    expect(await titles()).toEqual(["A", "B", "C", "Drafts", "Files"]);
    const b = await idOf("B");

    await vault.setSettings({ exclude: ["Drafts/"], attachmentsFolder: "Files" });
    expect(await titles()).toEqual(["A"]);
    // The files stay where they are; nothing goes to the trash.
    expect(readFileSync(join(folder, "Drafts", "B.md"), "utf8")).toBe("b");
    expect(existsSync(join(folder, ".trash"))).toBe(false);
    await vault.setSettings({ exclude: null, attachmentsFolder: null });
    expect(await titles()).toEqual(["A", "B", "C", "Drafts", "Files"]);
    expect(await idOf("B")).toBe(b);
  });

  it("is served to windows: a request to change, a stream of changes", async () => {
    const vault = await openTestVault(fixtureVault({ "A.md": "a" }));
    const handlers = serveVault(vault);
    const seen: FolderSettings[] = [];
    const off = handlers.streams.settings(null, (s) => seen.push(s));
    expect(await handlers.requests.settings(null)).toEqual(DEFAULT_SETTINGS);
    const next = await handlers.requests.setSettings({ newNoteFolder: "Inbox" });
    expect(next.newNoteFolder).toBe("Inbox");
    expect(seen.map((s) => s.newNoteFolder)).toEqual([null, "Inbox"]);
    off();
    handlers.close();
  });
});
