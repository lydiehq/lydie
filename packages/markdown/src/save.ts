import type { Node } from "prosemirror-model";

// Splice-preserving save: re-emit only the blocks that changed and copy every other block's bytes
// (markers, indentation, line endings, trailing whitespace, blank lines) from the original source.
import { align } from "./align";
import { deepEqual, editYaml, serializeFrontmatter, splitFrontmatter } from "./frontmatter";
import type { Properties } from "./frontmatter";
import { fingerprint, importDoc, normalizeForMarkdown } from "./normalize";
import type { DocInput } from "./normalize";
import { detectEol, parse, parseFragment, rememberParse } from "./parse";
import type { Fallback, ParseResult, Span } from "./parse";
import { schema } from "./schema";
import {
  blankSeparator,
  isList,
  listMarkerOf,
  serializeBlock,
  serializeBody,
  serializeListItem,
} from "./serialize";

export type SaveInput = {
  // The parse of the source the document was loaded from (or the source itself).
  original: ParseResult | string;
  // The edited document, in this package's schema or the editor's (same names), as a node or JSON.
  doc: DocInput;
  // New frontmatter properties. Omit (undefined) to keep the frontmatter bytes as they are.
  properties?: Properties | null;
};

export type SaveResult = {
  source: string;
  // True when re-parsing `source` gives back the edited document. False means a serializer bug:
  // the content is still all there, but some block will read back differently.
  verified: boolean;
  // The parse of `source` (the verification's): the `original` for the next save of this text.
  parse: ParseResult;
};

// recurse: splice inside changed containers too. blankGaps: put a blank line between a changed block
// and its neighbours even where the original had none (a paragraph that replaced a thematic break
// must not turn the next `---` into a setext underline). aggressive: escape all punctuation.
type Options = { recurse: boolean; aggressive: boolean; blankGaps: boolean };

const CONTAINERS = new Set([
  "doc",
  "blockquote",
  "callout",
  "bulletList",
  "orderedList",
  "taskList",
  "listItem",
  "taskItem",
  "footnoteDefinition",
  "directive",
  "columnList",
  "column",
]);

export function save(input: SaveInput): SaveResult {
  return saveWith(input, true);
}

// `save` that verifies by parsing the whole output, for tests that check the two agree.
export function saveVerifiedInFull(input: SaveInput): SaveResult {
  return saveWith(input, false);
}

function saveWith(input: SaveInput, regions: boolean): SaveResult {
  const original = typeof input.original === "string" ? parse(input.original) : input.original;
  const edited = normalized(importDoc(input.doc));
  const origDoc = normalized(original.doc);
  const head = frontmatterText(original, input.properties);
  const expectedProps = input.properties === undefined ? original.properties : input.properties;

  const attempts: Options[] = [
    { recurse: true, aggressive: false, blankGaps: false },
    { recurse: false, aggressive: false, blankGaps: false },
    { recurse: false, aggressive: false, blankGaps: true },
    { recurse: false, aggressive: true, blankGaps: true },
  ];
  let first: ParseResult | null = null;
  for (const options of attempts) {
    const layout: Layout = { pieces: [], seams: [] };
    const source = head + body(original, origDoc, edited, options, layout);
    if (source === original.source) return { source, verified: true, parse: original };
    const quick = regions
      ? verifyRegions(original, source, head.length, layout, edited, expectedProps)
      : null;
    if (quick) {
      rememberParse(quick);
      return { source, verified: true, parse: quick };
    }
    const reparsed = parse(source);
    first ??= reparsed;
    if (verify(reparsed, edited, expectedProps)) return { source, verified: true, parse: reparsed };
  }
  return { source: first!.source, verified: false, parse: first! };
}

// Block by block, so the fingerprints of the reparsed blocks are there when this parse is the
// next save's original.
function verify(
  reparsed: ParseResult,
  edited: Node,
  properties: Properties | null | undefined,
): boolean {
  const doc = normalized(reparsed.doc);
  if (doc.childCount !== edited.childCount) return false;
  for (let i = 0; i < doc.childCount; i++) {
    if (fingerprint(doc.child(i)) !== fingerprint(edited.child(i))) return false;
  }
  return deepEqual(reparsed.properties ?? {}, properties ?? {});
}

// The normalised form of a parsed document, kept with it: a parse is the original of every save
// until the next one, and normalising builds new nodes, whose fingerprints would be taken again.
const normalizedDocs = new WeakMap<Node, Node>();

