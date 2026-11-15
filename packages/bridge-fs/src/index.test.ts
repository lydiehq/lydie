// Indexing a folder, incremental reopen, the rebuild rule (S4) and the no-op round trip.
import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { addAttachment } from "@lydie/runtime";

import {
  cleanup,
  fixtureVault,
  hashes,
  openTestVault,
  snapshot,
  tempDir,
  workspaceOf,
} from "./test-utils.ts";
import type { Vault } from "./vault.ts";

afterEach(cleanup);

const HELP_VAULT = join(import.meta.dirname, "../../markdown/.cache/obsidian-help");

async function idOf(vault: Vault, title: string): Promise<string> {
  const tree = await vault.store.listTree(vault.workspaceId, { includeDeleted: true });
  const found = tree.find((t) => t.title === title);
  if (!found) throw new Error(`No document "${title}"`);
  return found.id;
}

describe("index", () => {
  test("maps files and folders to documents, frontmatter to properties, bodies to the index", async () => {
    const folder = fixtureVault({
      "Home.md":
        "# Home\n\nSee [[Idea#Why|why]], ![[Idea#^blk]] and [md](Projects/Plan.md). #tag\n",
      "Projects/Plan.md": "---\nstatus: active\nnested: {a: 1}\n---\nThe plan ^p1\n",
      "Projects/Idea.md": "An idea ^blk\n\n## Why\n",
      "Empty folder/": "",
      ".obsidian/app.json": "{}",
      ".git/HEAD": "ref",
      "node_modules/x/README.md": "nope",
      "attachments/pic.png": "png",
      "attachments/notes.md": "not a document",
      "image.png": "png",
    });
    const vault = await openTestVault(folder);
    const ws = await workspaceOf(vault);
    expect(ws.map((d) => `${"  ".repeat(d.depth)}${d.title}`)).toEqual([
      "Empty folder",
      "Home",
      "Projects",
      "  Idea",
      "  Plan",
    ]);
    const plan = ws.find((d) => d.title === "Plan")!;
    expect(plan.properties).toEqual({ status: "active" });
    expect(plan.body).toBe("The plan ^p1\n");
    const idea = ws.find((d) => d.title === "Idea")!;
    const home = ws.find((d) => d.title === "Home")!;
    expect(home.links).toEqual(
      [
        `embed|wikilink|Idea|${idea.id}||blk|`,
        `link|markdown|Projects/Plan.md|${plan.id}|||`,
        `link|wikilink|Idea|${idea.id}|Why||`,
      ].sort(),
    );
    expect(ws.find((d) => d.title === "Projects")!.body).toBeNull();
    const blocks = await vault.store.ports.db.read((tx) => tx.blocks!.list(idea.id));
    expect(blocks).toMatchObject([{ blockId: "blk", type: "paragraph", text: "An idea" }]);
    expect((await vault.store.search(vault.workspaceId, "plan"))[0]?.id).toBe(plan.id);
  });

  test("reopening reads only what changed", async () => {
    const folder = fixtureVault({ "A.md": "a\n", "B.md": "b\n", "C.md": "c\n" });
    const databasePath = join(tempDir(), "db.sqlite");
    let vault = await openTestVault(folder, { databasePath });
    expect(vault.index.read).toBe(3);
    await vault.close();

    vault = await openTestVault(folder, { databasePath });
    expect(vault.index).toMatchObject({ read: 0, created: 0, updated: 0, removed: 0 });
    await vault.close();

    writeFileSync(join(folder, "B.md"), "b changed\n");
    // Same size, new mtime, same bytes: hashed, not re-indexed.
    utimesSync(join(folder, "C.md"), new Date(), new Date(Date.now() + 5000));
    vault = await openTestVault(folder, { databasePath });
    expect(vault.index.read).toBe(2);
    expect((await vault.store.getDoc(await idOf(vault, "B")))!.body!.markdown).toBe("b changed\n");
    await vault.close();
  });

  test("a rename while closed keeps the id", async () => {
    const folder = fixtureVault({ "Old.md": "content\n", "Ref.md": "[[Old]]\n" });
    const databasePath = join(tempDir(), "db.sqlite");
    let vault = await openTestVault(folder, { databasePath });
    const id = await idOf(vault, "Old");
    await vault.close();
    cpSync(join(folder, "Old.md"), join(folder, "Moved.md"));
    rmSync(join(folder, "Old.md"));
    vault = await openTestVault(folder, { databasePath });
    expect(await idOf(vault, "Moved")).toBe(id);
    expect(vault.index.moved).toBe(1);
    // The id is recorded in the sidecar so a rebuild gives it back.
    expect(snapshot(folder, { lydie: true })[".lydie/ids.json"]).toContain(id);
  });
});

