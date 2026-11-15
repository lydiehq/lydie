// Workspace export (@lydie/runtime `exportWorkspace`, @lydie/contract `planFolder`) against the
// bridge: an export is the folder format, so opening it as a vault gives the same workspace back.
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { frontmatterBlock } from "@lydie/contract";
import type { DatabaseDefinition } from "@lydie/contract";
import { extract, rewriteLinks, serialize } from "@lydie/markdown";
import { addAttachment, exportWorkspace, zipStream } from "@lydie/runtime";
import type { ExportOptions, ExportSource } from "@lydie/runtime";
import { unzipSync } from "fflate";

import {
  cleanup,
  fixtureVault,
  openTestVault,
  snapshot,
  tempDir,
  workspaceOf,
  writeFixture,
} from "./test-utils.ts";
import type { Vault } from "./vault.ts";

afterEach(cleanup);

// Pages with children, a manual order, titles a file cannot hold, links, two databases with a
// relation between them, and an attachment.
async function seed(vault: Vault) {
  const ops = vault.runtime.ops;
  const ws = vault.workspaceId;
  const projects = await ops.doc.create({
    workspaceId: ws,
    title: "Projects",
    markdown: "All of them.\n",
  });
  const plan = await ops.doc.create({
    workspaceId: ws,
    parentId: projects.id,
    title: "Plan",
    markdown: "See [[Notes/Ideas]] and ![[photo.png]].\n",
    properties: { tags: ["work", "q3"], icon: "🗺️" },
  });
  const archive = await ops.doc.create({
    workspaceId: ws,
    parentId: projects.id,
    title: "Archive",
  });
  // Before "Archive" in the tree, after it by name: written to `.lydie/order.json`.
  await ops.doc.move({ id: plan.id, parentId: projects.id, beforeId: archive.id });
  const notes = await ops.doc.create({ workspaceId: ws, title: "Notes" });
  await ops.doc.create({
    workspaceId: ws,
    parentId: notes.id,
    title: "Ideas",
    markdown: "# Ideas\n\n- one\n",
  });
  await ops.doc.create({ workspaceId: ws, title: "What? A/B test", markdown: "odd name\n" });
  const books = await ops.database.create({ workspaceId: ws, title: "Books" });
  const dune = await ops.database.createRow({ databaseId: books.database.id, title: "Dune" });
  const tasks = await ops.database.create({ workspaceId: ws, title: "Tasks" });
  const status = await ops.database.addProperty({
    databaseId: tasks.database.id,
    name: "Status",
    type: "select",
    config: {
      options: [
        { name: "Todo", color: "gray" },
        { name: "Done", color: "green" },
      ],
    },
  });
  const book = await ops.database.addProperty({
    databaseId: tasks.database.id,
    name: "Book",
    type: "relation",
    config: { relation: { databaseId: books.database.id } },
  });
  await ops.database.createView({ databaseId: tasks.database.id, name: "Board", type: "board" });
  await ops.database.createRow({
    databaseId: tasks.database.id,
    title: "Read it",
    values: { [status.id]: "Todo", [book.id]: [dune.id] },
  });
  await ops.database.create({ workspaceId: ws, title: "Empty" });
  await addAttachment(vault.runtime, vault.blob, {
    workspaceId: ws,
    documentId: plan.id,
    filename: "photo.png",
    contentType: "image/png",
    data: new TextEncoder().encode("PNGDATA"),
  });
  await vault.bridge.idle();
  return { tasks, books };
}

async function definitions(vault: Vault, ids: string[]) {
  const out = [];
  for (const id of ids) {
    const def = (await vault.runtime.ops.database.get({ id })) as DatabaseDefinition;
    out.push({
      config: def.database.config,
      properties: def.properties.map(({ id, name, type, key, config }) => ({
        id,
        name,
        type,
        key,
        config,
      })),
      views: def.views.map(({ id, name, type, config }) => ({ id, name, type, config })),
    });
  }
  return out;
}

const source = (vault: Vault): ExportSource => ({
  read: (fn) => vault.store.ports.db.read(fn),
  blob: vault.blob,
});

async function collect(vault: Vault, options?: ExportOptions) {
  const out: Record<string, string | Uint8Array> = {};
  for await (const e of exportWorkspace(source(vault), vault.workspaceId, options)) {
    out[e.path] = e.data;
  }
  return out;
}

