// Indexing and write-path benchmarks: bun scripts/bench.ts [--notes=10000] [--only=write]
//   - N generated notes (frontmatter, headings, lists, links) in 100 folders: cold open, warm
//     reopen with nothing changed, reopen after 1% changed.
//   - the Obsidian help vault (all languages) if @lydie/markdown's corpus cache is downloaded.
//   - write path: an editor save of a 2,000-block note, a value set on 500 database rows, a burst
//     of renames, body saves of a small note (version history).
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parse } from "@lydie/markdown";
import type { Node } from "prosemirror-model";

import { openVault, serveVault } from "../src/index.ts";
import type { Vault } from "../src/index.ts";

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v = "true"] = a.replace(/^--/, "").split("=");
    return [k!, v];
  }),
);
const notes = Number(args.get("notes") ?? 10_000);
const work = mkdtempSync(join(tmpdir(), "lydie-bench-"));

function note(i: number): string {
  const fm =
    i % 3 === 0 ? `---\ntags: [t${i % 17}, bench]\nstatus: ${i % 2 ? "draft" : "done"}\n---\n` : "";
  return (
    `${fm}# Note ${i}\n\nSome text about note ${i}, linking to [[Note ${(i * 7) % notes}]] and ` +
    `[[Note ${(i * 13) % notes}#Section]].\n\n## Section\n\n- item one\n- item **two** with \`code\`\n` +
    `- [ ] a task #tag${i % 11}\n\n> A quote ^q${i}\n\n` +
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut " +
    "labore et dolore magna aliqua.\n"
  );
}

async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  const result = await fn();
  console.log(`${label.padEnd(44)} ${(performance.now() - t0).toFixed(0).padStart(7)} ms`);
  return result;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function line(label: string, ms: number, extra = ""): void {
  console.log(`${label.padEnd(44)} ${ms.toFixed(1).padStart(7)} ms${extra ? `  ${extra}` : ""}`);
}

// A note of `blocks` top-level blocks (headings, paragraphs, lists), about 100 bytes each.
function bigNote(blocks: number): string {
  const out: string[] = [];
  for (let i = 0; i < blocks; i++) {
    if (i % 20 === 0) out.push(`## Section ${i / 20}`);
    else if (i % 7 === 0) out.push(`- item ${i} with **bold**\n- another item [[Note ${i}]]`);
    else out.push(`Paragraph ${i}: some prose with a [link](https://example.com) and \`code\`.`);
  }
  return `---\ntags: [bench]\n---\n${out.join("\n\n")}\n`;
}

async function writePath(): Promise<void> {
  const folder = join(work, "write");
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "Big.md"), bigNote(2000));
  writeFileSync(join(folder, "Small.md"), "A small note.\n");
  writeFileSync(join(folder, "Target.md"), "Renamed often.\n");
  for (let i = 0; i < 20; i++) writeFileSync(join(folder, `Linker ${i}.md`), "See [[Target]].\n");
  const vault: Vault = await openVault({
    folder,
    databasePath: join(work, "write.sqlite"),
    watch: false,
  });
  try {
    const ws = vault.workspaceId;
    const ops = vault.runtime.ops;
    const idOf = (path: string) => vault.bridge.idOf(path)!;
    console.log("write path");

    // Editor save through the vault service, as a folder window does: an update 150 ms after
    // typing, then the save.
    const handlers = serveVault(vault);
    const opened = await handlers.requests.openDocument({ id: idOf("Big.md") });
    let doc: Node = parse(opened.source).doc;
    const schema = doc.type.schema;
    let seq = 0;
    // Whole documents (before patches), then what a folder window sends: the changed blocks.
    for (const patched of [false, true]) {
      const updates: number[] = [];
      const saves: number[] = [];
      let bytes = 0;
      for (let i = 0; i < 12; i++) {
        const k = 1 + ((i * 37) % (doc.childCount - 2));
        const block = schema.nodes.paragraph!.create(null, schema.text(`Edited ${patched} ${i}.`));
        doc = doc.copy(doc.content.replaceChild(k, block));
        const count = doc.childCount;
        const update =
          patched && i > 0
            ? { type: "patch", base: seq, from: k, to: k + 1, content: [block.toJSON()], count }
            : doc.toJSON();
        bytes = JSON.stringify(update).length;
        let t0 = performance.now();
        const session = opened.session;
        await handlers.requests.updateDocument({ session, doc: update, seq: ++seq });
        updates.push(performance.now() - t0);
        // Nothing changed since the update: an empty patch.
        const saved = patched
          ? { type: "patch", base: seq, from: count, to: count, content: [], count }
          : doc.toJSON();
        t0 = performance.now();
        await handlers.requests.saveDocument({ session, doc: saved, seq: ++seq });
        saves.push(performance.now() - t0);
        bytes += JSON.stringify(saved).length;
      }
      const how = patched ? "patches" : "whole document";
      line(`editor update, 2k blocks, ${how}`, median(updates));
      line(`editor save, 2k blocks, ${how}`, median(saves), `${bytes} bytes per pause`);
    }
    handlers.close();

    // A value on 500 database rows (property-only writes).
    const db = await ops.database.create({ workspaceId: ws, title: "Tasks" });
    const status = await ops.database.addProperty({
      databaseId: db.database.id,
      name: "Status",
      type: "select",
      config: {
        options: [
          { name: "Todo", color: "gray" },
          { name: "Done", color: "green" },
        ],
      },
    });
    const rows = await ops.database.writeRows({
      databaseId: db.database.id,
      rows: Array.from({ length: 500 }, (_, i) => ({ title: `Task ${i}`, values: {} })),
    });
    const rowIds = rows.rows.map((r) => r.id);
    for (const value of ["Done", "Todo"]) {
      const t0 = performance.now();
      await ops.database.setValues({
        databaseId: db.database.id,
        rowIds,
        set: { [status.id]: value },
      });
      line(`database.setValues, 500 rows (${value})`, performance.now() - t0);
    }

    // Typing a title: one rename per keystroke, not awaited one by one; 20 files link to it.
    const target = idOf("Target.md");
    const word = "Target renamed";
    let t0 = performance.now();
    await Promise.all(
      Array.from(word, (_, i) => ops.doc.rename({ id: target, title: word.slice(0, i + 1) })),
    );
    line(`${word.length} renames in a burst, 20 backlinks`, performance.now() - t0);

    // Body saves of a small note (each records a version).
    const small = idOf("Small.md");
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      t0 = performance.now();
      await ops.doc.updateBody(
        { id: small, markdown: `A small note, edit ${i}.\n` },
        { history: false },
      );
      times.push(performance.now() - t0);
    }
    line("doc.updateBody, small note (median)", median(times));
  } finally {
    await vault.close();
  }
}

