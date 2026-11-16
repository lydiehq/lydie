// Index data for the file bridge and the block index: links, embeds, blocks, headings, tags,
// block ids and plain text, with source positions. Also link rewriting on rename and `^id`
// assignment, both touching only the bytes they must.
import type * as M from "mdast";
import type { Node } from "prosemirror-model";

import type { Properties } from "./frontmatter";
import { parseWikiTarget, parseWithTree } from "./parse";
import type { ParseResult } from "./parse";
import { schema } from "./schema";

export type LinkKind = "wikilink" | "embed" | "markdown" | "image";

export type LinkRef = {
  kind: LinkKind;
  // The link path as written (decoded for Markdown links), without `#heading` or `|alias`.
  target: string;
  heading: string | null;
  blockId: string | null;
  // Wikilink `|alias`, or a Markdown link's text.
  alias: string | null;
  // Range of the whole link in the source.
  from: number;
  to: number;
  // Index of the top-level block (in `blocks`) the link is in; -1 for links in frontmatter.
  block: number;
};

export type BlockInfo = {
  // Index of the block among the document's top-level nodes (`doc.child(index)`).
  index: number;
  // ProseMirror node type name.
  type: string;
  // The block's `^id`, if it has one (trailing on its last line, or on its own line right after it).
  id: string | null;
  text: string;
  from: number;
  to: number;
};

export type HeadingInfo = { level: number; text: string; from: number; to: number; block: number };

export type BlockIdRef = { id: string; block: number; from: number; to: number };

export type Extracted = {
  properties: Properties | null;
  frontmatterError: string | null;
  links: LinkRef[];
  blocks: BlockInfo[];
  headings: HeadingInfo[];
  // Unique tags without `#`, from the `tags` property and from the text, in order of appearance.
  tags: string[];
  blockIds: BlockIdRef[];
  // Plain text of the body for search (comments and markup removed).
  text: string;
};