describe("rebuild rule (S4)", () => {
  test("deleting the database and reopening gives the same workspace", async () => {
    const folder = fixtureVault({
      "Inbox.md": "Links: [[Alpha]], [[Projects/Beta#Plan]], [rel](Projects/Gamma.md)\n",
      "Alpha.md": "---\ntags: [x]\n---\nalpha ^a1\n",
      "Projects/Beta.md": "## Plan\n\nbeta\n",
      "Projects/Gamma.md": "gamma [[Alpha#^a1]]\n",
      "Projects/Zeta.md": "zeta\n",
      "Archive/Old.md": "old\n",
    });
    const vault = await openTestVault(folder);
    const ops = vault.runtime.ops;
    const ws = vault.workspaceId;
    const projects = await idOf(vault, "Projects");
    // Manual order, renames and moves of pristine notes, new notes, properties, body edits, trash.
    await ops.doc.move({
      id: await idOf(vault, "Zeta"),
      parentId: projects,
      beforeId: await idOf(vault, "Beta"),
    });
    await ops.doc.rename({ id: await idOf(vault, "Alpha"), title: "Alpha prime" });
    await ops.doc.move({ id: await idOf(vault, "Gamma"), parentId: await idOf(vault, "Archive") });
    const created = await ops.doc.create({
      workspaceId: ws,
      parentId: projects,
      title: "New",
      markdown: "[[Inbox]]\n",
    });
    await ops.doc.create({ workspaceId: ws, parentId: created.id, title: "Child" });
    await ops.doc.move({ id: created.id, parentId: projects, beforeId: await idOf(vault, "Zeta") });
    await ops.doc.setProperties({ id: await idOf(vault, "Beta"), set: { status: "done" } });
    await ops.doc.updateBody({
      id: await idOf(vault, "Inbox"),
      edits: [{ oldStr: "Links", newStr: "All links" }],
    });
    await ops.doc.delete({ id: await idOf(vault, "Old") });
    await addAttachment(vault.runtime, vault.blob, {
      workspaceId: ws,
      filename: "a.txt",
      contentType: "text/plain",
      data: new TextEncoder().encode("hi"),
    });

    const before = await workspaceOf(vault);
    const attachmentsBefore = await vault.runtime.ops.attachment.list({
      workspaceId: ws,
      includeDeleted: true,
    });
    const disk = snapshot(folder, { lydie: true });
    await vault.close();
    rmSync(vault.databasePath);

    const rebuilt = await openTestVault(folder);
    expect(rebuilt.workspaceId).toBe(ws);
    expect(await workspaceOf(rebuilt)).toEqual(before);
    expect(
      await rebuilt.runtime.ops.attachment.list({ workspaceId: ws, includeDeleted: true }),
    ).toEqual(attachmentsBefore);
    // Rebuilding writes nothing.
    expect(snapshot(folder, { lydie: true })).toEqual(disk);
    // The trash came back too and can be restored.
    await rebuilt.runtime.ops.doc.restore({ id: await idOf(rebuilt, "Old") });
    expect(existsSync(join(folder, "Archive/Old.md"))).toBe(true);
  });
});

describe("no-op round trip", () => {
  test.skipIf(!existsSync(HELP_VAULT))(
    "opening and closing the Obsidian help vault changes no byte",
    async () => {
      const folder = join(tempDir(), "help");
      cpSync(join(HELP_VAULT, "en"), folder, { recursive: true });
      const before = hashes(folder);
      const started = performance.now();
      const vault = await openTestVault(folder);
      const ms = performance.now() - started;
      console.log(
        `help vault (en): ${Object.keys(before).length} files, ${vault.index.documents} documents, opened in ${ms.toFixed(0)} ms (index ${vault.index.ms} ms)`,
      );
      await vault.close();
      expect(hashes(folder)).toEqual(before);
      expect(ms).toBeLessThan(2000);
    },
    30_000,
  );
});
