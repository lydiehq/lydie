// Lydie Markdown → ProseMirror document, plus a source map: for every block that came from the
// source, its [from, to) range and (for containers) the ranges of its children. The source map
// is what makes splice-preserving saves possible.
import type * as M from "mdast";
import type { ContainerDirective } from "mdast-util-directive";
import type { Mark, Node } from "prosemirror-model";

import { splitFrontmatter } from "./frontmatter";
import type { Frontmatter, Properties } from "./frontmatter";
import { schema } from "./schema";
import { parseMdast } from "./syntax";

// Markdown trivia of the original block, used when an edited block is re-serialised so that it
// keeps the author's style (bullet character, fence, emphasis marker, ...).
export type Hints = {
  em?: "*" | "_";
  strong?: "**" | "__";
  hardBreak?: "\\" | "  ";
  bullet?: "-" | "*" | "+";
  delimiter?: "." | ")";
  check?: "x" | "X";
  fence?: string;
  indented?: boolean;
};

export type Span = {
  from: number;
  to: number;
  // Present only when the node's block children map 1:1 onto source ranges.
  children?: Span[];
  hints?: Hints;
};

export type Fallback = { kind: string; from: number; to: number };

export type ParseResult = {
  source: string;
  doc: Node;
  // null when there is no frontmatter or it is not a YAML mapping (see `frontmatter.error`).
  properties: Properties | null;
  frontmatter: Frontmatter | null;
  // Source map of the document body; `body.children[i]` is the range of `doc.child(i)`.
  body: Span;
  // The dominant line ending, used for newly written lines.
  eol: "\n" | "\r\n" | "\r";
  // Constructs kept verbatim as rawBlock/rawInline, for reporting.
  fallbacks: Fallback[];
};

class Escalate extends Error {
  constructor(readonly kind: string) {
    super(kind);
  }
}

type Ctx = {
  source: string;
  offset: number;
  depth: number;
  fallbacks: Fallback[];
};

export function detectEol(source: string): "\n" | "\r\n" | "\r" {
  let lf = 0;
  let crlf = 0;
  let cr = 0;
  for (let i = 0; i < source.length; i++) {
    const c = source.charCodeAt(i);
    if (c === 13) {
      if (source.charCodeAt(i + 1) === 10) {
        crlf++;
        i++;
      } else cr++;
    } else if (c === 10) lf++;
  }
  if (crlf > lf && crlf >= cr) return "\r\n";
  if (cr > lf && cr > crlf) return "\r";
  return "\n";
}

// Results are shared (see `parseWithTree`): never mutate one.
export function parse(source: string): ParseResult {
  return parseWithTree(source).result;
}

type Parsed = { result: ParseResult; tree: M.Root; bodyStart: number };

// Recent parses by text. A save parses its output to verify it, and that text is parsed again
// right after: the index's `extract`, the next save's `original`, the file bridge's last agreed
// text. Small texts parse in well under a millisecond and are not kept.
const CACHE_MIN_LENGTH = 1024;
const CACHE_SIZE = 4;
const recent = new Map<string, Parsed>();

// For benchmarks, which time parsing itself.
export function clearParseCache(): void {
  recent.clear();
}

// The parse plus the mdast tree of the body (positions relative to `bodyStart`), for helpers that
// need inline source positions.
export function parseWithTree(source: string): Parsed {
  const hit = recent.get(source);
  if (hit) {
    recent.delete(source);
    recent.set(source, hit);
    return hit;
  }
  const parsed = parseSource(source);
  if (source.length >= CACHE_MIN_LENGTH) {
    recent.set(source, parsed);
    while (recent.size > CACHE_SIZE) recent.delete(recent.keys().next().value!);
  }
  return parsed;
}

