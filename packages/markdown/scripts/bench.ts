// Performance numbers: bun scripts/bench.ts
//   - the seed's 2,000-block document (what the app opens in benchmarks): first and warm parse,
//     serialize, no-op save
//   - the app's save path on it: editor JSON in, save, then the index's extract of the saved text;
//     a session of saves with the last save as the original and with the opened text (stale), and
//     with the original as a string (a folder session, `toMarkdown(string)`)
//   - parse + no-op save for every file of the Obsidian help vault (if downloaded)
//   - a ~5k-line file: parse, no-op save, one-block edit save, extract, reconcile
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

import { Fragment } from "prosemirror-model";
import type { Node } from "prosemirror-model";

import { longMarkdown } from "../../../scripts/seed/text.ts";
import { extract, parse, reconcile, save, schema, serialize } from "../src/index";
import { clearParseCache } from "../src/parse";

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
  for (let i = 0; i < runs; i++) {
    clearParseCache();
    result = fn();
  }
  const ms = (performance.now() - t0) / runs;
  console.log(`${label.padEnd(48)} ${ms.toFixed(1).padStart(8)} ms`);
  return result;
}

// Median of `runs` after one warm-up. `setup` runs untimed before each run; without one, the parse
// cache is cleared.
function median(label: string, fn: () => unknown, runs = 15, setup = clearParseCache) {
  setup();
  fn();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    setup();
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

// The app's save path: the editor hands over JSON (with its own attributes), the save's output is
// extracted for the index, and the next save starts from that output.
type Json = { type: string; attrs?: Record<string, unknown>; content?: Json[]; text?: string };
const seedJson = seedParse.doc.toJSON() as Json;
seedJson.content!.forEach((block, i) => (block.attrs = { ...block.attrs, id: `block-${i}` }));
const paragraphs = seedJson.content!.flatMap((b, i) => (b.type === "paragraph" ? [i] : []));
// The editor's document after typing `n` characters, spread over different paragraphs.
function typed(n: number): Json {
  const doc = structuredClone(seedJson);
  for (let k = 0; k < n; k++) {
    const block = doc.content![paragraphs[(k * 37) % paragraphs.length]!]!;
    block.content![0]!.text += "x";
  }
  return doc;
}
const edit1 = typed(1);
median("app: save editor JSON (one edit)", () => save({ original: seedParse, doc: edit1 }));
const saved = save({ original: seedParse, doc: edit1 });
median(
  "app: extract of the saved text (cached parse)",
  () => extract(saved.source),
  15,
  () => {},
);
median("app: extract of the saved text (cold)", () => extract(saved.source));
median("app: save + extract", () => extract(save({ original: seedParse, doc: edit1 }).source));
// 20 saves, each a few more characters typed; per save.
const SESSION = 20;
const docs = Array.from({ length: SESSION }, (_, k) => typed(k + 1));
function session(
  next: (result: ReturnType<typeof save>) => Parameters<typeof save>[0]["original"],
) {
  let original: Parameters<typeof save>[0]["original"] = seedParse;
  for (const doc of docs) {
    const result = save({ original, doc });
    extract(result.source);
    original = next(result);
  }
}
median(`app: session, ${SESSION} saves (last save as original)`, () => session((r) => r.parse), 5);
median(
  `app: session, ${SESSION} saves (opened text as original)`,
  () => session(() => seedParse),
  5,
);
median(`app: session, ${SESSION} saves (original as string)`, () => session((r) => r.source), 5);
console.log(`  (session times are for all ${SESSION} saves, each with its extract)`);
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