function normalized(doc: Node): Node {
  let out = normalizedDocs.get(doc);
  if (!out) {
    out = normalizeForMarkdown(doc);
    normalizedDocs.set(doc, out);
  }
  return out;
}

function frontmatterText(original: ParseResult, properties: Properties | null | undefined): string {
  const { source, frontmatter } = original;
  const bodyStart = original.body.from;
  const unchanged = source.slice(0, bodyStart);
  if (properties === undefined) return unchanged;
  const before = original.properties ?? {};
  const after = properties ?? {};
  if (deepEqual(before, after) && (frontmatter === null || frontmatter.properties !== null))
    return unchanged;
  const bom = source.startsWith("\uFEFF") ? "\uFEFF" : "";
  if (Object.keys(after).length === 0) return bom;
  if (!frontmatter) return bom + serializeFrontmatter(after, original.eol);
  if (frontmatter.properties === null) {
    throw new Error(
      `@lydie/markdown: cannot edit invalid frontmatter (${frontmatter.error ?? "unknown error"})`,
    );
  }
  const yaml = source.slice(frontmatter.yamlFrom, frontmatter.yamlTo);
  return (
    source.slice(0, frontmatter.yamlFrom) +
    editYaml(yaml, frontmatter.properties, after, original.eol) +
    source.slice(frontmatter.yamlTo, bodyStart)
  );
}

// The top-level pieces of a save's body as written, for verifying only what changed. Offsets are
// in the body (the output after the frontmatter). A piece is clean when it is an original block,
// byte for byte, standing for an unchanged block; seams[i] (between pieces i - 1 and i) is clean
// when those are consecutive original blocks with their original gap.
export type Layout = {
  pieces: Array<{ orig: number | null; from: number; to: number; clean: boolean }>;
  seams: boolean[];
};

// Verifies a save's output by parsing only the runs of pieces that changed, each with an
// unchanged neighbour on both sides, and builds the output's parse from the original's other
// blocks. Null when that cannot be relied on; the caller then parses the whole output.
//
// Why a run can be parsed alone: a top-level block that is unchanged, with its original gap
// before it, starts as it did in the original (every block before it closed), and so do the
// blocks after it up to the next change. Parsing from the clean neighbour before a run therefore
// starts in the state the whole parse has there; the run's text decides how it reads; and the
// clean neighbour after it, read as the same block, closes the run off from what follows. The
// exceptions are document-wide: link reference and footnote definitions (any `]:` sends the
// save to the full check), and frontmatter (checked on its own). Both ends of a run must be at a
// line start, which embeds on one line are not.
export function verifyRegions(
  original: ParseResult,
  source: string,
  bodyStart: number,
  layout: Layout,
  edited: Node,
  properties: Properties | null | undefined,
): ParseResult | null {
  const { pieces, seams } = layout;
  const n = pieces.length;
  const kids = original.body.children;
  if (n === 0 || n !== edited.childCount || !kids) return null;
  if (source.includes("]:", bodyStart)) return null;
  const frontmatter = splitFrontmatter(source);
  const start = frontmatter ? frontmatter.to : source.startsWith("\uFEFF") ? 1 : 0;
  if (start !== bodyStart) return null;
  if (!deepEqual(frontmatter?.properties ?? {}, properties ?? {})) return null;

  // Runs of pieces to parse: the changed ones and both sides of a changed seam, plus a clean
  // neighbour each side (one that is not needed is clean, and so are its seams).
  const need = pieces.map((p) => !p.clean);
  for (let i = 1; i < n; i++) if (!seams[i]) need[i - 1] = need[i] = true;
  const runs: Array<[number, number]> = [];
  for (let k = 0; k < n; k++) {
    if (!need[k]) continue;
    let e = k;
    while (e + 1 < n && need[e + 1]) e++;
    const from = Math.max(0, k - 1);
    const to = Math.min(n - 1, e + 1);
    const last = runs[runs.length - 1];
    if (last && last[1] >= from) last[1] = to;
    else runs.push([from, to]);
    k = e;
  }

  const bodyLength = source.length - bodyStart;
  const isEol = (c: string | undefined) => c === "\n" || c === "\r";
  const parsedRuns = new Map<number, { run: [number, number]; at: number; parse: ParseResult }>();
  for (const run of runs) {
    const [s, e] = run;
    const from = s === 0 ? 0 : pieces[s]!.from;
    const to = e === n - 1 ? bodyLength : pieces[e]!.to;
    if (from > 0 && !isEol(source[bodyStart + from - 1])) return null;
    if (to < bodyLength && !isEol(source[bodyStart + to])) return null;
    const fragment = parseFragment(source.slice(bodyStart + from, bodyStart + to));
    const spans = fragment.body.children;
    if (!spans || spans.length !== e - s + 1) return null;
    const doc = normalized(fragment.doc);
    for (let j = 0; j < doc.childCount; j++) {
      if (fingerprint(doc.child(j)) !== fingerprint(edited.child(s + j))) return null;
    }
    parsedRuns.set(s, { run, at: bodyStart + from, parse: fragment });
  }

  // The output's parse: the original's blocks where nothing changed, moved to where they are now.
  const byBlock = fallbacksByBlock(original);
  if (!byBlock) return null;
  const blocks: Node[] = [];
  const spans: Span[] = [];
  const fallbacks: Fallback[] = [];
  for (let i = 0; i < n; i++) {
    const parsedRun = parsedRuns.get(i);
    if (parsedRun) {
      const { run, at, parse: fragment } = parsedRun;
      fragment.doc.forEach((child) => blocks.push(child));
      for (const span of fragment.body.children!) spans.push(shiftSpan(span, at));
      for (const f of fragment.fallbacks)
        fallbacks.push({ ...f, from: f.from + at, to: f.to + at });
      i = run[1];
      continue;
    }
    const orig = pieces[i]!.orig!;
    const span = kids[orig]!;
    const by = bodyStart + pieces[i]!.from - span.from;
    blocks.push(original.doc.child(orig));
    spans.push(shiftSpan(span, by));
    for (const f of byBlock[orig] ?? [])
      fallbacks.push(by ? { ...f, from: f.from + by, to: f.to + by } : f);
  }
  return {
    source,
    doc: original.doc.type.create(null, blocks),
    properties: frontmatter ? frontmatter.properties : null,
    frontmatter,
    body: { from: bodyStart, to: source.length, children: spans },
    eol: detectEol(source),
    fallbacks,
  };
}

