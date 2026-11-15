// Databases on disk: `<Folder>/<Folder>.base` and row frontmatter, both ways.
import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import type { DatabaseDefinition } from "@lydie/contract";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import {
  cleanup,
  fixtureVault,
  hashes,
  openTestVault,
  snapshot,
  workspaceOf,
} from "./test-utils.ts";
import type { Vault } from "./vault.ts";

afterEach(cleanup);

const read = (folder: string, path: string) => readFileSync(join(folder, path), "utf8");

async function idOf(vault: Vault, title: string): Promise<string> {
  const tree = await vault.store.listTree(vault.workspaceId, { includeDeleted: true });
  const found = tree.find((t) => t.title === title);
  if (!found) throw new Error(`No document "${title}"`);
  return found.id;
}

// A database's definition without timestamps and sort keys, for comparisons.
async function definitionOf(vault: Vault, id: string) {
  const def = (await vault.runtime.ops.database.get({ id })) as DatabaseDefinition;
  return {
    config: def.database.config,
    properties: def.properties.map(({ id, name, type, key, config }) => ({
      id,
      name,
      type,
      key,
      config,
    })),
    views: def.views.map(({ id, name, type, config }) => ({ id, name, type, config })),
  };
}

// Two databases: Books, and Tasks with a select, a number and a relation to Books, two views.
async function seed(vault: Vault) {
  const ops = vault.runtime.ops;
  const ws = vault.workspaceId;
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
  const points = await ops.database.addProperty({
    databaseId: tasks.database.id,
    name: "Points",
    type: "number",
  });
  const book = await ops.database.addProperty({
    databaseId: tasks.database.id,
    name: "Book",
    type: "relation",
    config: { relation: { databaseId: books.database.id } },
  });
  await ops.database.createView({ databaseId: tasks.database.id, name: "Board", type: "board" });
  const read1 = await ops.database.createRow({
    databaseId: tasks.database.id,
    title: "Read it",
    values: { [status.id]: "Todo", [points.id]: 3, [book.id]: [dune.id] },
  });
  const write = await ops.database.createRow({ databaseId: tasks.database.id, title: "Write it" });
  await ops.database.moveRow({ rowId: write.id, beforeId: read1.id });
  return { books, dune, tasks, status, points, book, read: read1, write };
}

