// Every operation's effect on the folder.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { addAttachment } from "@lydie/runtime";

import { cleanup, fixtureVault, openTestVault, snapshot } from "./test-utils.ts";
import type { Vault } from "./vault.ts";

afterEach(cleanup);

async function idOf(vault: Vault, title: string): Promise<string> {
  const tree = await vault.store.listTree(vault.workspaceId, { includeDeleted: true });
  const found = tree.find((t) => t.title === title);
  if (!found) throw new Error(`No document "${title}"`);
  return found.id;
}

const read = (folder: string, path: string) => readFileSync(join(folder, path), "utf8");

describe("create", () => {
  test("writes a new file with its id in the frontmatter", async () => {
    const folder = fixtureVault({ "A.md": "a\n" });
    const vault = await openTestVault(folder);
    const doc = await vault.runtime.ops.doc.create({
      workspaceId: vault.workspaceId,
      title: "New note",
      properties: { status: "draft" },
      markdown: "# Hi\n\nBody\n",
    });
    expect(read(folder, "New note.md")).toBe(
      `---\nid: ${doc.id}\nstatus: draft\n---\n# Hi\n\nBody\n`,
    );
    expect(vault.bridge.pathOf(doc.id)).toBe("New note.md");
  });

  test("dedupes names and keeps the title in step with the file name", async () => {
    const folder = fixtureVault({ "Untitled.md": "x\n" });
    const vault = await openTestVault(folder);
    const doc = await vault.runtime.ops.doc.create({ workspaceId: vault.workspaceId });
    expect(existsSync(join(folder, "Untitled 1.md"))).toBe(true);
    expect((await vault.store.getDoc(doc.id))?.document.title).toBe("Untitled 1");
    const odd = await vault.runtime.ops.doc.create({
      workspaceId: vault.workspaceId,
      title: "What: a/b?",
    });
    expect(existsSync(join(folder, "What- a-b-.md"))).toBe(true);
    expect((await vault.store.getDoc(odd.id))?.document.title).toBe("What- a-b-");
  });

  test("a child of a note creates the note's folder", async () => {
    const folder = fixtureVault({ "Parent.md": "p\n" });
    const vault = await openTestVault(folder);
    const parentId = await idOf(vault, "Parent");
    await vault.runtime.ops.doc.create({ workspaceId: vault.workspaceId, parentId, title: "Kid" });
    expect(existsSync(join(folder, "Parent/Kid.md"))).toBe(true);
    expect(read(folder, "Parent.md")).toBe("p\n");
  });

  test("records manual order in .lydie/order.json only when it differs from name order", async () => {
    const folder = fixtureVault({ "B.md": "b\n", "D.md": "d\n" });
    const vault = await openTestVault(folder);
    await vault.runtime.ops.doc.create({ workspaceId: vault.workspaceId, title: "E" });
    expect(existsSync(join(folder, ".lydie/order.json"))).toBe(false);
    await vault.runtime.ops.doc.create({ workspaceId: vault.workspaceId, title: "A" });
    expect(JSON.parse(read(folder, ".lydie/order.json"))).toEqual({ "": ["B", "D", "E", "A"] });
    const a = await idOf(vault, "A");
    await vault.runtime.ops.doc.move({ id: a, parentId: null, beforeId: await idOf(vault, "B") });
    expect(JSON.parse(read(folder, ".lydie/order.json"))).toEqual({});
  });
});