function shiftSpan(span: Span, by: number): Span {
  if (by === 0) return span;
  const out: Span = { from: span.from + by, to: span.to + by };
  if (span.children) out.children = span.children.map((c) => shiftSpan(c, by));
  if (span.hints) out.hints = span.hints;
  return out;
}

// The original's fallbacks by the top-level block they are in, in their order; null if one is
// in none.
function fallbacksByBlock(original: ParseResult): Fallback[][] | null {
  const kids = original.body.children!;
  const out: Fallback[][] = [];
  for (const f of original.fallbacks) {
    let lo = 0;
    let hi = kids.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (kids[mid]!.from <= f.from) lo = mid + 1;
      else hi = mid - 1;
    }
    if (hi < 0 || f.to > kids[hi]!.to) return null;
    (out[hi] ??= []).push(f);
  }
  return out;
}

function body(
  original: ParseResult,
  origDoc: Node,
  edited: Node,
  options: Options,
  layout: Layout,
): string {
  const { source, body: span, eol } = original;
  if (!span.children) {
    const fresh = serializeBody(edited, eol);
    return fresh === "" ? source.slice(span.from) : fresh;
  }
  return spliceContainer(edited, origDoc, span, {
    source,
    eol,
    prefix: "",
    fileStart: span.from === 0,
    layout,
    ...options,
  });
}

type SpliceCtx = Options & {
  source: string;
  eol: string;
  prefix: string;
  fileStart?: boolean;
  // Filled for the top level only.
  layout?: Layout;
};

function canRecurse(e: Node, o: Node, span: Span, options: Options): boolean {
  if (!options.recurse || !span.children || e.type !== o.type) return false;
  if (!CONTAINERS.has(e.type.name)) return false;
  if (span.children.length !== o.childCount) return false;
  if (e.type === schema.nodes.taskItem || e.type === schema.nodes.callout) return true;
  return deepEqual(e.attrs, o.attrs);
}

