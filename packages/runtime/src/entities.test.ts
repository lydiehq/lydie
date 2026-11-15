import { describe, expect, it } from "bun:test";

import { actorRef, parseActorRef } from "@lydie/contract";

import { addAttachment, sha256Hex } from "./attachments.ts";
import { createMemoryPorts } from "./memory/index.ts";
import { createRuntime } from "./runtime.ts";
import { extract } from "./text.ts";

const WS = "ws1";
const user = { type: "user", id: "u1" } as const;

function setup() {
  const ports = createMemoryPorts();
  let tick = Date.parse("2026-11-12T10:00:00.000Z");
  const runtime = createRuntime({
    ...ports,
    actor: user,
    clock: { now: () => new Date((tick += 1000)) },
  });
  return { ports, runtime, ops: runtime.ops };
}

describe("trash", () => {
  it("lists trashed subtrees as one item, restores in place, purges permanently", async () => {
    const { ops, ports } = setup();
    const a = await ops.doc.create({ workspaceId: WS, title: "A" });
    const a1 = await ops.doc.create({
      workspaceId: WS,
      title: "A1",
      parentId: a.id,
      markdown: "zebra",
    });
    await ops.doc.create({ workspaceId: WS, title: "A11", parentId: a1.id });
    const b = await ops.doc.create({ workspaceId: WS, title: "B", markdown: "[[A1]]" });
    await ops.doc.delete({ id: a.id });

    const { items } = await ops.trash.list({ workspaceId: WS });
    expect(items).toEqual([
      expect.objectContaining({ kind: "document", id: a.id, descendantCount: 2, deletedBy: "u1" }),
    ]);
    // Trashed rows are excluded by default everywhere.
    expect((await ops.doc.listTree({ workspaceId: WS })).entries.map((e) => e.title)).toEqual([
      "B",
    ]);
    expect((await ops.doc.search({ workspaceId: WS, query: "zebra" })).hits).toEqual([]);
    expect((await ops.doc.unresolvedLinks({ workspaceId: WS })).links).toEqual([
      expect.objectContaining({ targetRef: "A1", source: expect.objectContaining({ id: b.id }) }),
    ]);

    await expect(ops.doc.purge({ id: b.id })).rejects.toMatchObject({ code: "invalid_input" });
    const { purgedIds } = await ops.doc.purge({ id: a.id });
    expect(purgedIds).toHaveLength(3);
    expect(ports.state.docs.has(a1.id)).toBe(false);
    expect(ports.state.bodies.has(a1.id)).toBe(false);
    expect([...ports.state.links.values()].every((l) => l.targetId === null)).toBe(true);
    expect((await ops.trash.list({ workspaceId: WS })).items).toEqual([]);
    expect(ports.events.published.at(-1)).toMatchObject({ type: "doc.purged" });
  });

  it("restores a child to the top level when its parent is gone", async () => {
    const { ops } = setup();
    const a = await ops.doc.create({ workspaceId: WS, title: "A" });
    const a1 = await ops.doc.create({ workspaceId: WS, title: "A1", parentId: a.id });
    await ops.doc.delete({ id: a1.id });
    await ops.doc.delete({ id: a.id });
    expect((await ops.trash.list({ workspaceId: WS })).items.map((i) => i.title)).toEqual([
      "A",
      "A1",
    ]);
    await ops.doc.purge({ id: a.id });
    expect((await ops.trash.list({ workspaceId: WS })).items).toEqual([]);
  });

  it("empties the trash, attachments included, and frees unshared bytes", async () => {
    const { runtime, ports, ops } = setup();
    const doc = await ops.doc.create({ workspaceId: WS, title: "Doc" });
    const one = await addAttachment(runtime, ports.blob, {
      workspaceId: WS,
      documentId: doc.id,
      filename: "a.txt",
      contentType: "text/plain",
      data: new TextEncoder().encode("same"),
    });
    const two = await addAttachment(runtime, ports.blob, {
      workspaceId: WS,
      filename: "b.txt",
      contentType: "text/plain",
      data: new TextEncoder().encode("same"),
    });
    expect(one.sha256).toBe(two.sha256);
    expect(ports.blob.size).toBe(1);
    await ops.attachment.delete({ id: two.id });
    await ops.doc.delete({ id: doc.id });
    expect((await ops.trash.list({ workspaceId: WS })).items.map((i) => i.kind).sort()).toEqual([
      "attachment",
      "document",
    ]);
    const { purgedIds } = await ops.trash.empty({ workspaceId: WS });
    expect(purgedIds.sort()).toEqual([doc.id, one.id, two.id].sort());
    expect(ports.state.attachments.size).toBe(0);
    expect(ports.blob.size).toBe(0);
  });
});