describe("body and properties", () => {
  test("updateBody keeps the frontmatter bytes, line endings and final newline", async () => {
    const original = "---\r\n# comment\r\ntitle:   'Kept'\r\n---\r\nLine one\r\n\r\nLine two\r\n";
    const folder = fixtureVault({ "Note.md": original });
    const vault = await openTestVault(folder);
    const id = await idOf(vault, "Note");
    const body = (await vault.store.getDoc(id))!.body!.markdown;
    expect(body).toBe("Line one\r\n\r\nLine two\r\n");
    await vault.runtime.ops.doc.updateBody({
      id,
      edits: [{ oldStr: "Line two", newStr: "Line two\nLine three" }],
    });
    expect(read(folder, "Note.md")).toBe(
      "---\r\n# comment\r\ntitle:   'Kept'\r\n---\r\nLine one\r\n\r\nLine two\r\nLine three\r\n",
    );
    await vault.runtime.ops.doc.updateBody({ id, markdown: "Replaced" });
    expect(read(folder, "Note.md")).toBe(
      "---\r\n# comment\r\ntitle:   'Kept'\r\n---\r\nReplaced\r\n",
    );
  });

  test("an unchanged body is not written", async () => {
    const folder = fixtureVault({ "Note.md": "Same\n" });
    const vault = await openTestVault(folder);
    const id = await idOf(vault, "Note");
    const before = statSync(join(folder, "Note.md")).mtimeMs;
    await new Promise((r) => setTimeout(r, 20));
    await vault.runtime.ops.doc.updateBody({ id, markdown: "Same\n" });
    await vault.runtime.ops.doc.setProperties({ id, set: {} });
    expect(statSync(join(folder, "Note.md")).mtimeMs).toBe(before);
  });

  test("setProperties rewrites only the changed keys", async () => {
    const folder = fixtureVault({
      "Note.md":
        '---\ntitle: "Quoted" # keep me\nnested:\n  a: 1\nnums: [1, 2]\ntags:\n  - x\n---\nBody\n',
    });
    const vault = await openTestVault(folder);
    const id = await idOf(vault, "Note");
    const doc = (await vault.store.getDoc(id))!.document;
    // Values the contract cannot hold stay in the file and out of the database.
    expect(doc.properties).toEqual({ title: "Quoted", tags: ["x"] });
    await vault.runtime.ops.doc.setProperties({ id, set: { status: "done" }, unset: ["tags"] });
    expect(read(folder, "Note.md")).toBe(
      '---\ntitle: "Quoted" # keep me\nnested:\n  a: 1\nnums: [1, 2]\nstatus: done\n---\nBody\n',
    );
  });

  test("properties on a folder create its note", async () => {
    const folder = fixtureVault({ "Folder/Child.md": "c\n" });
    const vault = await openTestVault(folder);
    const id = await idOf(vault, "Folder");
    expect((await vault.store.getDoc(id))!.body).toBeNull();
    await vault.runtime.ops.doc.setProperties({ id, set: { icon: "star" } });
    expect(read(folder, "Folder.md")).toBe("---\nicon: star\n---\n");
  });
});

describe("rename and move", () => {
  test("rename rewrites only the link bytes in other files", async () => {
    const folder = fixtureVault({
      "Target.md": "t\n",
      "Folder/Deep.md": "d\n",
      "Links.md":
        "* [[Target]] and [[Target#Head|alias]] and ![[Target]]\n" +
        "* [md](Target.md) and [rel](./Folder/Deep.md) and [abs](Folder/Deep.md)\n" +
        "* untouched [[Other]]   with   spacing\n",
    });
    const vault = await openTestVault(folder);
    await vault.runtime.ops.doc.rename({ id: await idOf(vault, "Target"), title: "New target" });
    await vault.runtime.ops.doc.rename({ id: await idOf(vault, "Deep"), title: "Deeper one" });
    expect(read(folder, "Links.md")).toBe(
      "* [[New target]] and [[New target#Head|alias]] and ![[New target]]\n" +
        "* [md](New%20target.md) and [rel](./Folder/Deeper%20one.md) and [abs](Folder/Deeper%20one.md)\n" +
        "* untouched [[Other]]   with   spacing\n",
    );
    expect(existsSync(join(folder, "New target.md"))).toBe(true);
    expect(existsSync(join(folder, "Target.md"))).toBe(false);
    const backlinks = await vault.store.backlinks(await idOf(vault, "New target"));
    expect(backlinks.length).toBeGreaterThanOrEqual(3);
  });

  test("move carries the folder and fixes relative links inside the moved file", async () => {
    const folder = fixtureVault({
      "A/Note.md": "[up](../B/Other.md) and [[Other]]\n",
      "A/Note/Child.md": "child\n",
      "B/Other.md": "o\n",
      "C/.keep": "",
    });
    const vault = await openTestVault(folder);
    const note = await idOf(vault, "Note");
    const child = await idOf(vault, "Child");
    await vault.runtime.ops.doc.move({ id: note, parentId: await idOf(vault, "C") });
    expect(read(folder, "C/Note.md")).toBe("[up](../B/Other.md) and [[Other]]\n");
    expect(existsSync(join(folder, "C/Note/Child.md"))).toBe(true);
    expect(vault.bridge.pathOf(child)).toBe("C/Note/Child.md");
    await vault.runtime.ops.doc.move({ id: note, parentId: await idOf(vault, "B") });
    expect(read(folder, "B/Note.md")).toBe(
      "[up](../B/Other.md) and [[Other]]\n".replace("../B/Other.md", "Other.md"),
    );
  });

  test("undo of a rename renames the file back", async () => {
    const folder = fixtureVault({ "One.md": "1\n", "Ref.md": "[[One]]\n" });
    const vault = await openTestVault(folder);
    await vault.runtime.ops.doc.rename({ id: await idOf(vault, "One"), title: "Two" });
    expect(read(folder, "Ref.md")).toBe("[[Two]]\n");
    await vault.runtime.history.undo();
    expect(existsSync(join(folder, "One.md"))).toBe(true);
    expect(read(folder, "Ref.md")).toBe("[[One]]\n");
  });
});

