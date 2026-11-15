// Performance numbers: bun scripts/bench.ts
//   - the seed's 2,000-block document (what the app opens in benchmarks): first and warm parse,
//     serialize, no-op save
//   - parse + no-op save for every file of the Obsidian help vault (if downloaded)
//   - a ~5k-line file: parse, no-op save, one-block edit save, extract, reconcile
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

import { Fragment } from "prosemirror-model";
import type { Node } from "prosemirror-model";

import { longMarkdown } from "../../../scripts/seed/text.ts";
import { extract, parse, reconcile, save, schema, serialize } from "../src/index";

const root = join(dirname(new URL(import.meta.url).pathname), "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

function time<T>(label: string, fn: () => T, runs = 1): T {
  let result!: T;
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) result = fn();
  const ms = (performance.now() - t0) / runs;
  console.log(`${label.padEnd(48)} ${ms.toFixed(1).padStart(8)} ms`);
  return result;
}

// Median of `runs` after one warm-up.
function median(label: string, fn: () => unknown, runs = 15) {
  fn();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  console.log(`${label.padEnd(48)} ${times[runs >> 1]!.toFixed(1).padStart(8)} ms`);
}

const seedDoc = longMarkdown(2000);
console.log(`seed document: 2000 blocks, ${(seedDoc.length / 1e3).toFixed(0)} KB`);
const seedParse = time("first parse (cold)", () => parse(seedDoc));
median("parse", () => parse(seedDoc));
median("serialize", () => serialize(seedParse.doc, seedParse.properties));
median("no-op save", () => save({ original: seedParse, doc: seedParse.doc }));
console.log();

const vault = join(root, ".cache/obsidian-help");
let large = "";
if (existsSync(vault)) {
  const files = walk(vault).map((p) => readFileSync(p, "utf8"));
  const bytes = files.reduce((n, f) => n + f.length, 0);
  console.log(`help vault: ${files.length} files, ${(bytes / 1e6).toFixed(1)} MB`);
  const parses = time("parse all", () => files.map(parse));
  time("no-op save all (parse reused)", () => parses.map((p) => save({ original: p, doc: p.doc })));
  time("extract all", () => files.map(extract));
  // Concatenate English pages into a ~5k-line document.
  for (const p of walk(join(vault, "en"))) {
    const text = readFileSync(p, "utf8").replace(/^---[\s\S]*?\n---\n/, "");
    large += text + "\n\n";
    if (large.split("\n").length >= 5000) break;
  }
} else {
  console.log("help vault not downloaded (bun run fetch-corpus); using a synthetic large file");
  const chunk =
    "# Heading\n\nSome *text* with [[Link]] and `code`.\n\n- item\n- [ ] task\n\n> [!note] Callout\n> body\n\n";
  while (large.split("\n").length < 5000) large += chunk;
}

const lines = large.split("\n").length;
console.log(`\nlarge file: ${lines} lines, ${(large.length / 1e3).toFixed(0)} KB`);
const p = time("parse", () => parse(large), 5);
console.log(`  ${p.doc.childCount} top-level blocks`);
time("no-op save", () => save({ original: p, doc: p.doc }), 5);
const children: Node[] = [];
p.doc.forEach((c) => children.push(c));
const mid = Math.floor(children.length / 2);
children[mid] = schema.nodes.paragraph.create(null, schema.text("edited"));
const edited = p.doc.type.create(null, Fragment.fromArray(children));
time("one-block edit save (incl. verification)", () => save({ original: p, doc: edited }), 5);
time("extract", () => extract(large), 5);
const disk = large.replace(/\n\n/, "\n\nNew paragraph from disk.\n\n");
time("reconcile (disk + editor edits)", () => reconcile({ base: p, disk, doc: edited }), 5);