describe("databases created in Lydie", () => {
  test("live as a folder with <Folder>.base and rows whose frontmatter holds the values", async () => {
    const folder = fixtureVault({ "Home.md": "Embedded: ![[Tasks.base]]\n" });
    const vault = await openTestVault(folder);
    const s = await seed(vault);
    expect(existsSync(join(folder, "Tasks.md"))).toBe(false);
    const base = parseYaml(read(folder, "Tasks/Tasks.base")) as {
      filters: unknown;
      views: { name: string }[];
      lydie: { id: string };
    };
    expect(base.lydie.id).toBe(s.tasks.database.id);
    expect(JSON.stringify(base.filters)).toContain('file.inFolder(\\"Tasks\\")');
    expect(base.views.map((v) => v.name)).toEqual([s.tasks.views[0]!.name, "Board"]);
    const row = read(folder, "Tasks/Read it.md");
    expect(row).toContain("Status: Todo\n");
    expect(row).toContain("Points: 3\n");
    expect(row).toContain('Book:\n  - "[[Books/Dune]]"\n');
    // The database stores ids; the file stores links.
    const doc = (await vault.store.getDoc(s.read.id))!.document;
    expect(doc.properties.Book).toEqual([s.dune.id]);
    // Manual row order is recorded.
    expect(JSON.parse(read(folder, ".lydie/order.json")).Tasks).toEqual(["Write it", "Read it"]);
  });

  test("the .base file is only rewritten when it changes", async () => {
    const folder = fixtureVault({});
    const vault = await openTestVault(folder);
    const s = await seed(vault);
    const before = statSync(join(folder, "Tasks/Tasks.base")).mtimeMs;
    await new Promise((r) => setTimeout(r, 20));
    await vault.runtime.ops.database.setValues({
      databaseId: s.tasks.database.id,
      rowIds: [s.read.id],
      set: { [s.points.id]: 5 },
    });
    await vault.bridge.rescan([""]);
    expect(statSync(join(folder, "Tasks/Tasks.base")).mtimeMs).toBe(before);
    expect(read(folder, "Tasks/Read it.md")).toContain("Points: 5\n");
  });

  test("renaming a database renames its folder and .base and rewrites embeds and relation links", async () => {
    const folder = fixtureVault({
      "Home.md": "Embedded: ![[Books.base]] and ![[Books.base#Table]]\n",
    });
    const vault = await openTestVault(folder);
    const s = await seed(vault);
    await vault.runtime.ops.doc.rename({ id: s.books.database.id, title: "Library" });
    expect(readdirSync(join(folder, "Library")).sort()).toEqual(["Dune.md", "Library.base"]);
    expect(existsSync(join(folder, "Books"))).toBe(false);
    expect(read(folder, "Library/Library.base")).toContain('file.inFolder("Library")');
    expect(read(folder, "Home.md")).toBe(
      "Embedded: ![[Library.base]] and ![[Library.base#Table]]\n",
    );
    expect(read(folder, "Tasks/Read it.md")).toContain('"[[Library/Dune]]"');
    await vault.runtime.ops.doc.rename({ id: s.dune.id, title: "Dune Messiah" });
    expect(read(folder, "Tasks/Read it.md")).toContain('"[[Library/Dune Messiah]]"');
  });

  test("turning a database into a page moves its .base to the trash; restoring writes it again", async () => {
    const folder = fixtureVault({});
    const vault = await openTestVault(folder);
    const s = await seed(vault);
    await vault.runtime.ops.database.delete({ id: s.books.database.id });
    expect(existsSync(join(folder, "Books/Books.base"))).toBe(false);
    expect(existsSync(join(folder, ".trash/Books/Books.base"))).toBe(true);
    expect(existsSync(join(folder, "Books/Dune.md"))).toBe(true);
    await vault.runtime.ops.database.restore({ id: s.books.database.id });
    expect(existsSync(join(folder, "Books/Books.base"))).toBe(true);
  });
});

describe(".base files from disk", () => {
  const OBSIDIAN_BASE =
    'filters:\n  and:\n    - file.inFolder("Reading")\nproperties:\n  note.author:\n    displayName: Author\n' +
    "views:\n  - type: table\n    name: All books\n    order:\n      - file.name\n      - author\n      - rating\n" +
    "  - type: cards\n    name: Gallery\n";

  test("a folder with <Folder>.base becomes a database; opening and closing writes nothing", async () => {
    const folder = fixtureVault({
      "Reading/Reading.base": OBSIDIAN_BASE,
      "Reading/Dune.md": "---\nauthor: Frank Herbert\nrating: 5\n---\nA desert.\n",
      "Reading/Emma.md": "---\nauthor: Jane Austen\nrating: 4\n---\n",
      "Other.base": "views:\n  - type: table\n    name: Everything\n",
      "Home.md": "![[Reading.base]]\n",
    });
    const before = hashes(folder);
    const vault = await openTestVault(folder);
    const id = await idOf(vault, "Reading");
    const def = await definitionOf(vault, id);
    expect(def.views.map((v) => [v.name, v.type])).toEqual([
      ["All books", "table"],
      // Lydie has no gallery: a Bases cards view opens as a table.
      ["Gallery", "table"],
    ]);
    expect(def.properties.map((p) => p.name)).toEqual(expect.arrayContaining(["Author"]));
    const result = await vault.runtime.ops.database.query({ databaseId: id });
    expect(result.rows.map((r) => r.title).sort()).toEqual(["Dune", "Emma"]);
    // The root-level Other.base is not a database: no folder carries it.
    expect(
      (await vault.runtime.ops.database.list({ workspaceId: vault.workspaceId })).databases,
    ).toHaveLength(1);
    await vault.close();
    expect(hashes(folder)).toEqual(before);

    // Reopening (database kept) and rebuilding (database deleted) give the same definition.
    const again = await openTestVault(folder);
    expect(await definitionOf(again, id)).toEqual(def);
    await again.close();
    expect(hashes(folder)).toEqual(before);
  });

  test("edits made in Obsidian win, deleting the .base turns the folder back into pages", async () => {
    const folder = fixtureVault({});
    const vault = await openTestVault(folder);
    const s = await seed(vault);
    const path = join(folder, "Tasks/Tasks.base");
    const yaml = parseYaml(read(folder, "Tasks/Tasks.base")) as { views: { name: string }[] };
    yaml.views[1]!.name = "Kanban";
    writeFileSync(path, stringifyYaml(yaml));
    await vault.bridge.rescan(["Tasks/Tasks.base"]);
    const def = await definitionOf(vault, s.tasks.database.id);
    expect(def.views.map((v) => v.name)).toEqual([s.tasks.views[0]!.name, "Kanban"]);
    // Ids survive (the lydie block is still there).
    expect(def.views[1]!.id).toBe((await definitionOf(vault, s.tasks.database.id)).views[1]!.id);

    rmSync(path);
    await vault.bridge.rescan(["Tasks/Tasks.base"]);
    expect(
      (await vault.runtime.ops.database.list({ workspaceId: vault.workspaceId })).databases.map(
        (d) => d.title,
      ),
    ).toEqual(["Books"]);
    expect(existsSync(join(folder, "Tasks/Read it.md"))).toBe(true);
  });

  test("a database folder renamed by another program keeps its database and gets its .base renamed", async () => {
    const folder = fixtureVault({});
    const vault = await openTestVault(folder);
    const s = await seed(vault);
    renameSync(join(folder, "Tasks"), join(folder, "Chores"));
    await vault.bridge.rescan(["Tasks", "Chores"]);
    expect(await idOf(vault, "Chores")).toBe(s.tasks.database.id);
    expect(readdirSync(join(folder, "Chores")).filter((n) => n.endsWith(".base"))).toEqual([
      "Chores.base",
    ]);
    expect(read(folder, "Chores/Chores.base")).toContain('file.inFolder("Chores")');
    expect((await definitionOf(vault, s.tasks.database.id)).views).toHaveLength(2);
  });
});