describe("workspace export", () => {
  test("is the folder the bridge writes, and opens as the same workspace", async () => {
    const folder = fixtureVault({});
    const vault = await openTestVault(folder);
    const { tasks, books } = await seed(vault);
    // As the core exports (rewriting links to attachments by id): nothing here to rewrite.
    const files = await collect(vault, { rewriteLinks });

    // The same files as the vault Lydie wrote itself (`.lydie/` included, but for the staging area
    // and the device's own settings).
    const exported: Record<string, string> = {};
    for (const [path, data] of Object.entries(files)) {
      if (path.endsWith("/")) continue;
      exported[path] = typeof data === "string" ? data : new TextDecoder().decode(data);
    }
    const onDisk = snapshot(folder, { lydie: true });
    delete onDisk[".lydie/trash.json"];
    expect(exported).toEqual(onDisk);
    expect(Object.keys(files)).toContain("Empty/");

    // Opened as a new vault: the same documents, ids, bodies, properties, links and databases.
    const copy = join(tempDir(), "copy");
    for (const [path, data] of Object.entries(files)) writeFixture(copy, path, data);
    const reopened = await openTestVault(copy);
    expect(reopened.workspaceId).toBe(vault.workspaceId);
    expect(await workspaceOf(reopened)).toEqual(await workspaceOf(vault));
    const ids = [tasks.database.id, books.database.id];
    expect(await definitions(reopened, ids)).toEqual(await definitions(vault, ids));
    const attachments = await reopened.runtime.ops.attachment.list({
      workspaceId: vault.workspaceId,
    });
    expect(attachments.attachments.map((a) => a.filename)).toEqual(["photo.png"]);
  });

  test("streams as a zip with the same entries", async () => {
    const vault = await openTestVault(fixtureVault({}));
    await seed(vault);
    const files = await collect(vault);
    const zip = new Uint8Array(
      await new Response(
        zipStream(exportWorkspace(source(vault), vault.workspaceId)),
      ).arrayBuffer(),
    );
    const unzipped = unzipSync(zip);
    expect(Object.keys(unzipped).sort()).toEqual(Object.keys(files).sort());
    const plan = Object.keys(files).find((p) => p.endsWith("Plan.md"))!;
    expect(new TextDecoder().decode(unzipped[plan])).toBe(files[plan] as string);
    expect(new TextDecoder().decode(unzipped["attachments/photo.png"])).toBe("PNGDATA");
  });

  test("leaves the trash and files that are not documents out", async () => {
    const folder = fixtureVault({ "Keep.md": "k\n", "Gone.md": "g\n", ".obsidian/app.json": "{}" });
    const vault = await openTestVault(folder);
    const tree = await vault.store.listTree(vault.workspaceId, { includeDeleted: false });
    await vault.runtime.ops.doc.delete({ id: tree.find((t) => t.title === "Gone")!.id });
    await vault.bridge.idle();
    const files = await collect(vault);
    expect(Object.keys(files).filter((p) => !p.startsWith(".lydie/"))).toEqual(["Keep.md"]);
    // A note Lydie did not create keeps its id through the export's `id:`.
    expect(files["Keep.md"]).toStartWith("---\nid: ");
    expect(readFileSync(join(folder, "Keep.md"), "utf8")).toBe("k\n");
  });

  test("sections are folders that reopen as top-level pages", async () => {
    const vault = await openTestVault(fixtureVault({}));
    const { tasks, books } = await seed(vault);
    const roots = (await vault.store.listTree(vault.workspaceId, { includeDeleted: false })).filter(
      (d) => d.parentId === null,
    );
    const team = new Set(
      roots.filter((d) => ["Projects", "Notes"].includes(d.title)).map((d) => d.id),
    );
    const files = await collect(vault, {
      rewriteLinks,
      sections: {
        list: [
          { id: "team", name: "General" },
          { id: "private", name: "Private" },
        ],
        of: (id) => (team.has(id) ? "team" : "private"),
      },
    });
    expect(Object.keys(files).filter((p) => !p.startsWith(".lydie/") && !p.includes("/"))).toEqual(
      [],
    );
    expect(files["General/Projects/Plan.md"]).toBeDefined();
    expect(files["Private/Tasks/Tasks.base"]).toContain('file.inFolder("Private/Tasks")');

    // Opened as a vault: a page per section, holding the same documents.
    const copy = join(tempDir(), "copy");
    for (const [path, data] of Object.entries(files)) writeFixture(copy, path, data);
    const reopened = await openTestVault(copy);
    await reopened.bridge.idle();
    const before = await workspaceOf(vault);
    const after = await workspaceOf(reopened);
    const sections = after.filter((d) => d.depth === 0);
    expect(sections.map((d) => [d.title, d.body])).toEqual([
      ["General", null],
      ["Private", null],
    ]);
    const sectionId = (id: string) => sections[team.has(id) ? 0 : 1]!.id;
    expect(after.filter((d) => d.depth > 0)).toEqual(
      before.map((d) => ({
        ...d,
        depth: d.depth + 1,
        parentId: d.parentId ?? sectionId(d.id),
      })),
    );
    const ids = [tasks.database.id, books.database.id];
    expect(await definitions(reopened, ids)).toEqual(await definitions(vault, ids));
    // The bridge takes the folder as it is: nothing rewritten on open.
    const onDisk = snapshot(copy, { lydie: true });
    const exported = Object.fromEntries(
      Object.entries(files)
        .filter(([path]) => !path.endsWith("/"))
        .map(([path, data]) => [
          path,
          typeof data === "string" ? data : new TextDecoder().decode(data),
        ]),
    );
    expect(onDisk).toEqual(exported);
  });

  test("links to attachments by id point at the exported files", async () => {
    const folder = fixtureVault({});
    const vault = await openTestVault(folder);
    const ops = vault.runtime.ops;
    const ws = vault.workspaceId;
    const projects = await ops.doc.create({ workspaceId: ws, title: "Projects" });
    const chart = await addAttachment(vault.runtime, vault.blob, {
      workspaceId: ws,
      documentId: null,
      filename: "chart 1.png",
      contentType: "image/png",
      data: new TextEncoder().encode("CHART"),
    });
    const api = `https://api.lydie.co/v1/attachments/${chart.id}/content?expires=1&sig=x`;
    const missing = "attachment:01900000-0000-0000-0000-00000000001f";
    // As a hosted body may have them: by id, by API URL; in code, and to a file that is not
    // exported, they stay.
    const body = [
      `![Chart](attachment:${chart.id}) and [the chart](${api}).`,
      `![[attachment:${chart.id}]]`,
      `\`\`\`\n![Chart](attachment:${chart.id})\n\`\`\``,
      `![Gone](${missing})`,
      "",
    ].join("\n\n");
    const plan = await ops.doc.create({
      workspaceId: ws,
      parentId: projects.id,
      title: "Plan",
      markdown: body,
    });
    await vault.bridge.idle();

    const files = await collect(vault, { rewriteLinks });
    const exported = files["Projects/Plan.md"] as string;
    expect(exported).toBe(
      `---\nid: ${plan.id}\n---\n` +
        [
          "![Chart](../attachments/chart%201.png) and [the chart](../attachments/chart%201.png).",
          "![[attachments/chart 1.png]]",
          `\`\`\`\n![Chart](attachment:${chart.id})\n\`\`\``,
          `![Gone](${missing})`,
          "",
        ].join("\n\n"),
    );
    // Every rewritten link names a file in the export.
    for (const link of extract(exported).links) {
      if (link.target.startsWith("attachment:")) continue;
      const path =
        link.kind === "embed" ? link.target : join("Projects", link.target).replaceAll("\\", "/");
      expect(Object.keys(files)).toContain(path);
    }
    // Without the rewriter (or with nothing to rewrite) the note is the vault's file.
    expect((await collect(vault))["Projects/Plan.md"]).toBe(
      readFileSync(join(folder, "Projects/Plan.md"), "utf8"),
    );

    // Opened as a vault: the same document, with the links that now resolve, and the file.
    const copy = join(tempDir(), "copy");
    for (const [path, data] of Object.entries(files)) writeFixture(copy, path, data);
    const reopened = await openTestVault(copy);
    const doc = await reopened.store.getDoc(plan.id, { includeBody: true });
    expect(`---\nid: ${plan.id}\n---\n${doc?.body?.markdown}`).toBe(exported);
    const attachments = await reopened.runtime.ops.attachment.list({ workspaceId: ws });
    expect(attachments.attachments.map((a) => [a.id, a.filename])).toEqual([
      [chart.id, "chart 1.png"],
    ]);
  });

  test("frontmatter is written as @lydie/markdown writes new files", () => {
    const values = [
      { id: "01900000-0000-0000-0000-00000000000a", title: "x" },
      { tags: ["a", "b c"], n: 1.5, ok: true, none: null, empty: [] },
      { quote: 'say "hi": now', multi: "one\ntwo", date: "2026-11-15", colon: "a: b", hash: "#x" },
      { "key with space": "v", emoji: "🗺️", long: "x".repeat(200) },
    ];
    for (const v of values)
      expect(frontmatterBlock(v)).toBe(serialize({ type: "doc", content: [] }, v));
  });
});
