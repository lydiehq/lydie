// External edits to open documents (S2): merged into the editor's state as steps, or, on a true
// conflict, both versions kept.
import { afterEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parse, schema } from "@lydie/markdown";
import type { ReplaceStepJSON } from "@lydie/markdown";
import type { Node } from "prosemirror-model";
import { Slice } from "prosemirror-model";
import { Transform } from "prosemirror-transform";

import type { FileConflict } from "./bridge.ts";
import { cleanup, fixtureVault, openTestVault } from "./test-utils.ts";
import type { Vault } from "./vault.ts";

afterEach(cleanup);

// A minimal stand-in for the editor: a ProseMirror document that edits and receives steps.
function editorFor(source: string) {
  const state = { doc: parse(source).doc as Node, conflicts: [] as FileConflict[], closed: false };
  return {
    state,
    handle: {
      getDoc: () => state.doc,
      applySteps(steps: ReplaceStepJSON[]) {
        const tr = new Transform(state.doc);
        for (const step of steps)
          tr.replace(step.from, step.to, Slice.fromJSON(schema, step.slice));
        state.doc = tr.doc;
      },
      onConflict: (c: FileConflict) => state.conflicts.push(c),
      onClosed: () => {
        state.closed = true;
      },
    },
    // Replaces the text of top-level block `index`.
    type(index: number, text: string) {
      let pos = 0;
      for (let i = 0; i < index; i++) pos += state.doc.child(i).nodeSize;
      const block = state.doc.child(index);
      const tr = new Transform(state.doc).replaceWith(
        pos + 1,
        pos + block.nodeSize - 1,
        schema.text(text),
      );
      state.doc = tr.doc;
    },
    text: () => state.doc.textContent,
    blocks: () => {
      const out: string[] = [];
      state.doc.forEach((b) => out.push(b.textContent));
      return out;
    },
  };
}

async function idOf(vault: Vault, title: string): Promise<string> {
  const tree = await vault.store.listTree(vault.workspaceId);
  return tree.find((t) => t.title === title)!.id;
}

const file = (folder: string, name: string) => readFileSync(join(folder, name), "utf8");

describe("open documents", () => {
  test("an external edit to another block merges into unsaved editor state", async () => {
    const folder = fixtureVault({ "Note.md": "First paragraph.\n\nSecond paragraph.\n" });
    const vault = await openTestVault(folder);
    const id = await idOf(vault, "Note");
    const editor = editorFor(file(folder, "Note.md"));
    const open = await vault.bridge.openDocument(id, editor.handle);

    editor.type(0, "First paragraph, edited in Lydie.");
    writeFileSync(
      join(folder, "Note.md"),
      "First paragraph.\n\nSecond paragraph, edited elsewhere.\n",
    );
    await vault.bridge.rescan(["Note.md"]);

    expect(editor.blocks()).toEqual([
      "First paragraph, edited in Lydie.",
      "Second paragraph, edited elsewhere.",
    ]);
    // Disk and database hold the other program's version until the editor saves.
    expect((await vault.store.getDoc(id))?.body?.markdown).toBe(
      "First paragraph.\n\nSecond paragraph, edited elsewhere.\n",
    );
    await open.save(editor.state.doc);
    expect(file(folder, "Note.md")).toBe(
      "First paragraph, edited in Lydie.\n\nSecond paragraph, edited elsewhere.\n",
    );
    expect(editor.state.conflicts).toEqual([]);
  });

  test("a conflicting edit keeps both versions and flags the document", async () => {
    const folder = fixtureVault({ "Note.md": "Shared line.\n\nOther.\n" });
    const vault = await openTestVault(folder);
    const id = await idOf(vault, "Note");
    const editor = editorFor(file(folder, "Note.md"));
    await vault.bridge.openDocument(id, editor.handle);

    editor.type(0, "Lydie's version of the line.");
    writeFileSync(join(folder, "Note.md"), "Their version of the line.\n\nOther.\n");
    await vault.bridge.rescan(["Note.md"]);

    // The file keeps the other program's version; the editor shows it too.
    expect(file(folder, "Note.md")).toBe("Their version of the line.\n\nOther.\n");
    expect(editor.blocks()).toEqual(["Their version of the line.", "Other."]);
    // The editor's version is saved next to it and indexed.
    const copies = readdirSync(folder).filter((n) => n.startsWith("Note.conflict-"));
    expect(copies).toHaveLength(1);
    expect(file(folder, copies[0]!)).toBe("Lydie's version of the line.\n\nOther.\n");
    expect(editor.state.conflicts).toHaveLength(1);
    expect(editor.state.conflicts[0]).toMatchObject({
      id,
      path: "Note.md",
      conflictPath: copies[0],
    });
    const flagged = await vault.store.conflicts.list(vault.workspaceId);
    expect(flagged.map((c) => [c.id, c.kind])).toEqual([[id, "file"]]);
    expect(await vault.store.getDoc(editor.state.conflicts[0]!.conflictId!)).not.toBeNull();
  });

  test("an operation on an open document reaches the editor", async () => {
    const folder = fixtureVault({ "Note.md": "One.\n\nTwo.\n" });
    const vault = await openTestVault(folder);
    const id = await idOf(vault, "Note");
    const editor = editorFor(file(folder, "Note.md"));
    await vault.bridge.openDocument(id, editor.handle);
    editor.type(0, "One, typing.");
    await vault.runtime.ops.doc.updateBody({
      id,
      edits: [{ oldStr: "Two.", newStr: "Two, by an agent." }],
    });
    expect(editor.blocks()).toEqual(["One, typing.", "Two, by an agent."]);
  });

  test("an operation racing an unprocessed external edit is merged, not overwritten", async () => {
    const folder = fixtureVault({ "Note.md": "Top.\n\nBottom.\n" });
    const vault = await openTestVault(folder);
    const id = await idOf(vault, "Note");
    // The watcher has not seen this yet.
    writeFileSync(join(folder, "Note.md"), "Top, edited on disk.\n\nBottom.\n");
    await vault.runtime.ops.doc.updateBody({
      id,
      edits: [{ oldStr: "Bottom.", newStr: "Bottom, by an agent." }],
    });
    expect(file(folder, "Note.md")).toBe("Top, edited on disk.\n\nBottom, by an agent.\n");
    expect((await vault.store.getDoc(id))?.body?.markdown).toBe(
      "Top, edited on disk.\n\nBottom, by an agent.\n",
    );
  });

  test("an operation conflicting with an unprocessed external edit keeps both", async () => {
    const folder = fixtureVault({ "Note.md": "Line.\n" });
    const vault = await openTestVault(folder);
    const id = await idOf(vault, "Note");
    writeFileSync(join(folder, "Note.md"), "Line from disk.\n");
    await vault.runtime.ops.doc.updateBody({ id, markdown: "Line from the agent.\n" });
    expect(file(folder, "Note.md")).toBe("Line from disk.\n");
    const copy = readdirSync(folder).find((n) => n.startsWith("Note.conflict-"))!;
    expect(file(folder, copy)).toBe("Line from the agent.\n");
    expect((await vault.store.getDoc(id))?.body?.markdown).toBe("Line from disk.\n");
  });
});
