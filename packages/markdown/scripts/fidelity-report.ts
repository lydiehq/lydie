// Prints fidelity numbers for each corpus: bun scripts/fidelity-report.ts [--verbose] [--no-edits] [--vault-filter=en/]
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { checkFile, summarize } from "../test/fidelity";
import type { FileReport } from "../test/fidelity";

const root = join(dirname(new URL(import.meta.url).pathname), "..");
const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const edits = !args.includes("--no-edits");
const only = args.find((a) => a.startsWith("--only="))?.slice(7);
const vaultFilter = args.find((a) => a.startsWith("--vault-filter="))?.slice(15) ?? "";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

export function corpora(): Array<{ name: string; files: Array<[string, string]> }> {
  const out: Array<{ name: string; files: Array<[string, string]> }> = [];
  for (const spec of ["commonmark", "gfm"]) {
    const examples = JSON.parse(
      readFileSync(join(root, "fixtures/spec", `${spec}.json`), "utf8"),
    ) as Array<{ example: number; markdown: string }>;
    out.push({ name: spec, files: examples.map((e) => [`${spec}#${e.example}`, e.markdown]) });
  }
  const ofm = join(root, "fixtures/ofm");
  if (existsSync(ofm))
    out.push({
      name: "ofm-fixtures",
      files: walk(ofm).map((p) => [relative(ofm, p), readFileSync(p, "utf8")]),
    });
  const vault = join(root, ".cache/obsidian-help");
  if (existsSync(vault)) {
    out.push({
      name: "obsidian-help",
      files: walk(vault)
        .map((p) => [relative(vault, p), readFileSync(p, "utf8")] as [string, string])
        .filter(([n]) => n.startsWith(vaultFilter)),
    });
  }
  return out;
}

for (const corpus of corpora()) {
  if (only && corpus.name !== only) continue;
  const t0 = performance.now();
  const reports: FileReport[] = corpus.files.map(([name, src]) => checkFile(name, src, { edits }));
  const ms = performance.now() - t0;
  const s = summarize(reports);
  const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(2) : "n/a") + "%";
  console.log(`\n== ${corpus.name}: ${s.files} files (${ms.toFixed(0)} ms)`);
  console.log(
    `  no-op save byte-identical: ${s.noopIdentical}/${s.files} (${pct(s.noopIdentical, s.files)})`,
  );
  console.log(`  parse(serialize(doc)) stable: ${s.stable}/${s.files} (${pct(s.stable, s.files)})`);
  if (edits) {
    console.log(
      `  one-block edits confined+verified: ${s.confined}/${s.blocks} (${pct(s.confined, s.blocks)}), ${s.skipped} raw blocks skipped`,
    );
    console.log(
      `  files with every edit confined: ${s.filesAllConfined}/${s.files} (${pct(s.filesAllConfined, s.files)})`,
    );
  }
  console.log(`  fallback kinds (files): ${JSON.stringify(s.fallbacks)}`);
  if (verbose) {
    for (const r of reports) {
      if (!r.noopIdentical) console.log(`  NOOP ${r.name}`);
      if (!r.stable)
        console.log(`  UNSTABLE ${r.name}: ${JSON.stringify(r.stableDetail).slice(0, 300)}`);
      for (const f of r.failures)
        console.log(
          `  EDIT ${r.name} block ${f.block}: ${f.reason} ${JSON.stringify(f.detail ?? "").slice(0, 300)}`,
        );
    }
  }
}
