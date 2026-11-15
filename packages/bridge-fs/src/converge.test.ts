// Randomized: operations and edits by "another program" interleave, sometimes before the bridge has
// seen the other side's change. Afterwards the database and the folder agree and every edit made
// by either side is somewhere on disk (in its document or in a conflict copy).
import { afterEach, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { readContent } from "./content.ts";
import { cleanup, fixtureVault, openTestVault } from "./test-utils.ts";
import type { Vault } from "./vault.ts";

afterEach(cleanup);

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mdFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      if (d.name.startsWith(".")) continue;
      const path = join(dir, d.name);
      if (d.isDirectory()) walk(path);
      else if (d.name.endsWith(".md")) out.push(relative(root, path));
    }
  };
  walk(root);
  return out;
}

async function run(seed: number, steps: number, watch: boolean) {
  const random = rng(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
  const folder = fixtureVault({
    "One.md": "one\n",
    "Two.md": "---\ntags: [a]\n---\ntwo\n",
    "Folder/Three.md": "three\n",
    "Folder/Four.md": "four\r\nwith crlf\r\n",
  });
  const vault: Vault = await openTestVault(folder, {
    onError: (e) => console.error(e),
    watch: watch ? { debounceMs: 5, renameWindowMs: 40 } : false,
  });
  const ws = vault.workspaceId;
  const tokens: string[] = [];
  // A database whose rows and .base file both sides change.
  const db = await vault.runtime.ops.database.create({ workspaceId: ws, title: "Tasks" });
  const noteProp = await vault.runtime.ops.database.addProperty({
    databaseId: db.database.id,
    name: "Note",
    type: "text",
  });
  const rows = async () =>
    (await vault.store.ports.db.read((tx) => tx.docs.children(ws, db.database.id))).map(
      (d) => d.id,
    );
  const live = async () =>
    (await vault.store.listTree(ws)).filter((d) => vault.bridge.pathOf(d.id)?.endsWith(".md"));

  for (let i = 0; i < steps; i++) {
    const token = `tok${seed}x${i}`;
    const action = pick([
      "opAppend",
      "opAppend",
      "diskAppend",
      "diskAppend",
      "opRename",
      "diskRename",
      "opCreate",
      "diskCreate",
      "opMove",
      "rescan",
      "opRowValue",
      "opRowCreate",
      "diskBaseEdit",
    ]);
    const docs = await live();
    const doc = docs.length ? pick(docs) : null;
    switch (action) {
      case "opAppend": {
        if (!doc) break;
        // Built from the database's copy, which may not have seen a disk edit yet.
        const body = (await vault.store.getDoc(doc.id))?.body?.markdown ?? "";
        await vault.runtime.ops.doc.updateBody({ id: doc.id, markdown: `${body}\n${token}\n` });
        tokens.push(token);
        break;
      }
      case "diskAppend": {
        if (!doc) break;
        const path = join(folder, vault.bridge.pathOf(doc.id)!);
        if (!existsSync(path)) break;
        writeFileSync(path, `${readFileSync(path, "utf8")}\n${token}\n`);
        tokens.push(token);
        break;
      }
      case "opRename":
        if (doc) await vault.runtime.ops.doc.rename({ id: doc.id, title: `R${i}` });
        break;
      case "diskRename": {
        if (!doc) break;
        const path = join(folder, vault.bridge.pathOf(doc.id)!);
        if (!existsSync(path)) break;
        const dir = random() < 0.5 ? folder : join(folder, "Folder");
        mkdirSync(dir, { recursive: true });
        const target = join(dir, `D${i}.md`);
        if (!existsSync(target)) renameSync(path, target);
        break;
      }
      case "opCreate":
        await vault.runtime.ops.doc.create({
          workspaceId: ws,
          title: `C${i}`,
          markdown: `${token}\n`,
        });
        tokens.push(token);
        break;
      case "diskCreate":
        writeFileSync(join(folder, `F${i}.md`), `${token}\n`);
        tokens.push(token);
        break;
      case "opMove": {
        if (!doc) break;
        const folders = (await vault.store.listTree(ws)).filter((d) => d.title === "Folder");
        const parentId = random() < 0.5 || !folders[0] ? null : folders[0].id;
        if (parentId !== doc.id) await vault.runtime.ops.doc.move({ id: doc.id, parentId });
        break;
      }
      case "opRowValue": {
        const ids = await rows();
        if (!ids.length) break;
        // Appended, so earlier values stay visible.
        const rowId = pick(ids);
        const current = (await vault.store.getDoc(rowId))?.document.properties.Note;
        await vault.runtime.ops.database.setValues({
          databaseId: db.database.id,
          rowIds: [rowId],
          set: { [noteProp.id]: typeof current === "string" ? `${current} ${token}` : token },
        });
        tokens.push(token);
        break;
      }
      case "opRowCreate":
        await vault.runtime.ops.database.createRow({
          databaseId: db.database.id,
          title: `Row${i}`,
          values: { [noteProp.id]: token },
        });
        tokens.push(token);
        break;
      case "diskBaseEdit": {
        const path = join(folder, "Tasks/Tasks.base");
        if (!existsSync(path)) break;
        const yaml = parseYaml(readFileSync(path, "utf8")) as { views: { name: string }[] };
        yaml.views[0]!.name = `View ${i}`;
        writeFileSync(path, stringifyYaml(yaml));
        break;
      }
      case "rescan":
        // With the watcher on, give it a moment instead.
        if (watch) await new Promise((r) => setTimeout(r, 20));
        else await vault.bridge.rescan([""]);
        break;
    }
  }
  await vault.bridge.rescan([""]);
  await vault.bridge.idle();

  // Nothing lost.
  const files = mdFiles(folder);
  const all = files.map((f) => readFileSync(join(folder, f), "utf8")).join("\n");
  const missing = tokens.filter((t) => !new RegExp(`\\b${t}\\b`).test(all));
  expect(missing).toEqual([]);

  // The database definition follows its .base file.
  const base = parseYaml(readFileSync(join(folder, "Tasks/Tasks.base"), "utf8")) as {
    views: { name: string }[];
  };
  const def = await vault.runtime.ops.database.get({ id: db.database.id });
  expect(def.views.map((v) => v.name)).toEqual(base.views.map((v) => v.name));

  // Database and folder agree.
  const docs = await vault.store.listTree(ws);
  const paths = new Set<string>();
  for (const d of docs) {
    const path = vault.bridge.pathOf(d.id)!;
    paths.add(path);
    if (!path.endsWith(".md")) continue;
    const content = readContent(readFileSync(join(folder, path), "utf8"));
    const row = await vault.store.getDoc(d.id);
    expect({ path, body: row?.body?.markdown, properties: row?.document.properties }).toEqual({
      path,
      body: content.body,
      properties: content.properties,
    });
    expect(d.title).toBe(path.slice(path.lastIndexOf("/") + 1, -3));
  }
  expect(files.filter((f) => !paths.has(f))).toEqual([]);
}

for (const seed of [1, 2, 3, 4]) {
  test(
    `operations and external edits converge without loss (seed ${seed})`,
    () => run(seed, 150, false),
    60_000,
  );
}

for (const seed of [5, 6]) {
  test(
    `... with the real watcher racing the operations (seed ${seed})`,
    () => run(seed, 150, true),
    60_000,
  );
}