describe("rebuild rule with databases", () => {
  test("deleting the database file and reopening gives identical databases, values and order", async () => {
    const folder = fixtureVault({ "Home.md": "![[Tasks.base]]\n" });
    const vault = await openTestVault(folder);
    const s = await seed(vault);
    await vault.runtime.ops.database.renameView({ id: s.tasks.views[0]!.id, name: "Everything" });
    const ids = [s.books.database.id, s.tasks.database.id];
    const defs = await Promise.all(ids.map((id) => definitionOf(vault, id)));
    // A database in the trash comes back from the rebuild as a database (LYD-214).
    await vault.runtime.ops.doc.delete({ id: s.books.database.id });
    const ws = await workspaceOf(vault);
    const rows = await vault.runtime.ops.database.query({ databaseId: s.tasks.database.id });
    const disk = snapshot(folder, { lydie: true });
    await vault.close();
    rmSync(vault.databasePath);

    const rebuilt = await openTestVault(folder);
    expect(await definitionOf(rebuilt, s.tasks.database.id)).toEqual(defs[1]!);
    expect(await workspaceOf(rebuilt)).toEqual(ws);
    const rebuiltRows = await rebuilt.runtime.ops.database.query({
      databaseId: s.tasks.database.id,
    });
    expect(rebuiltRows.rows.map((r) => [r.id, r.title, r.properties])).toEqual(
      rows.rows.map((r) => [r.id, r.title, r.properties]),
    );
    expect(snapshot(folder, { lydie: true })).toEqual(disk);
    await rebuilt.runtime.ops.doc.restore({ id: s.books.database.id });
    expect(await definitionOf(rebuilt, s.books.database.id)).toEqual(defs[0]!);
    expect(existsSync(join(folder, "Books/Books.base"))).toBe(true);
  });

  test("relations follow a database folder that got another id (indexed without .lydie/ids.json)", async () => {
    const folder = fixtureVault({});
    const vault = await openTestVault(folder);
    const s = await seed(vault);
    await vault.close();
    rmSync(vault.databasePath);
    // As a copy without `.lydie/`, or a folder indexed while another Lydie was still writing it:
    // the folders get ids derived from their paths, not the ones the .base files use.
    rmSync(join(folder, ".lydie/ids.json"));

    const reopened = await openTestVault(folder);
    const books = await idOf(reopened, "Books");
    const tasks = await idOf(reopened, "Tasks");
    expect(books).not.toBe(s.books.database.id);
    const def = (await reopened.runtime.ops.database.get({ id: tasks })) as DatabaseDefinition;
    const relation = def.properties.find((p) => p.id === s.book.id)!;
    expect(relation.config.relation?.databaseId).toBe(books);
    // The .base file is corrected, so the next open agrees without looking again.
    expect(read(folder, "Tasks/Tasks.base")).toContain(`databaseId: ${books}`);
    const rows = await reopened.runtime.ops.database.query({ databaseId: tasks });
    const row = rows.rows.find((r) => r.title === "Read it")!;
    expect(row.properties.Book).toEqual([s.dune.id]);
    // The type change from the bug report: undo restores the relation.
    await reopened.runtime.ops.database.changePropertyType({ id: s.book.id, type: "status" });
    expect(await reopened.runtime.history.undo()).toBe(true);
  });

  test("relations follow a database whose folder arrives after the folder relating to it", async () => {
    const folder = fixtureVault({});
    const vault = await openTestVault(folder);
    const s = await seed(vault);
    await vault.close();
    rmSync(vault.databasePath);
    rmSync(join(folder, ".lydie/ids.json"));
    // Tasks is read while Books is not there yet (another program still writing the folder).
    renameSync(join(folder, "Books"), join(folder, "..", `Books-${s.books.database.id}`));

    const reopened = await openTestVault(folder);
    const tasks = await idOf(reopened, "Tasks");
    renameSync(join(folder, "..", `Books-${s.books.database.id}`), join(folder, "Books"));
    await reopened.bridge.rescan();
    await reopened.bridge.idle();
    const books = await idOf(reopened, "Books");
    const def = (await reopened.runtime.ops.database.get({ id: tasks })) as DatabaseDefinition;
    expect(def.properties.find((p) => p.id === s.book.id)!.config.relation?.databaseId).toBe(books);
    expect(read(folder, "Tasks/Tasks.base")).toContain(`databaseId: ${books}`);
    // The row read while Books was missing kept its link as written; it resolves now.
    const rows = await reopened.runtime.ops.database.query({ databaseId: tasks });
    expect(rows.rows.find((r) => r.title === "Read it")!.properties.Book).toEqual([s.dune.id]);
    expect(read(folder, "Tasks/Read it.md")).toContain('Book:\n  - "[[Books/Dune]]"\n');
  });

  test("two-way relations meet again when one side's folder arrives later", async () => {
    const folder = fixtureVault({});
    const vault = await openTestVault(folder);
    const ops = vault.runtime.ops;
    const books = await ops.database.create({ workspaceId: vault.workspaceId, title: "Books" });
    const tasks = await ops.database.create({ workspaceId: vault.workspaceId, title: "Tasks" });
    const book = await ops.database.addProperty({
      databaseId: tasks.database.id,
      name: "Book",
      type: "relation",
      reverseName: "Tasks",
      config: { relation: { databaseId: books.database.id, twoWay: true } },
    });
    const reverseId = book.config.relation!.reversePropertyId!;
    await vault.close();
    rmSync(vault.databasePath);
    rmSync(join(folder, ".lydie/ids.json"));
    const away = join(folder, "..", `Books-${books.database.id}`);
    renameSync(join(folder, "Books"), away);

    const reopened = await openTestVault(folder);
    // An edit writes Tasks.base with this folder's id: the id Books' file uses for Tasks is gone.
    await reopened.runtime.ops.database.renameView({ id: tasks.views[0]!.id, name: "Everything" });
    await reopened.bridge.idle();
    expect(read(folder, "Tasks/Tasks.base")).not.toContain(tasks.database.id);
    renameSync(away, join(folder, "Books"));
    await reopened.bridge.rescan();
    await reopened.bridge.idle();
    const tasksId = await idOf(reopened, "Tasks");
    const booksId = await idOf(reopened, "Books");
    const target = async (db: string, property: string) =>
      ((await reopened.runtime.ops.database.get({ id: db })) as DatabaseDefinition).properties.find(
        (p) => p.id === property,
      )!.config.relation?.databaseId;
    expect(await target(tasksId, book.id)).toBe(booksId);
    expect(await target(booksId, reverseId)).toBe(tasksId);
  });
});