function parseSource(source: string): Parsed {
  const frontmatter = splitFrontmatter(source);
  const bodyStart = frontmatter ? frontmatter.to : source.startsWith("\uFEFF") ? 1 : 0;
  const tree = parseMdast(source.slice(bodyStart));
  const ctx: Ctx = { source, offset: bodyStart, depth: 0, fallbacks: [] };
  const blocks: Node[] = [];
  const spans: Span[] = [];
  for (const child of tree.children) {
    const from = start(ctx, child);
    const to = end(ctx, child);
    try {
      const out = convertBlock(ctx, child);
      for (const [node, span] of out) {
        blocks.push(node);
        spans.push(withIndent(source, clampSpan(source, span, spans[spans.length - 1])));
      }
    } catch (e) {
      if (!(e instanceof Escalate)) throw e;
      const span = clampSpan(source, { from, to }, spans[spans.length - 1]);
      ctx.fallbacks.push({ kind: e.kind, from: span.from, to: span.to });
      blocks.push(
        schema.nodes.rawBlock.create({ source: normalizeEol(source.slice(span.from, span.to)) }),
      );
      spans.push(span);
    }
  }
  const empty = blocks.length === 0;
  const doc = schema.nodes.doc.create(null, empty ? [schema.nodes.paragraph.create()] : blocks);
  const result: ParseResult = {
    source,
    doc,
    properties: frontmatter ? frontmatter.properties : null,
    frontmatter,
    body: empty
      ? { from: bodyStart, to: source.length }
      : { from: bodyStart, to: source.length, children: spans },
    eol: detectEol(source),
    fallbacks: ctx.fallbacks,
  };
  return { result, tree, bodyStart };
}

// A top-level block indented by up to three spaces owns that indentation, so a re-serialised block
// (e.g. a fence, whose indentation decides how much is stripped from its content) replaces it too.
function withIndent(source: string, span: Span): Span {
  let from = span.from;
  while (from > 0 && (source[from - 1] === " " || source[from - 1] === "\t")) from--;
  if (from > 0 && source[from - 1] !== "\n" && source[from - 1] !== "\r") return span;
  return from === span.from ? span : { ...span, from };
}

// mdast gives a setext heading or paragraph that began with link definitions the position of the
// whole paragraph, overlapping the definitions. Spans must not overlap, so start after the previous.
function clampSpan(source: string, span: Span, prev: Span | undefined): Span {
  if (!prev || span.from >= prev.to) return span;
  let from = prev.to;
  while (from < span.to && /\s/.test(source[from]!)) from++;
  return { ...span, from };
}

function start(ctx: Ctx, node: M.Node): number {
  return ctx.offset + (node.position?.start.offset ?? 0);
}
function end(ctx: Ctx, node: M.Node): number {
  return ctx.offset + (node.position?.end.offset ?? 0);
}

type Out = Array<[Node, Span]>;

function raw(ctx: Ctx, node: M.Node, kind: string, value?: string): Out {
  const from = start(ctx, node);
  let to = end(ctx, node);
  // Some blocks (HTML at end of input) end after their line ending; leave that to the gap.
  while (to > from && (ctx.source[to - 1] === "\n" || ctx.source[to - 1] === "\r")) to--;
  if (value !== undefined) value = value.replace(/(\r\n|\n|\r)+$/, "");
  let source = value;
  if (source === undefined) {
    source = ctx.source.slice(from, to);
    // A nested slice still contains its container prefixes on later lines.
    if (ctx.depth > 0 && /[\r\n]/.test(source)) throw new Escalate(kind);
  }
  ctx.fallbacks.push({ kind, from, to });
  return [[schema.nodes.rawBlock.create({ source: normalizeEol(source) }), { from, to }]];
}

