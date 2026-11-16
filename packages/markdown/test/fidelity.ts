// Fidelity checks shared by the unit tests, the corpus tests and scripts/fidelity-report.ts.
import { Fragment } from "prosemirror-model";
import type { Node } from "prosemirror-model";

import { fingerprint, normalizeForMarkdown } from "../src/normalize";
import { clearParseCache, parse } from "../src/parse";
import type { ParseResult } from "../src/parse";
import { save, saveVerifiedInFull } from "../src/save";
import { schema } from "../src/schema";
import { serializeBody } from "../src/serialize";

export type FileReport = {
  name: string;
  noopIdentical: boolean;
  blocks: number;
  skipped: number;
  confined: number;
  failures: Array<{ block: number; reason: string; detail?: string }>;
  stable: boolean;
  stableDetail?: string;
  fallbacks: string[];
};

// Appends a marker to the last text in a block; blocks without text become a paragraph.
export function editBlock(block: Node): Node | null {
  let done = false;
  const visit = (node: Node): Node => {
    if (done) return node;
    if (node.isText) {
      done = true;
      return schema.text((node.text ?? "") + "zq", node.marks);
    }
    if (node.isLeaf) return node;
    const children: Node[] = [];
    node.forEach((c) => children.push(c));
    for (let i = children.length - 1; i >= 0 && !done; i--) children[i] = visit(children[i]!);
    return node.type.create(node.attrs, Fragment.fromArray(children), node.marks);
  };
  // Raw blocks are edited only where the edit cannot change how other blocks parse (a changed
  // link definition changes every reference to it); other raw blocks are skipped.
  if (block.type === schema.nodes.rawBlock) {
    const source = block.attrs.source as string;
    if (source.startsWith("%%")) return block.type.create({ source: "%%zq" + source.slice(2) });
    return null;
  }
  const out = visit(block);
  if (done) return out;
  return schema.nodes.paragraph.create(null, schema.text("zq edit"));
}

// What a parse says, to compare a save's parse with a fresh parse of its output.
export function parseView(r: ParseResult) {
  return {
    source: r.source,
    doc: r.doc.toJSON(),
    properties: r.properties,
    frontmatter: r.frontmatter,
    body: r.body,
    eol: r.eol,
    fallbacks: r.fallbacks,
  };
}

// A save verified only where it changed must say what one verified in full says, and its parse
// must be the output's.
export function checkSave(
  original: ParseResult,
  doc: Node,
): { result: ReturnType<typeof save>; mismatch: string | null } {
  const result = save({ original, doc });
  const full = saveVerifiedInFull({ original, doc });
  if (result.source !== full.source || result.verified !== full.verified) {
    return { result, mismatch: "region verification disagrees with the full one" };
  }
  clearParseCache();
  const fresh = parseView(parse(result.source));
  if (!Bun.deepEquals(parseView(result.parse), fresh)) {
    return { result, mismatch: "the save's parse is not the output's" };
  }
  return { result, mismatch: null };
}

export function checkFile(
  name: string,
  source: string,
  opts: { edits?: boolean } = {},
): FileReport {
  const parsed = parse(source);
  const report: FileReport = {
    name,
    noopIdentical: false,
    blocks: 0,
    skipped: 0,
    confined: 0,
    failures: [],
    stable: false,
    fallbacks: [...new Set(parsed.fallbacks.map((f) => f.kind))],
  };
  const noop = save({ original: parsed, doc: parsed.doc });
  report.noopIdentical = noop.source === source;

  // parse(serialize(doc)) is structurally stable.
  const canonical = serializeBody(parsed.doc, "\n");
  const again = parse(canonical);
  const a = fingerprint(normalizeForMarkdown(parsed.doc));
  const b = fingerprint(normalizeForMarkdown(again.doc));
  report.stable = a === b;
  if (!report.stable) report.stableDetail = canonical;

  if (opts.edits === false || !parsed.body.children) return report;
  const spans = parsed.body.children;
  report.blocks = parsed.doc.childCount;
  for (let i = 0; i < parsed.doc.childCount; i++) {
    const children: Node[] = [];
    parsed.doc.forEach((c) => children.push(c));
    const edited = editBlock(children[i]!);
    if (!edited) {
      report.skipped++;
      continue;
    }
    children[i] = edited;
    const doc = parsed.doc.type.create(null, Fragment.fromArray(children));
    let result;
    try {
      const checked = checkSave(parsed, doc);
      result = checked.result;
      if (checked.mismatch) {
        report.failures.push({ block: i, reason: checked.mismatch });
        continue;
      }
    } catch (e) {
      report.failures.push({ block: i, reason: "throws", detail: String(e) });
      continue;
    }
    const span = spans[i]!;
    const before = source.slice(0, span.from);
    const after = source.slice(span.to);
    const out = result.source;
    const confined =
      out.startsWith(before) && out.endsWith(after) && out.length >= before.length + after.length;
    if (!result.verified) {
      report.failures.push({
        block: i,
        reason: "unverified",
        detail: out.slice(before.length, out.length - after.length),
      });
    } else if (!confined) {
      report.failures.push({ block: i, reason: "not-confined" });
    } else report.confined++;
  }
  return report;
}

export type Summary = {
  files: number;
  noopIdentical: number;
  stable: number;
  blocks: number;
  skipped: number;
  confined: number;
  filesAllConfined: number;
  fallbacks: Record<string, number>;
};

export function summarize(reports: FileReport[]): Summary {
  const fallbacks: Record<string, number> = {};
  for (const r of reports) for (const f of r.fallbacks) fallbacks[f] = (fallbacks[f] ?? 0) + 1;
  return {
    files: reports.length,
    noopIdentical: reports.filter((r) => r.noopIdentical).length,
    stable: reports.filter((r) => r.stable).length,
    blocks: reports.reduce((n, r) => n + r.blocks - r.skipped, 0),
    skipped: reports.reduce((n, r) => n + r.skipped, 0),
    confined: reports.reduce((n, r) => n + r.confined, 0),
    filesAllConfined: reports.filter((r) => r.noopIdentical && r.confined === r.blocks - r.skipped)
      .length,
    fallbacks,
  };
}