const BLOCK_ID_TRAILING = /(?:^|[ \t])\^([A-Za-z0-9-]+)[ \t]*$/;
const BLOCK_ID_ALONE = /^\^([A-Za-z0-9-]+)$/;
const TAG = /(?:^|[\s(,;])#([\p{L}\p{N}_/-]+)/gu;

type Walk = { tree: M.Root; bodyStart: number; result: ParseResult };

export function extract(source: string): Extracted {
  const { result, tree, bodyStart } = parseWithTree(source);
  const w: Walk = { tree, bodyStart, result };
  const spans = result.body.children ?? [];
  // Top-level spans are in order and do not overlap: the last one starting at or before `pos`.
  const blockOf = (pos: number) => {
    let lo = 0;
    let hi = spans.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (spans[mid]!.from <= pos) lo = mid + 1;
      else hi = mid - 1;
    }
    return hi >= 0 && pos < spans[hi]!.to ? hi : -1;
  };

  const links: LinkRef[] = [...frontmatterLinks(result), ...bodyLinks(w, blockOf)];
  const tags: string[] = [];
  const addTag = (t: string) => {
    const tag = t.replace(/^#/, "");
    if (tag && /[^\p{N}]/u.test(tag) && !tags.includes(tag)) tags.push(tag);
  };
  const fmTags = result.properties?.tags;
  if (typeof fmTags === "string") fmTags.split(/[,\s]+/).forEach(addTag);
  else if (Array.isArray(fmTags)) for (const t of fmTags) if (typeof t === "string") addTag(t);

  const blocks: BlockInfo[] = [];
  const headings: HeadingInfo[] = [];
  const blockIds: BlockIdRef[] = [];
  const texts: string[] = [];
  const doc = result.doc;
  for (let i = 0; i < doc.childCount && i < spans.length; i++) {
    const node = doc.child(i);
    const span = spans[i]!;
    const text = plainText(node);
    for (const m of text.matchAll(TAG)) addTag(m[1]!);
    const alone = node.type === schema.nodes.paragraph ? BLOCK_ID_ALONE.exec(text.trim()) : null;
    if (alone && blocks.length) {
      // `^id` on its own line names the block before it (lists, tables, quotes).
      const prev = blocks[blocks.length - 1]!;
      prev.id ??= alone[1]!;
      blockIds.push({ id: alone[1]!, block: prev.index, from: span.from, to: span.to });
      continue;
    }
    for (const id of nestedIds(source, span.from, span.to)) blockIds.push({ ...id, block: i });
    const own = BLOCK_ID_TRAILING.exec(lastLine(source.slice(span.from, span.to)));
    blocks.push({
      index: i,
      type: node.type.name,
      id: own ? own[1]! : null,
      text: own ? text.replace(BLOCK_ID_TRAILING, "") : text,
      from: span.from,
      to: span.to,
    });
    if (node.type === schema.nodes.heading) {
      headings.push({
        level: node.attrs.level as number,
        text: text.trim(),
        from: span.from,
        to: span.to,
        block: i,
      });
    }
    if (text) texts.push(own ? text.replace(BLOCK_ID_TRAILING, "") : text);
  }
  return {
    properties: result.properties,
    frontmatterError: result.frontmatter?.error ?? null,
    links,
    blocks,
    headings,
    tags,
    blockIds,
    text: texts.join("\n"),
  };
}

function lastLine(text: string): string {
  const lines = text.split(/\r\n|\n|\r/);
  return lines[lines.length - 1] ?? "";
}

// `^id`s at the end of any line of a block (list items, nested paragraphs).
function nestedIds(
  source: string,
  from: number,
  to: number,
): Array<{ id: string; from: number; to: number }> {
  const out: Array<{ id: string; from: number; to: number }> = [];
  const re = /(?:^|[ \t])\^([A-Za-z0-9-]+)[ \t]*(?=\r\n|\n|\r|$)/gm;
  const text = source.slice(from, to);
  for (const m of text.matchAll(re)) {
    const start = from + m.index + m[0].indexOf("^");
    out.push({ id: m[1]!, from: start, to: start + 1 + m[1]!.length });
  }
  return out;
}

// Plain text of a node for search and the block index.
export function plainText(node: Node): string {
  if (node.isText) return node.text ?? "";
  switch (node.type.name) {
    case "hardBreak":
      return "\n";
    case "wikiLink": {
      const a = node.attrs as { target: string; heading: string | null; alias: string | null };
      return a.alias ?? (a.heading ? `${a.target}#${a.heading}`.replace(/^#/, "") : a.target);
    }
    case "embed":
    case "horizontalRule":
      return "";
    case "image":
      return (node.attrs.alt as string | null) ?? "";
    case "footnoteReference":
      return "";
    case "rawInline":
    case "rawBlock": {
      const src = node.attrs.source as string;
      if (src.startsWith("%%")) return "";
      return src.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "");
    }
    case "callout": {
      const title = (node.attrs.title as string | null) ?? "";
      const body = childTexts(node).join("\n");
      return title ? `${title}\n${body}` : body;
    }
  }
  if (node.isTextblock) {
    let out = "";
    node.forEach((c) => (out += plainText(c)));
    return out;
  }
  return childTexts(node).join("\n");
}

function childTexts(node: Node): string[] {
  const out: string[] = [];
  node.forEach((c) => {
    const t = plainText(c);
    if (t) out.push(t);
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Links

function frontmatterLinks(result: ParseResult): LinkRef[] {
  const fm = result.frontmatter;
  if (!fm) return [];
  const out: LinkRef[] = [];
  const yaml = result.source.slice(fm.yamlFrom, fm.yamlTo);
  for (const m of yaml.matchAll(/(!?)\[\[([^\]\r\n[]+)\]\]/g)) {
    const t = parseWikiTarget(m[2]!);
    const from = fm.yamlFrom + m.index;
    out.push({ kind: m[1] ? "embed" : "wikilink", ...t, from, to: from + m[0].length, block: -1 });
  }
  return out;
}

function bodyLinks(w: Walk, blockOf: (pos: number) => number): LinkRef[] {
  const out: LinkRef[] = [];
  const { bodyStart, result } = w;
  const visit = (node: M.Node) => {
    const from = bodyStart + (node.position?.start.offset ?? 0);
    const to = bodyStart + (node.position?.end.offset ?? 0);
    if (node.type === "lydieWikiLink") {
      const n = node as M.RootContentMap["lydieWikiLink"];
      out.push({
        kind: n.embed ? "embed" : "wikilink",
        ...parseWikiTarget(n.value),
        from,
        to,
        block: blockOf(from),
      });
    } else if (node.type === "link" || node.type === "image") {
      const dest = destinationRange(result.source, from, to);
      if (dest) {
        const raw = result.source.slice(dest.from, dest.to);
        const decoded = dest.angle ? raw : safeDecode(raw);
        const hash = decoded.indexOf("#");
        const path = hash === -1 ? decoded : decoded.slice(0, hash);
        const frag = hash === -1 ? null : decoded.slice(hash + 1);
        const alias =
          node.type === "image" ? ((node as M.Image).alt ?? null) : mdText(node as M.Link);
        out.push({
          kind: node.type === "image" ? "image" : "markdown",
          target: path,
          heading: frag !== null && !frag.startsWith("^") ? frag : null,
          blockId: frag !== null && frag.startsWith("^") ? frag.slice(1) : null,
          alias,
          from,
          to,
          block: blockOf(from),
        });
      }
    }
    if ("children" in node) for (const c of (node as M.Parent).children) visit(c);
  };
  visit(w.tree);
  return out;
}

function mdText(node: M.Parent): string {
  let out = "";
  const visit = (n: M.Node) => {
    if ("value" in n && typeof n.value === "string") out += n.value;
    if ("children" in n) for (const c of (n as M.Parent).children) visit(c);
  };
  visit(node);
  return out;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// Finds the destination of an inline `[text](dest "title")` or `![alt](dest)` in source[from, to).
// Returns null for autolinks, literal URLs and reference links.
function destinationRange(
  source: string,
  from: number,
  to: number,
): { from: number; to: number; angle: boolean } | null {
  let i = from;
  if (source[i] === "!") i++;
  if (source[i] !== "[") return null;
  let depth = 0;
  for (; i < to; i++) {
    const c = source[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === "[") depth++;
    else if (c === "]" && --depth === 0) break;
  }
  if (source[i + 1] !== "(") return null;
  i += 2;
  while (i < to && /[ \t\r\n]/.test(source[i]!)) i++;
  if (source[i] === "<") {
    const start = i + 1;
    for (i = start; i < to && source[i] !== ">"; i++) if (source[i] === "\\") i++;
    return { from: start, to: i, angle: true };
  }
  const start = i;
  let parens = 0;
  for (; i < to; i++) {
    const c = source[i]!;
    if (c === "\\") {
      i++;
      continue;
    }
    if (/[ \t\r\n]/.test(c)) break;
    if (c === "(") parens++;
    else if (c === ")") {
      if (parens === 0) break;
      parens--;
    }
  }
  return { from: start, to: i, angle: false };
}

// Rewrites link targets in a file, e.g. after a rename. `rewrite` gets each link and returns the
// new target (path only; heading, block id and alias are kept) or undefined to leave it. Only the
// target bytes change. Markdown links keep their encoding style.
export function rewriteLinks(
  source: string,
  rewrite: (link: LinkRef) => string | undefined,
): string {
  const { result, tree, bodyStart } = parseWithTree(source);
  const links = [...frontmatterLinks(result), ...bodyLinks({ tree, bodyStart, result }, () => -1)];
  const edits: Array<{ from: number; to: number; text: string }> = [];
  for (const link of links) {
    const next = rewrite(link);
    if (next === undefined || next === link.target) continue;
    if (link.kind === "wikilink" || link.kind === "embed") {
      const start = link.from + (link.kind === "embed" ? 3 : 2);
      edits.push({ from: start, to: start + link.target.length, text: next });
    } else {
      const dest = destinationRange(source, link.from, link.to);
      if (!dest) continue;
      const raw = source.slice(dest.from, dest.to);
      const hash = dest.angle ? raw.indexOf("#") : raw.indexOf("#");
      const pathEnd = hash === -1 ? dest.to : dest.from + hash;
      let text = next;
      if (dest.angle) text = text.replace(/([<>])/g, "\\$1");
      else
        text =
          /%[0-9A-Fa-f]{2}/.test(raw) || /[ ()]/.test(text)
            ? encodeURI(text).replace(/[()]/g, (c) => encodeURIComponent(c))
            : text;
      edits.push({ from: dest.from, to: pathEnd, text });
    }
  }
  edits.sort((a, b) => b.from - a.from);
  let out = source;
  for (const e of edits) out = out.slice(0, e.from) + e.text + out.slice(e.to);
  return out;
}

// Gives top-level block `index` (a `doc.child` index) a `^id` if it has none, touching only that
// block: a paragraph or heading gets ` ^id` at the end of its last line; other blocks (lists,
// quotes, tables, ...) get `^id` on its own line after the block, as Obsidian writes it.
export function assignBlockId(
  source: string,
  index: number,
  id?: string,
): { source: string; id: string } {
  const info = extract(source);
  const block = info.blocks.find((b) => b.index === index);
  if (!block) throw new Error(`@lydie/markdown: no top-level block at index ${index}`);
  if (block.id) return { source, id: block.id };
  const taken = new Set(info.blockIds.map((b) => b.id));
  let newId = id ?? randomId();
  while (!id && taken.has(newId)) newId = randomId();
  if (taken.has(newId)) throw new Error(`@lydie/markdown: block id "${newId}" is already used`);
  const eol = /\r\n/.test(source) ? "\r\n" : "\n";
  if (block.type === "paragraph" || block.type === "heading") {
    return { source: source.slice(0, block.to) + ` ^${newId}` + source.slice(block.to), id: newId };
  }
  const after = source.slice(block.to);
  const blankAfter = /^[ \t]*(\r\n|\n|\r)[ \t]*(\r\n|\n|\r|$)/.test(after) || after.trim() === "";
  const insert = `${eol}${eol}^${newId}${blankAfter || after === "" ? "" : eol}`;
  return { source: source.slice(0, block.to) + insert + after, id: newId };
}

function randomId(): string {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 6);
}