describe("attachments", () => {
  it("stores bytes once by SHA-256 and keeps them while another attachment uses them", async () => {
    const { runtime, ports, ops } = setup();
    const data = new TextEncoder().encode("hello");
    expect(await sha256Hex(data)).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
    const a = await addAttachment(runtime, ports.blob, {
      workspaceId: WS,
      filename: "hello.txt",
      contentType: "text/plain",
      data,
    });
    const b = await addAttachment(runtime, ports.blob, {
      workspaceId: WS,
      filename: "copy.txt",
      contentType: "text/plain",
      data,
    });
    expect(a).toMatchObject({ size: 5, documentId: null, createdBy: "u1", deletedAt: null });
    expect((await ops.attachment.list({ workspaceId: WS })).attachments.map((x) => x.id)).toEqual([
      b.id,
      a.id,
    ]);
    await ops.attachment.delete({ id: a.id });
    expect((await ops.attachment.list({ workspaceId: WS })).attachments).toHaveLength(1);
    await ops.attachment.purge({ id: a.id });
    expect(await ports.blob.get(a.sha256)).toEqual(data);
    await ops.attachment.delete({ id: b.id });
    await ops.attachment.purge({ id: b.id });
    expect(await ports.blob.get(a.sha256)).toBeNull();
    expect(ports.events.published.at(-1)).toMatchObject({
      type: "attachment.purged",
      data: { bytesRemoved: true },
    });
  });

  it("rejects attachments on trashed or foreign documents", async () => {
    const { ops } = setup();
    const doc = await ops.doc.create({ workspaceId: WS, title: "Doc" });
    const input = { filename: "x", contentType: "a/b", size: 1, sha256: "b".repeat(64) };
    await expect(
      ops.attachment.create({ ...input, workspaceId: "other", documentId: doc.id }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await ops.doc.delete({ id: doc.id });
    await expect(
      ops.attachment.create({ ...input, workspaceId: WS, documentId: doc.id }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("links and blocks", () => {
  it("extracts block ids, headings, tags and link parts outside code", () => {
    const md = [
      "---",
      "tags: [x]",
      "---",
      "# Title #notatag",
      "",
      "A paragraph with [[Other#Section|alias]] and #tag/sub. ^p1",
      "",
      "- item [[Note#^b2]] ^li",
      "- plain item",
      "",
      "| a | b |",
      "| - | - |",
      "^tbl",
      "",
      "```",
      "[[Code]] ^nope",
      "```",
      "`[[Inline]]` #123",
    ].join("\n");
    const out = extract(md);
    expect(out.blocks.map((b) => [b.id, b.type, b.text])).toEqual([
      ["p1", "paragraph", "A paragraph with alias and #tag/sub."],
      ["li", "listItem", "item Note#^b2"],
      ["tbl", "table", "| a | b | | - | - |"],
    ]);
    expect(out.headings).toEqual([{ level: 1, text: "Title #notatag" }]);
    expect(out.tags).toEqual(["notatag", "tag/sub"]);
    expect(out.links).toEqual([
      {
        kind: "link",
        syntax: "wikilink",
        target: "Other",
        heading: "Section",
        blockId: null,
        sourceBlockId: "p1",
      },
      {
        kind: "link",
        syntax: "wikilink",
        target: "Note",
        heading: null,
        blockId: "b2",
        sourceBlockId: "li",
      },
    ]);
    expect(out.text).not.toContain("[[");
  });

  it("indexes blocks and lists block backlinks", async () => {
    const { ops, ports } = setup();
    const target = await ops.doc.create({
      workspaceId: WS,
      title: "Target",
      markdown: "First. ^one\n\nSecond. ^two",
    });
    await ops.doc.create({ workspaceId: WS, title: "S1", markdown: "See [[Target#^one]]." });
    await ops.doc.create({
      workspaceId: WS,
      title: "S2",
      markdown: "See [[Target#^two]] and [[Target]].",
    });
    expect(ports.state.blocks.get(target.id)?.map((b) => b.blockId)).toEqual(["one", "two"]);
    const one = await ops.doc.blockBacklinks({ id: target.id, blockId: "one" });
    expect(one.backlinks.map((b) => b.source.title)).toEqual(["S1"]);
    expect((await ops.doc.backlinks({ id: target.id })).backlinks).toHaveLength(3);
  });

  it("resolves like Obsidian: path suffix, same folder first, then shortest path", async () => {
    const { ops } = setup();
    const projects = await ops.doc.create({ workspaceId: WS, title: "Projects" });
    const archive = await ops.doc.create({ workspaceId: WS, title: "Archive" });
    const old = await ops.doc.create({ workspaceId: WS, title: "Projects", parentId: archive.id });
    const deepNote = await ops.doc.create({ workspaceId: WS, title: "Note", parentId: old.id });
    const topNote = await ops.doc.create({ workspaceId: WS, title: "note" });
    const projectNote = await ops.doc.create({
      workspaceId: WS,
      title: "Note",
      parentId: projects.id,
    });

    const linkFrom = async (parentId: string | null, markdown: string) => {
      const src = await ops.doc.create({ workspaceId: WS, title: "Src", parentId, markdown });
      const target = (await ops.doc.backlinks({ id: topNote.id })).backlinks.some(
        (b) => b.source.id === src.id,
      )
        ? topNote.id
        : (await ops.doc.backlinks({ id: projectNote.id })).backlinks.some(
              (b) => b.source.id === src.id,
            )
          ? projectNote.id
          : (await ops.doc.backlinks({ id: deepNote.id })).backlinks.some(
                (b) => b.source.id === src.id,
              )
            ? deepNote.id
            : null;
      await ops.doc.delete({ id: src.id });
      return target;
    };
    // Shortest path wins from elsewhere.
    expect(await linkFrom(archive.id, "[[Note]]")).toBe(topNote.id);
    // Same folder wins over shortest path.
    expect(await linkFrom(projects.id, "[[NOTE]]")).toBe(projectNote.id);
    // A path suffix narrows it down; shortest of those.
    expect(await linkFrom(null, "[[Projects/Note]]")).toBe(projectNote.id);
    expect(await linkFrom(null, "[[Archive/Projects/Note.md]]")).toBe(deepNote.id);
    // Relative Markdown links resolve from the source's folder.
    expect(await linkFrom(projects.id, "[n](../Archive/Projects/Note.md)")).toBe(deepNote.id);
    expect(await linkFrom(null, "[[Nowhere/Note]]")).toBeNull();
  });

  it("keeps links pointing at a renamed document and resolves new ones", async () => {
    const { ops } = setup();
    const target = await ops.doc.create({ workspaceId: WS, title: "Old name" });
    const src = await ops.doc.create({
      workspaceId: WS,
      title: "Src",
      markdown: "[[Old name]] [[New name]]",
    });
    await ops.doc.rename({ id: target.id, title: "New name" });
    expect(
      (await ops.doc.backlinks({ id: target.id })).backlinks.map((b) => b.targetRef).sort(),
    ).toEqual(["New name", "Old name"]);
    // Re-extracting the source (an unrelated edit) keeps the old text pointing at the document.
    await ops.doc.updateBody({ id: src.id, markdown: "[[Old name]] [[New name]] edited" });
    expect((await ops.doc.backlinks({ id: target.id })).backlinks).toHaveLength(2);
    expect((await ops.doc.unresolvedLinks({ workspaceId: WS })).links).toEqual([]);
  });

  it("finds unlinked mentions of the title and aliases", async () => {
    const { ops } = setup();
    const target = await ops.doc.create({
      workspaceId: WS,
      title: "Project Atlas",
      properties: { aliases: ["Atlas"] },
    });
    await ops.doc.create({
      workspaceId: WS,
      title: "Mentions",
      markdown: "We talked about project atlas today.",
    });
    await ops.doc.create({ workspaceId: WS, title: "Alias", markdown: "Atlas is late." });
    await ops.doc.create({
      workspaceId: WS,
      title: "Linked",
      markdown: "[[Project Atlas]] project atlas",
    });
    await ops.doc.create({ workspaceId: WS, title: "Unrelated", markdown: "Atlases are books." });
    const { mentions } = await ops.doc.unlinkedMentions({ id: target.id });
    expect(mentions.map((m) => m.source.title)).toEqual(["Alias", "Mentions"]);
    expect(mentions[1]?.snippet).toContain("<mark>");
  });
});

describe("actor refs", () => {
  it("round-trip and keep users as plain ids", () => {
    const actors = [
      { type: "user", id: "u1" },
      { type: "agent", id: "a1", app: "claude", onBehalfOf: "u1" },
      { type: "system", id: "file-bridge" },
    ] as const;
    expect(actors.map(actorRef)).toEqual(["u1", "agent:claude:a1:u1", "system:file-bridge"]);
    for (const actor of actors) expect(parseActorRef(actorRef(actor))).toEqual(actor);
  });
});
