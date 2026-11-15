import { describe, expect, test } from "bun:test";
// Fidelity on the committed corpora: CommonMark 0.31.2 and GFM spec examples, and the OFM fixtures.
// The Obsidian help vault runs from test/ (bun run test:corpus) because it needs a download.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { checkFile, summarize } from "../test/fidelity";

const fixtures = join(import.meta.dir, "..", "fixtures");

function spec(name: string): Array<[string, string]> {
  const examples = JSON.parse(
    readFileSync(join(fixtures, "spec", `${name}.json`), "utf8"),
  ) as Array<{
    example: number;
    markdown: string;
  }>;
  return examples.map((e) => [`${name}#${e.example}`, e.markdown]);
}

const corpora: Record<string, Array<[string, string]>> = {
  commonmark: spec("commonmark"),
  gfm: spec("gfm"),
  ofm: readdirSync(join(fixtures, "ofm")).map((f) => [
    f,
    readFileSync(join(fixtures, "ofm", f), "utf8"),
  ]),
};

// Known, explained failures (see SPEC.md "Known limitations").
const KNOWN_UNSTABLE = new Set(["gfm#631"]);
const KNOWN_EDIT_FAILURES = new Set(["commonmark#218", "gfm#187", "gfm#631"]);

for (const [name, files] of Object.entries(corpora)) {
  describe(`fidelity: ${name}`, () => {
    const reports = files.map(([file, source]) => checkFile(file, source));
    const s = summarize(reports);

    test(`no-op save is byte-identical (${s.noopIdentical}/${s.files})`, () => {
      expect(reports.filter((r) => !r.noopIdentical).map((r) => r.name)).toEqual([]);
    });

    test(`parse(serialize(doc)) is stable (${s.stable}/${s.files})`, () => {
      expect(
        reports.filter((r) => !r.stable && !KNOWN_UNSTABLE.has(r.name)).map((r) => r.name),
      ).toEqual([]);
    });

    test(`one-block edits stay inside the block (${s.confined}/${s.blocks})`, () => {
      const failures = reports
        .filter((r) => !KNOWN_EDIT_FAILURES.has(r.name))
        .flatMap((r) => r.failures.map((f) => `${r.name} block ${f.block}: ${f.reason}`));
      expect(failures).toEqual([]);
      expect(s.confined / s.blocks).toBeGreaterThanOrEqual(0.99);
    });
  });
}