export function normalizeEol(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function convertBlock(ctx: Ctx, node: M.RootContent): Out {
  const from = start(ctx, node);
  const to = end(ctx, node);
  switch (node.type) {
    case "paragraph": {
      const embeds = embedParagraph(ctx, node);
      if (embeds) return embeds;
      return [
        [
          schema.nodes.paragraph.create(null, inlines(ctx, node.children)),
          { from, to, hints: inlineHints(ctx, node) },
        ],
      ];
    }
    case "heading":
      return [
        [
          schema.nodes.heading.create({ level: node.depth }, inlines(ctx, node.children)),
          { from, to, hints: inlineHints(ctx, node) },
        ],
      ];
    case "thematicBreak":
      return [[schema.nodes.horizontalRule.create(), { from, to }]];
    case "code": {
      const fence = /^(`{3,}|~{3,})/.exec(ctx.source.slice(from, to));
      const language = node.lang ? (node.meta ? `${node.lang} ${node.meta}` : node.lang) : null;
      const text = normalizeEol(node.value);
      return [
        [
          schema.nodes.codeBlock.create({ language }, text ? schema.text(text) : null),
          { from, to, hints: fence ? { fence: fence[1] } : { indented: true } },
        ],
      ];
    }
    case "math": {
      if (node.meta) return raw(ctx, node, "math-meta");
      const text = normalizeEol(node.value);
      return [[schema.nodes.mathBlock.create(null, text ? schema.text(text) : null), { from, to }]];
    }
    case "html":
      return raw(ctx, node, "html", ctx.depth > 0 ? node.value : undefined);
    case "lydieCommentBlock":
      return raw(ctx, node, "comment", ctx.depth > 0 ? node.value : undefined);
    case "definition":
      return raw(ctx, node, "definition");
    case "blockquote":
      return blockquote(ctx, node);
    case "list":
      return list(ctx, node);
    case "table":
      return table(ctx, node);
    case "footnoteDefinition": {
      const [children, spans] = blockChildren(ctx, node.children);
      return [
        [
          schema.nodes.footnoteDefinition.create(
            { label: node.label ?? node.identifier },
            children,
          ),
          spans ? { from, to, children: spans } : { from, to },
        ],
      ];
    }
    case "containerDirective": {
      if (node.children[0]?.data && "directiveLabel" in node.children[0].data) {
        return raw(ctx, node, "directive-label");
      }
      const columns = columnLayout(ctx, node, from, to);
      if (columns) return columns;
      const [children, spans] = blockChildren(ctx, node.children);
      return [
        [
          schema.nodes.directive.create(
            { name: node.name, attrs: { ...node.attributes } },
            children,
          ),
          spans ? { from, to, children: spans } : { from, to },
        ],
      ];
    }
    default:
      return raw(ctx, node, node.type);
  }
}

// Converts nested block children. Returns spans only if they map 1:1 onto the nodes.
function blockChildren(ctx: Ctx, nodes: M.RootContent[]): [Node[], Span[] | undefined] {
  ctx.depth++;
  try {
    const children: Node[] = [];
    const spans: Span[] = [];
    for (const child of nodes) {
      for (const [n, s] of convertBlock(ctx, child)) {
        children.push(n);
        spans.push(clampSpan(ctx.source, s, spans[spans.length - 1]));
      }
    }
    if (children.length === 0) return [[schema.nodes.paragraph.create()], undefined];
    return [children, spans];
  } finally {
    ctx.depth--;
  }
}

const COLUMN_WIDTH = /^(\d{1,3}(?:\.\d+)?)%$/;

// `::::columns` whose children are all `:::column{width="40%"}` (width optional) is a column
// layout. Anything else (other attributes, a label, other children) stays a plain directive, so
// nothing the file says is lost.
function columnLayout(ctx: Ctx, node: ContainerDirective, from: number, to: number): Out | null {
  if (node.name !== "columns" || Object.keys(node.attributes ?? {}).length > 0) return null;
  const columns: ContainerDirective[] = [];
  for (const child of node.children) {
    if (child.type !== "containerDirective" || child.name !== "column") return null;
    if (child.children[0]?.data && "directiveLabel" in child.children[0].data) return null;
    const attrs = Object.entries(child.attributes ?? {});
    if (attrs.some(([key, value]) => key !== "width" || !COLUMN_WIDTH.test(value ?? ""))) {
      return null;
    }
    columns.push(child);
  }
  if (!columns.length) return null;
  ctx.depth++;
  try {
    const nodes: Node[] = [];
    const spans: Span[] = [];
    for (const column of columns) {
      const [children, childSpans] = blockChildren(ctx, column.children);
      const width = COLUMN_WIDTH.exec(column.attributes?.width ?? "")?.[1];
      nodes.push(schema.nodes.column.create({ width: width ? Number(width) : null }, children));
      const span: Span = { from: start(ctx, column), to: end(ctx, column) };
      if (childSpans) span.children = childSpans;
      spans.push(clampSpan(ctx.source, span, spans[spans.length - 1]));
    }
    return [[schema.nodes.columnList.create(null, nodes), { from, to, children: spans }]];
  } finally {
    ctx.depth--;
  }
}

// A paragraph made only of `![[embeds]]` separated by whitespace becomes embed blocks.
function embedParagraph(ctx: Ctx, node: M.Paragraph): Out | null {
  const embeds = node.children.filter((c) => c.type !== "text" || c.value.trim() !== "");
  if (!embeds.length || !embeds.every((c) => c.type === "lydieWikiLink" && c.embed)) return null;
  return embeds.map((c) => {
    const attrs = parseWikiTarget((c as M.RootContentMap["lydieWikiLink"]).value);
    return [schema.nodes.embed.create(attrs), { from: start(ctx, c), to: end(ctx, c) }];
  });
}

export type WikiTarget = {
  target: string;
  heading: string | null;
  blockId: string | null;
  alias: string | null;
};

// Splits the text between `[[` and `]]`: `target#heading|alias`, `target#^block|alias`.
// `\|` (used inside tables) also separates the alias.
export function parseWikiTarget(value: string): WikiTarget {
  let link = value;
  let alias: string | null = null;
  const pipe = /\\?\|/.exec(value);
  if (pipe) {
    link = value.slice(0, pipe.index);
    alias = value.slice(pipe.index + pipe[0].length);
  }
  let heading: string | null = null;
  let blockId: string | null = null;
  const hash = link.indexOf("#");
  let target = link;
  if (hash !== -1) {
    target = link.slice(0, hash);
    const rest = link.slice(hash + 1);
    if (rest.startsWith("^")) blockId = rest.slice(1);
    else heading = rest;
  }
  return { target, heading, blockId, alias };
}

const CALLOUT = /^\[!([^\]\s]+)\]([+-]?)(?:[ \t]+(.*?))?[ \t]*$/;

function blockquote(ctx: Ctx, node: M.Blockquote): Out {
  const from = start(ctx, node);
  const to = end(ctx, node);
  const first = node.children[0];
  if (first?.type === "paragraph") {
    const pStart = start(ctx, first);
    const lineEnd = ctx.source.slice(pStart, end(ctx, first)).search(/\r\n|\n|\r/);
    const header = ctx.source.slice(pStart, lineEnd === -1 ? end(ctx, first) : pStart + lineEnd);
    const m = CALLOUT.exec(header);
    if (m) {
      const callout = calloutBody(ctx, first, pStart + (lineEnd === -1 ? header.length : lineEnd));
      if (callout) {
        const rest = node.children.slice(1);
        let [children, spans] = blockChildren(ctx, rest);
        if (callout.paragraph) {
          const first = callout.paragraph;
          if (rest.length === 0) {
            children = first.map((x) => x[0]);
            spans = first.map((x) => x[1]);
          } else {
            children = [...first.map((x) => x[0]), ...children];
            spans = spans ? [...first.map((x) => x[1]), ...spans] : undefined;
          }
        }
        const attrs = { kind: m[1], fold: m[2] || null, title: m[3] || null };
        return [
          [
            schema.nodes.callout.create(attrs, children),
            spans ? { from, to, children: spans } : { from, to },
          ],
        ];
      }
    }
  }
  const [children, spans] = blockChildren(ctx, node.children);
  return [
    [
      schema.nodes.blockquote.create(null, children),
      spans ? { from, to, children: spans } : { from, to },
    ],
  ];
}

// Splits a callout's first paragraph after its header line. Returns null if an inline construct
// spans the header's line ending (then the blockquote stays a plain blockquote).
function calloutBody(
  ctx: Ctx,
  paragraph: M.Paragraph,
  headerEnd: number,
): { paragraph: Out | null } | null {
  const rest: M.PhrasingContent[] = [];
  let found = false;
  for (const child of paragraph.children) {
    if (found) {
      rest.push(child);
      continue;
    }
    const cEnd = end(ctx, child);
    if (cEnd <= headerEnd) continue;
    if (child.type === "break" && start(ctx, child) <= headerEnd) {
      found = true;
      continue;
    }
    if (child.type !== "text" || start(ctx, child) > headerEnd) {
      if (start(ctx, child) >= headerEnd) {
        found = true;
        rest.push(child);
        continue;
      }
      return null;
    }
    const nl = child.value.search(/\r\n|\n|\r/);
    if (nl === -1) return null;
    const after = child.value.slice(nl).replace(/^(\r\n|\n|\r)/, "");
    found = true;
    if (after) rest.push({ ...child, value: after });
  }
  if (!rest.length) return { paragraph: null };
  // Skip the next line's prefix (`>` markers and whitespace) to find where the body starts.
  let bodyFrom = headerEnd;
  const nl = /^(\r\n|\n|\r)/.exec(ctx.source.slice(bodyFrom));
  if (nl) bodyFrom += nl[0].length;
  const prefix = /^[ \t]*(?:>[ \t]?)*[ \t]*/.exec(ctx.source.slice(bodyFrom, end(ctx, paragraph)));
  bodyFrom += prefix ? prefix[0].length : 0;
  const embeds = embedParagraph(ctx, { ...paragraph, children: rest });
  if (embeds) return { paragraph: embeds };
  ctx.depth++;
  try {
    const p = schema.nodes.paragraph.create(null, inlines(ctx, rest));
    const span = { from: bodyFrom, to: end(ctx, paragraph), hints: inlineHints(ctx, paragraph) };
    return { paragraph: [[p, span]] };
  } finally {
    ctx.depth--;
  }
}

function list(ctx: Ctx, node: M.List): Out {
  const from = start(ctx, node);
  const to = end(ctx, node);
  const items = node.children;
  const allTasks = !node.ordered && items.every((i) => i.checked === true || i.checked === false);
  const hints: Hints = {};
  const markerText = ctx.source.slice(from, to);
  const marker = /^([-*+]|\d{1,9}([.)]))/.exec(markerText);
  if (marker) {
    if (marker[2]) hints.delimiter = marker[2] as "." | ")";
    else hints.bullet = marker[1] as "-" | "*" | "+";
  }
  const nodes: Node[] = [];
  const spans: Span[] = [];
  ctx.depth++;
  try {
    for (const item of items) {
      const iFrom = start(ctx, item);
      const iTo = end(ctx, item);
      const itemSource = ctx.source.slice(iFrom, iTo);
      const check = /^(?:[-*+]|\d{1,9}[.)])[ \t]+\[([ xX])\]/.exec(itemSource);
      if (check?.[1] && check[1] !== " ") hints.check = check[1] as "x" | "X";
      if (item.children.length && item.children[0]!.type !== "paragraph")
        throw new Escalate("list-item-start");
      let [children, childSpans] = blockChildren(ctx, item.children);
      if (!allTasks && item.checked !== null && item.checked !== undefined && children[0]) {
        // A checkbox in a list that is not entirely a task list stays verbatim at the start of the item.
        const box = /\[[ xX]\][ \t]?/.exec(itemSource.slice(check ? check.index : 0));
        if (!box) throw new Escalate("task-checkbox");
        const first = children[0];
        const rawBox = schema.nodes.rawInline.create({ source: box[0] });
        children = [
          first.type.create(first.attrs, [rawBox, ...contentArray(first)]),
          ...children.slice(1),
        ];
        ctx.fallbacks.push({ kind: "mixed-task-list-checkbox", from: iFrom, to: iTo });
        // The first child's range no longer covers the checkbox, so the item is re-serialised whole.
        childSpans = undefined;
      }
      const type = allTasks ? schema.nodes.taskItem : schema.nodes.listItem;
      const attrs = allTasks ? { checked: item.checked === true } : null;
      nodes.push(type.create(attrs, children));
      spans.push(
        childSpans ? { from: iFrom, to: iTo, children: childSpans } : { from: iFrom, to: iTo },
      );
    }
  } finally {
    ctx.depth--;
  }
  const listType = allTasks
    ? schema.nodes.taskList
    : node.ordered
      ? schema.nodes.orderedList
      : schema.nodes.bulletList;
  const attrs = node.ordered ? { start: node.start ?? 1 } : null;
  return [[listType.create(attrs, nodes), { from, to, children: spans, hints }]];
}

function contentArray(node: Node): Node[] {
  const out: Node[] = [];
  node.forEach((c) => out.push(c));
  return out;
}

function table(ctx: Ctx, node: M.Table): Out {
  const from = start(ctx, node);
  const to = end(ctx, node);
  const align = node.align ?? [];
  ctx.depth++;
  try {
    const rows = node.children.map((row, r) =>
      schema.nodes.tableRow.create(
        null,
        row.children.map((cell, c) =>
          (r === 0 ? schema.nodes.tableHeader : schema.nodes.tableCell).create(
            { align: align[c] ?? null },
            schema.nodes.paragraph.create(null, inlines(ctx, cell.children)),
          ),
        ),
      ),
    );
    return [[schema.nodes.table.create(null, rows), { from, to, hints: inlineHints(ctx, node) }]];
  } finally {
    ctx.depth--;
  }
}

// ---------------------------------------------------------------------------------------------
// Inline content

function inlines(ctx: Ctx, nodes: M.PhrasingContent[]): Node[] {
  const out: Node[] = [];
  for (const n of nodes) inline(ctx, n, [], out);
  return out;
}

function rawInline(
  ctx: Ctx,
  node: M.Node,
  kind: string,
  marks: readonly Mark[],
  out: Node[],
  value?: string,
) {
  const from = start(ctx, node);
  const to = end(ctx, node);
  let source = value;
  if (source === undefined) {
    source = ctx.source.slice(from, to);
    if (ctx.depth > 0 && /[\r\n]/.test(source)) throw new Escalate(kind);
  }
  ctx.fallbacks.push({ kind, from, to });
  out.push(schema.nodes.rawInline.create({ source: normalizeEol(source) }, null, marks));
}

function inline(ctx: Ctx, node: M.PhrasingContent, marks: readonly Mark[], out: Node[]): void {
  const m = schema.marks;
  const withMark = (mark: Mark, children: M.PhrasingContent[]) => {
    const next = mark.addToSet(marks);
    for (const c of children) inline(ctx, c, next, out);
  };
  switch (node.type) {
    case "text": {
      const text = normalizeEol(node.value);
      if (text) out.push(schema.text(text, marks));
      return;
    }
    case "emphasis":
      return withMark(m.italic.create(), node.children);
    case "strong":
      return withMark(m.bold.create(), node.children);
    case "delete":
      return withMark(m.strike.create(), node.children);
    case "lydieHighlight":
      return withMark(m.highlight.create(), node.children);
    case "link":
      return withMark(m.link.create({ href: node.url, title: node.title ?? null }), node.children);
    case "inlineCode": {
      const text = node.value.replace(/\r\n?|\n/g, " ");
      if (!text) return rawInline(ctx, node, "empty-code", marks, out);
      out.push(schema.text(text, m.code.create().addToSet(marks)));
      return;
    }
    case "break":
      out.push(schema.nodes.hardBreak.create(null, null, marks));
      return;
    case "image":
      out.push(
        schema.nodes.image.create(
          { src: node.url, alt: node.alt ?? null, title: node.title ?? null },
          null,
          marks,
        ),
      );
      return;
    case "footnoteReference":
      out.push(
        schema.nodes.footnoteReference.create(
          { label: node.label ?? node.identifier },
          null,
          marks,
        ),
      );
      return;
    case "lydieWikiLink":
      if (node.embed) return rawInline(ctx, node, "inline-embed", marks, out, `![[${node.value}]]`);
      out.push(schema.nodes.wikiLink.create(parseWikiTarget(node.value), null, marks));
      return;
    case "lydieMathText":
      if (node.dollars !== 1)
        return rawInline(ctx, node, "display-math-inline", marks, out, `$$${node.value}$$`);
      out.push(schema.nodes.mathInline.create(null, schema.text(node.value), marks));
      return;
    case "lydieComment":
      return rawInline(ctx, node, "comment", marks, out, normalizeEol(node.value));
    case "html":
      return rawInline(ctx, node, "html", marks, out, node.value);
    default:
      return rawInline(ctx, node, node.type, marks, out);
  }
}

function inlineHints(ctx: Ctx, node: M.Parent): Hints {
  const hints: Hints = {};
  const visit = (n: M.Node) => {
    if (n.type === "emphasis" && !hints.em) {
      const c = ctx.source[start(ctx, n)];
      if (c === "*" || c === "_") hints.em = c;
    } else if (n.type === "strong" && !hints.strong) {
      const c = ctx.source[start(ctx, n)];
      if (c === "*" || c === "_") hints.strong = c === "*" ? "**" : "__";
    } else if (n.type === "break" && !hints.hardBreak) {
      hints.hardBreak = ctx.source[start(ctx, n)] === "\\" ? "\\" : "  ";
    }
    if ("children" in n) for (const c of (n as M.Parent).children) visit(c);
  };
  for (const c of node.children) visit(c);
  return hints;
}
