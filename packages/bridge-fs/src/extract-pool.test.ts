// Indexing many files extracts Markdown on other threads (extract-pool.ts): the result is the
// one extraction in this thread gives, and a thread that cannot start or fails changes nothing.
import { afterEach, expect, test } from "bun:test";
import { cpSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";

import { defaultExtractWorker } from "./extract-pool.ts";
import { cleanup, fixtureVault, openTestVault, tempDir, workspaceOf } from "./test-utils.ts";
import type { OpenVaultOptions } from "./vault.ts";

afterEach(cleanup);

const FIXTURES = join(import.meta.dirname, "../../markdown/fixtures/ofm");
const HELP_VAULT = join(import.meta.dirname, "../../markdown/.cache/obsidian-help");

// @lydie/markdown's fixtures (frontmatter oddities, BOM, CRLF, mixed line endings, tables,
// callouts, embeds, code) in a dozen folders, and notes that link to them and to each other.
function corpus(): Record<string, string | Uint8Array> {
  const files: Record<string, string | Uint8Array> = {};
  const fixtures = readdirSync(FIXTURES).filter((name) => name.endsWith(".md"));
  for (let folder = 0; folder < 12; folder++) {
    for (const name of fixtures) {
      const text = readFileSync(join(FIXTURES, name), "utf8");
      files[`Folder ${folder}/${name}`] =
        folder % 2 ? text : `${text}\n\nSee [[${name}]] ^f${folder}\n`;
    }
  }
  for (let i = 0; i < 60; i++) {
    const fm = i % 3 ? `---\ntags: [n${i % 5}]\nrelated: "[[Note ${(i + 1) % 60}]]"\n---\n` : "";
    files[`Notes/Note ${i}.md`] =
      `${fm}# Note ${i}\n\n[[Note ${(i * 7) % 60}#Section]] and ![[tables#^blk]] and ` +
      `[md](../Folder ${i % 12}/code.md). #tag/${i % 4}\n\n## Section\n\n- [ ] task ^t${i}\n\n` +
      `> [!note] Callout ${i}\n> with [[Missing ${i}]]\n\nÜnïcödé ${"text ".repeat(i)}\n`;
  }
  files["Notes/Latin-1.md"] = new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x0a]);
  return files;
}

// Everything the index wrote, ids included: documents, properties, bodies, links and blocks.
async function indexed(folder: string, options: Partial<OpenVaultOptions>) {
  const vault = await openTestVault(folder, options);
  const docs = await workspaceOf(vault);
  const blocks = await vault.store.ports.db.read(async (tx) =>
    Promise.all(docs.map(async (d) => ({ id: d.id, blocks: await tx.blocks!.list(d.id) }))),
  );
  await vault.close();
  return { report: vault.index, docs, blocks };
}

async function compare(folder: string, threads: OpenVaultOptions["extractWorker"]) {
  const here = await indexed(folder, { extractWorker: null });
  const pooled = await indexed(folder, { extractWorker: threads });
  expect(pooled.docs).toEqual(here.docs);
  expect(pooled.blocks).toEqual(here.blocks);
  expect(pooled.report.read).toBe(here.report.read);
  return here.report.read;
}

test("a first index on threads equals one in this thread", async () => {
  let started = 0;
  let answered = 0;
  const read = await compare(fixtureVault(corpus()), () => {
    started++;
    const worker = defaultExtractWorker();
    worker.on("message", () => answered++);
    return worker;
  });
  const jobs = Math.ceil(read / 100);
  expect(started).toBe(Math.max(0, Math.min(4, availableParallelism() - 1, jobs)));
  // Every job of 100 bodies was answered by a thread.
  expect(answered).toBe(started ? jobs : 0);
});

test("a few notes are extracted in this thread", async () => {
  let started = 0;
  const folder = fixtureVault({ "A.md": "# A\n\n[[B]]\n", "B.md": "b ^x\n", "C.md": "c\n" });
  const vault = await openTestVault(folder, {
    extractWorker: () => {
      started++;
      return defaultExtractWorker();
    },
  });
  expect(vault.index.read).toBe(3);
  expect(started).toBe(0);
});

test("without threads the index extracts in this thread, with the same result", async () => {
  const folder = fixtureVault(corpus());
  await compare(folder, () => {
    throw new Error("no threads here");
  });
  // A thread that starts and then fails (an entry that cannot load).
  await compare(folder, () => new Worker(join(tempDir(), "missing.js")));
});

test.skipIf(!existsSync(HELP_VAULT))("the help vault indexes the same on threads", async () => {
  const folder = join(tempDir(), "help");
  for (const language of ["en", "de"]) {
    cpSync(join(HELP_VAULT, language), join(folder, language), { recursive: true });
  }
  await compare(folder, defaultExtractWorker);
});
