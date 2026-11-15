import { describe, expect, test } from "bun:test";
// Large-scale fidelity on the official Obsidian help vault (6.5k files in 30+ languages).
// Download it first: `bun run fetch-corpus` (into .cache/, never committed). Run: `bun run test:corpus`.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { checkFile, summarize } from "./fidelity";

const vault = join(import.meta.dir, "..", ".cache", "obsidian-help");
const present = existsSync(vault);
if (!present) {
  console.warn(
    `SKIPPED: Obsidian help vault not found at ${vault}. Run \`bun run fetch-corpus\` first.`,
  );
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

describe.skipIf(!present)("obsidian-help vault", () => {
  const files = present
    ? walk(vault).map((p) => [relative(vault, p), readFileSync(p, "utf8")] as const)
    : [];

  test("every file: no-op save is byte-identical and parse(serialize) is stable", () => {
    const reports = files.map(([name, src]) => checkFile(name, src, { edits: false }));
    const s = summarize(reports);
    console.log(`vault: ${s.files} files, no-op identical ${s.noopIdentical}, stable ${s.stable}`);
    expect(reports.filter((r) => !r.noopIdentical).map((r) => r.name)).toEqual([]);
    expect(reports.filter((r) => !r.stable).map((r) => r.name)).toEqual([]);
  }, 600_000);

  test("English pages: every one-block edit stays inside the block (S1: ≥99%)", () => {
    const reports = files
      .filter(([name]) => name.startsWith("en/"))
      .map(([name, src]) => checkFile(name, src));
    const s = summarize(reports);
    console.log(
      `vault en/: ${s.files} files, ${s.confined}/${s.blocks} edits confined, ` +
        `${s.filesAllConfined}/${s.files} files with every edit confined, ${s.skipped} raw blocks skipped`,
    );
    for (const r of reports)
      for (const f of r.failures) console.log(`  ${r.name} block ${f.block}: ${f.reason}`);
    expect(s.confined / s.blocks).toBeGreaterThanOrEqual(0.99);
    expect(s.filesAllConfined / s.files).toBeGreaterThanOrEqual(0.99);
  }, 600_000);
});
