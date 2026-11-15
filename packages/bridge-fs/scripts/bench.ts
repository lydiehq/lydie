// Indexing benchmarks: bun scripts/bench.ts [--notes=10000] [--help-vault]
//   - N generated notes (frontmatter, headings, lists, links) in 100 folders: cold open, warm
//     reopen with nothing changed, reopen after 1% changed.
//   - the Obsidian help vault (all languages) if @lydie/markdown's corpus cache is downloaded.
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openVault } from "../src/index.ts";

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

try {
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
} finally {
  rmSync(work, { recursive: true, force: true });
}