async function indexing(): Promise<void> {
  const folder = join(work, "generated");
  for (let i = 0; i < notes; i++) {
    const dir = join(folder, `Folder ${i % 100}`);
    if (i < 100) mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `Note ${i}.md`), note(i));
  }
  const databasePath = join(work, "generated.sqlite");
  console.log(`${notes} generated notes`);
  let vault = await time("cold open (empty database)", () =>
    openVault({ folder, databasePath, watch: false }),
  );
  console.log("  ", vault.index);
  await vault.close();
  vault = await time("reopen, nothing changed", () =>
    openVault({ folder, databasePath, watch: false }),
  );
  await vault.close();
  for (let i = 0; i < notes; i += 100) {
    writeFileSync(join(folder, `Folder ${i % 100}`, `Note ${i}.md`), `${note(i)}\nchanged\n`);
  }
  vault = await time("reopen, 1% changed", () => openVault({ folder, databasePath, watch: false }));
  console.log("  ", vault.index);
  await vault.close();

  // As the desktop app opens folders: the database serves windows while the folder is indexed.
  for (const [label, fresh] of [
    ["cold open", true],
    ["reopen, 1% changed", false],
  ] as const) {
    if (fresh) rmSync(databasePath, { force: true });
    else {
      for (let i = 50; i < notes; i += 100) {
        writeFileSync(join(folder, `Folder ${i % 100}`, `Note ${i}.md`), `${note(i)}\nagain\n`);
      }
    }
    const t0 = performance.now();
    vault = await openVault({ folder, databasePath, watch: false, indexInBackground: true });
    line(`${label}, background: served`, performance.now() - t0);
    await vault.indexed;
    line(`${label}, background: indexed`, performance.now() - t0);
    await vault.close();
  }

  const help = join(import.meta.dirname, "../../markdown/.cache/obsidian-help");
  if (existsSync(help)) {
    for (const [label, source] of [
      ["help vault (en)", join(help, "en")],
      ["help vault (all languages)", help],
    ] as const) {
      const copy = join(work, label.replace(/\W+/g, "-"));
      cpSync(source, copy, { recursive: true });
      const db = join(work, `${label.replace(/\W+/g, "-")}.sqlite`);
      vault = await time(`${label}: cold open`, () =>
        openVault({ folder: copy, databasePath: db, watch: false }),
      );
      console.log("  ", vault.index);
      await vault.close();
      vault = await time(`${label}: reopen`, () =>
        openVault({ folder: copy, databasePath: db, watch: false }),
      );
      await vault.close();
    }
  } else {
    console.log("help vault not downloaded (bun --filter=@lydie/markdown run fetch-corpus)");
  }
}

try {
  await writePath();
  if (args.get("only") !== "write") await indexing();
} finally {
  rmSync(work, { recursive: true, force: true });
}