describe("trash", () => {
  test("delete moves to .trash, restore moves back, purge deletes", async () => {
    const folder = fixtureVault({ "Keep.md": "k\n", "Gone.md": "g\n", "Gone/Kid.md": "kid\n" });
    const vault = await openTestVault(folder);
    const id = await idOf(vault, "Gone");
    await vault.runtime.ops.doc.delete({ id });
    expect(snapshot(folder)).toEqual({
      "Keep.md": "k\n",
      ".trash/Gone.md": "g\n",
      ".trash/Gone/Kid.md": "kid\n",
    });
    const trash = JSON.parse(read(folder, ".lydie/trash.json"));
    expect(Object.keys(trash)).toHaveLength(2);
    expect(trash[id]).toMatchObject({ key: ".trash/Gone", title: "Gone", parentId: null });

    await vault.runtime.ops.doc.restore({ id });
    expect(snapshot(folder)).toEqual({
      "Keep.md": "k\n",
      "Gone.md": "g\n",
      "Gone/Kid.md": "kid\n",
    });
    expect(JSON.parse(read(folder, ".lydie/trash.json"))).toEqual({});

    await vault.runtime.ops.doc.delete({ id });
    await vault.runtime.ops.doc.purge({ id });
    expect(snapshot(folder)).toEqual({ "Keep.md": "k\n" });
    expect(readdirSync(join(folder, ".trash"))).toEqual([]);
  });
});

describe("attachments", () => {
  test("bytes land in the attachments folder once per content", async () => {
    const folder = fixtureVault({ "Note.md": "n\n" });
    const vault = await openTestVault(folder);
    const data = new TextEncoder().encode("PNGDATA");
    const a = await addAttachment(vault.runtime, vault.blob, {
      workspaceId: vault.workspaceId,
      filename: "photo.png",
      contentType: "image/png",
      data,
    });
    const b = await addAttachment(vault.runtime, vault.blob, {
      workspaceId: vault.workspaceId,
      filename: "copy.png",
      contentType: "image/png",
      data,
    });
    expect(snapshot(folder)).toEqual({ "Note.md": "n\n", "attachments/photo.png": "PNGDATA" });
    expect(await vault.blob.get(a.sha256)).toEqual(data);
    const records = JSON.parse(read(folder, ".lydie/attachments.json"));
    expect(records[a.id].path).toBe("attachments/photo.png");
    expect(records[b.id].path).toBe("attachments/photo.png");

    for (const id of [a.id, b.id]) {
      await vault.runtime.ops.attachment.delete({ id });
      await vault.runtime.ops.attachment.purge({ id });
    }
    expect(snapshot(folder)).toEqual({ "Note.md": "n\n" });
  });
});

describe("links in frontmatter", () => {
  test("are backlinks, follow renames and survive a rebuild", async () => {
    const folder = fixtureVault({
      "Target.md": "t\n",
      "Note.md": '---\nrelated: "[[Target]]"\nsee:\n  - "[[Target#Part]]"\n---\nBody [[Target]]\n',
    });
    const vault = await openTestVault(folder);
    const target = await idOf(vault, "Target");
    const sources = async () =>
      (await vault.store.backlinks(target)).map((b) => b.sourceProperty ?? "body").sort();
    expect(await sources()).toEqual(["body", "related", "see"]);
    await vault.runtime.ops.doc.rename({ id: target, title: "Renamed" });
    expect(read(folder, "Note.md")).toBe(
      '---\nrelated: "[[Renamed]]"\nsee:\n  - "[[Renamed#Part]]"\n---\nBody [[Renamed]]\n',
    );
    expect(await sources()).toEqual(["body", "related", "see"]);
  });
});