// The absolute prefix of continuation lines of this container's children.
function childPrefixOf(node: Node, span: Span, ctx: SpliceCtx): string {
  const { source } = ctx;
  const kids = span.children!;
  if (kids.length >= 2) {
    const gap = source.slice(kids[0]!.to, kids[1]!.from);
    const nl = Math.max(gap.lastIndexOf("\n"), gap.lastIndexOf("\r"));
    if (nl !== -1) return gap.slice(nl + 1);
  }
  const pre = source.slice(span.from, kids[0]!.from);
  const nl = Math.max(pre.lastIndexOf("\n"), pre.lastIndexOf("\r"));
  if (nl !== -1) return pre.slice(nl + 1);
  switch (node.type.name) {
    case "blockquote":
    case "callout":
      return ctx.prefix + (/[ \t]$/.test(pre) ? pre : pre + " ");
    case "listItem":
    case "taskItem": {
      const m = /^([-*+]|\d{1,9}[.)])([ \t]*)/.exec(pre);
      if (!m) return ctx.prefix + "  ";
      const ws = m[2]!.length === 0 || m[2]!.length > 4 ? " " : m[2]!;
      return ctx.prefix + " ".repeat(m[1]!.length) + ws;
    }
    case "footnoteDefinition":
      return ctx.prefix + "    ";
    default:
      return ctx.prefix;
  }
}

// The marker for a re-serialised item: the original item's own marker if it had one, otherwise
// one in the style of the list's first item.
function itemMarker(
  list: Node,
  span: Span,
  origIndex: number | null,
  index: number,
  ctx: SpliceCtx,
): string {
  const kids = span.children!;
  const markerOf = (k: number) =>
    /^(?:[-*+]|\d{1,9}[.)])[ \t]*/.exec(ctx.source.slice(kids[k]!.from, kids[k]!.to))?.[0];
  if (origIndex !== null) {
    const m = markerOf(origIndex);
    if (m) return m.length > 0 && !/[ \t]$/.test(m) ? m + " " : m;
  }
  if (list.type === schema.nodes.orderedList) {
    const delimiter = span.hints?.delimiter ?? ".";
    return `${((list.attrs.start as number | null) ?? 1) + index}${delimiter} `;
  }
  return `${span.hints?.bullet ?? "-"} `;
}

