// Changes made by other programs: create, modify, delete, rename and move, with and without the
// real watcher.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, fixtureVault, openTestVault, waitFor } from "./test-utils.ts";
import type { Vault } from "./vault.ts";

afterEach(cleanup);

async function titles(vault: Vault): Promise<string[]> {
  const tree = await vault.store.listTree(vault.workspaceId);
  return tree.map((t) => `${"  ".repeat(t.depth)}${t.title}`);
}

async function idOf(vault: Vault, title: string): Promise<string | undefined> {
  const tree = await vault.store.listTree(vault.workspaceId);
  return tree.find((t) => t.title === title)?.id;
}

describe("external changes (rescan)", () => {
  test("create, modify, delete", async () => {
    const folder = fixtureVault({ "A.md": "a\n", "B.md": "b\n" });
    const vault = await openTestVault(folder);
    writeFileSync(join(folder, "C.md"), "---\nk: v\n---\nnew [[A]]\n");
    writeFileSync(join(folder, "A.md"), "a changed\n");
    rmSync(join(folder, "B.md"));
    await vault.bridge.rescan(["C.md", "A.md", "B.md"]);
    expect(await titles(vault)).toEqual(["A", "C"]);
    const c = await vault.store.getDoc((await idOf(vault, "C"))!);
    expect(c?.document.properties).toEqual({ k: "v" });
    expect(c?.body?.markdown).toBe("new [[A]]\n");
    expect((await vault.store.backlinks((await idOf(vault, "A"))!)).length).toBe(1);
    expect((await vault.store.getDoc((await idOf(vault, "A"))!))?.body?.markdown).toBe(
      "a changed\n",
    );
    // Changes from disk are journaled as the bridge, never on an undo stack.
    expect(vault.runtime.history.canUndo()).toBe(false);
  });

  test("a rename keeps the id and links keep resolving", async () => {
    const folder = fixtureVault({ "Old.md": "body\n", "Ref.md": "[[Old]]\n" });
    const vault = await openTestVault(folder);
    const id = await idOf(vault, "Old");
    renameSync(join(folder, "Old.md"), join(folder, "New.md"));
    await vault.bridge.rescan(["Old.md", "New.md"]);
    expect(await idOf(vault, "New")).toBe(id);
    // Sticky resolution: the link text still says Old, it still points at the document.
    expect((await vault.store.backlinks(id!)).map((b) => b.targetRef)).toEqual(["Old"]);
  });

  test("a folder move keeps every id under it", async () => {
    const folder = fixtureVault({
      "Projects/One.md": "1\n",
      "Projects/Sub/Two.md": "2\n",
      "Archive/x.md": "x\n",
    });
    const vault = await openTestVault(folder);
    const ids = {
      projects: await idOf(vault, "Projects"),
      one: await idOf(vault, "One"),
      two: await idOf(vault, "Two"),
    };
    renameSync(join(folder, "Projects"), join(folder, "Archive/Old projects"));
    await vault.bridge.rescan(["Projects", "Archive/Old projects"]);
    expect(await titles(vault)).toEqual([
      "Archive",
      "  Old projects",
      "    One",
      "    Sub",
      "      Two",
      "  x",
    ]);
    expect(await idOf(vault, "Old projects")).toBe(ids.projects);
    expect(await idOf(vault, "One")).toBe(ids.one);
    expect(await idOf(vault, "Two")).toBe(ids.two);
    expect(vault.bridge.pathOf(ids.two!)).toBe("Archive/Old projects/Sub/Two.md");
  });

  test("a note added next to a folder becomes the folder's body", async () => {
    const folder = fixtureVault({ "Topic/Child.md": "c\n" });
    const vault = await openTestVault(folder);
    const id = await idOf(vault, "Topic");
    writeFileSync(join(folder, "Topic.md"), "about the topic\n");
    await vault.bridge.rescan(["Topic.md"]);
    expect(await idOf(vault, "Topic")).toBe(id);
    expect((await vault.store.getDoc(id!))?.body?.markdown).toBe("about the topic\n");
  });

  test("the bridge's own writes are not seen as external changes", async () => {
    const folder = fixtureVault({ "A.md": "a\n" });
    const vault = await openTestVault(folder);
    const id = (await idOf(vault, "A"))!;
    await vault.runtime.ops.doc.updateBody({ id, markdown: "edited\n" });
    await vault.runtime.ops.doc.rename({ id, title: "Renamed" });
    const changes: string[][] = [];
    vault.bridge.onExternalChange((c) => changes.push(c.ids));
    await vault.bridge.rescan([""]);
    expect(changes).toEqual([]);
  });
});

describe("external changes (watcher)", () => {
  test("picks up creates, edits, renames and deletes from another program", async () => {
    const folder = fixtureVault({ "Keep.md": "keep\n", "Note.md": "first\n" });
    const vault = await openTestVault(folder, { watch: { debounceMs: 30, renameWindowMs: 150 } });
    const id = (await idOf(vault, "Note"))!;

    writeFileSync(join(folder, "Note.md"), "second\n");
    await waitFor(
      async () => (await vault.store.getDoc(id))?.body?.markdown,
      (b) => b === "second\n",
    );
    expect((await vault.store.getDoc(id))?.body?.markdown).toBe("second\n");

    mkdirSync(join(folder, "Folder"));
    renameSync(join(folder, "Note.md"), join(folder, "Folder/Moved.md"));
    await waitFor(
      async () => (await vault.store.getDoc(id))?.document.title,
      (t) => t === "Moved",
    );
    expect(vault.bridge.pathOf(id)).toBe("Folder/Moved.md");
    expect((await vault.store.getDoc(id))?.document.title).toBe("Moved");

    writeFileSync(join(folder, "Fresh.md"), "fresh\n");
    await waitFor(
      () => idOf(vault, "Fresh"),
      (x) => x !== undefined,
    );
    expect(await idOf(vault, "Fresh")).toBeDefined();

    rmSync(join(folder, "Keep.md"));
    await waitFor(
      () => idOf(vault, "Keep"),
      (x) => x === undefined,
    );
    expect(await idOf(vault, "Keep")).toBeUndefined();
    await vault.bridge.idle();
  });
});