function spliceContainer(edited: Node, orig: Node, span: Span, ctx: SpliceCtx): string {
  const { source, eol } = ctx;
  const kids = span.children!;
  const childPrefix = childPrefixOf(orig, span, ctx);
  const isListContainer = isList(orig);
  const listGap =
    isListContainer && kids.length >= 2 ? source.slice(kids[0]!.to, kids[1]!.from) : null;

  let pre = source.slice(span.from, kids[0]!.from);
  if (edited.type === schema.nodes.taskItem && edited.attrs.checked !== orig.attrs.checked) {
    pre = pre.replace(/\[[ xX]\]/, edited.attrs.checked ? "[x]" : "[ ]");
  } else if (edited.type === schema.nodes.callout && !deepEqual(edited.attrs, orig.attrs)) {
    const at = pre.indexOf("[!");
    const lineEnd = pre.search(/\r\n|\n|\r/);
    const fold = (edited.attrs.fold as string | null) ?? "";
    const title = (edited.attrs.title as string | null) ?? "";
    if (at !== -1 && lineEnd !== -1) {
      pre = `${pre.slice(0, at)}[!${edited.attrs.kind as string}]${fold}${title ? " " + title : ""}${pre.slice(lineEnd)}`;
    }
  }
  const post = source.slice(kids[kids.length - 1]!.to, span.to);

  const origFps: string[] = [];
  const origTypes: string[] = [];
  orig.forEach((c) => {
    origFps.push(fingerprint(c));
    origTypes.push(c.type.name);
  });
  const editFps: string[] = [];
  const editTypes: string[] = [];
  edited.forEach((c) => {
    editFps.push(fingerprint(c));
    editTypes.push(c.type.name);
  });

  // lo/hi: the original children a piece stands in for. A block that replaced deleted blocks
  // occupies their range, so the gaps around that range are reused around it.
  type Piece = {
    orig: number | null;
    lo: number | null;
    hi: number | null;
    node: Node;
    text: string | null;
    hintSpan: Span | null;
    recurse: boolean;
  };
  const ops = align(origFps, editFps, origTypes, editTypes);
  const pieces: Piece[] = [];
  for (let o = 0; o < ops.length; o++) {
    const op = ops[o]!;
    if (op.kind === "delete") continue;
    if (op.kind === "keep") {
      const k = kids[op.a]!;
      const text = source.slice(k.from, k.to);
      pieces.push({
        orig: op.a,
        lo: op.a,
        hi: op.a,
        node: edited.child(op.b),
        text,
        hintSpan: k,
        recurse: false,
      });
    } else if (op.kind === "change") {
      const k = kids[op.a]!;
      const node = edited.child(op.b);
      const recurse = canRecurse(node, orig.child(op.a), k, ctx);
      pieces.push({ orig: op.a, lo: op.a, hi: op.a, node, text: null, hintSpan: k, recurse });
    } else {
      let lo: number | null = null;
      let hi: number | null = null;
      for (const dir of [-1, 1]) {
        for (let q = o + dir; q >= 0 && q < ops.length; q += dir) {
          const other = ops[q]!;
          if (other.kind === "keep" || other.kind === "change") break;
          if (other.kind === "delete") {
            lo = lo === null ? other.a : Math.min(lo, other.a);
            hi = hi === null ? other.a : Math.max(hi, other.a);
          }
        }
      }
      pieces.push({
        orig: null,
        lo,
        hi,
        node: edited.child(op.b),
        text: null,
        hintSpan: null,
        recurse: false,
      });
    }
  }

  // Serialise changed pieces left to right, keeping adjacent lists from merging.
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]!;
    if (p.text !== null) continue;
    if (p.recurse) {
      p.text = spliceContainer(p.node, orig.child(p.orig!), p.hintSpan!, {
        ...ctx,
        prefix: childPrefix,
        fileStart: false,
        layout: undefined,
      });
      continue;
    }
    const avoid: string[] = [];
    if (isList(p.node)) {
      for (const n of [pieces[i - 1], pieces[i + 1]]) {
        if (n && isList(n.node) && n.text !== null) {
          const m = listMarkerOf(n.text);
          if (m) avoid.push(m);
        }
      }
    }
    const blockCtx = {
      eol,
      prefix: childPrefix,
      hints: p.hintSpan?.hints,
      aggressive: ctx.aggressive,
      avoidMarkers: avoid,
      atFileStart: ctx.fileStart && i === 0 && pre === "",
    };
    p.text = isListContainer
      ? serializeListItem(
          p.node,
          itemMarker(orig, span, p.orig, i, ctx),
          blockCtx,
          span.hints?.check,
        )
      : serializeBlock(p.node, blockCtx);
  }
  const changed = pieces.map(
    (p) => p.orig === null || p.text !== source.slice(kids[p.orig]!.from, kids[p.orig]!.to),
  );

  const layout = ctx.layout;
  let out = pre;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]!;
    const before = out.length;
    if (i > 0) {
      const prev = pieces[i - 1]!;
      const tight =
        isListContainer ||
        ((orig.type === schema.nodes.listItem || orig.type === schema.nodes.taskItem) &&
          isList(p.node));
      const gapAt = (k: number) => source.slice(kids[k - 1]!.to, kids[k]!.from);
      // Pieces standing in for neighbouring original ranges keep the original gap between them.
      const gap = prev.hi !== null && p.lo !== null && prev.hi < p.lo ? gapAt(prev.hi + 1) : null;
      if (gap !== null) {
        const blank = /(\r\n|\n|\r)[ \t>]*(\r\n|\n|\r)/.test(gap);
        out +=
          ctx.blankGaps && !tight && !blank && (changed[i] || changed[i - 1])
            ? blankSeparator(childPrefix, eol)
            : gap;
      } else if (isListContainer) {
        out += listGap ?? eol + childPrefix;
      } else if (tight) {
        out += eol + childPrefix;
      } else {
        out += blankSeparator(childPrefix, eol);
      }
    }
    if (layout) {
      const prev = pieces[i - 1];
      layout.seams.push(
        i > 0 &&
          prev!.orig !== null &&
          p.orig === prev!.orig + 1 &&
          out.slice(before) === source.slice(kids[prev!.orig]!.to, kids[p.orig]!.from),
      );
      layout.pieces.push({
        orig: p.orig,
        from: out.length,
        to: out.length + p.text!.length,
        clean: p.orig !== null && !changed[i] && origFps[p.orig] === editFps[i],
      });
    }
    out += p.text!;
  }
  return out + post;
}
