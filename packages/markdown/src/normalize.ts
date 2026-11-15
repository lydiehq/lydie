// Bringing editor documents into the form Markdown can represent, and comparing blocks.
import { Fragment, Node } from "prosemirror-model";
import type { Mark } from "prosemirror-model";

import { schema } from "./schema";

// A ProseMirror node from any schema with the Lydie names (e.g. the TipTap editor's), or its JSON.
export type DocInput = Node | { type: string; [key: string]: unknown };

type JsonNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
};

// Converts a document into this package's schema. Attributes this schema does not know (e.g. the
// editor's block ids) are dropped; missing ones take their defaults. Unknown node or mark types throw.
export function importDoc(input: DocInput): Node {
  if (input instanceof Node && input.type.schema === schema) return input;
  const json = (input instanceof Node ? input.toJSON() : input) as JsonNode;
  return importNode(json);
}

function pickAttrs(known: Record<string, unknown>, attrs: Record<string, unknown> | undefined) {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(known)) {
    if (attrs && Object.hasOwn(attrs, key) && attrs[key] !== undefined) out[key] = attrs[key];
  }
  return out;
}

function importNode(json: JsonNode): Node {
  const type = schema.nodes[json.type];
  if (!type) throw new Error(`@lydie/markdown: unknown node type "${json.type}"`);
  const marks = (json.marks ?? []).map((m) => {
    const markType = schema.marks[m.type];
    if (!markType) throw new Error(`@lydie/markdown: unknown mark type "${m.type}"`);
    return markType.create(pickAttrs(markType.spec.attrs ?? {}, m.attrs));
  });
  if (type === schema.nodes.text) return schema.text(json.text ?? "", marks);
  const content = (json.content ?? [])
    .filter((c) => !(c.type === "text" && !c.text))
    .map(importNode);
  return type.create(
    pickAttrs(type.spec.attrs ?? {}, json.attrs),
    Fragment.fromArray(content),
    marks,
  );
}

// ---------------------------------------------------------------------------------------------

const WS_MARKS = new Set(["bold", "italic", "strike", "highlight"]);

// Rewrites a document into the form its Markdown serialisation parses back to: whitespace that
// Markdown cannot hold (paragraph edges, around line breaks, inside emphasis edges) is removed,
// empty paragraphs that would vanish are dropped, multi-paragraph table cells are joined.
export function normalizeForMarkdown(doc: Node): Node {
  return normalizeNode(doc, null);
}

function normalizeNode(node: Node, parent: Node | null): Node {
  if (node.isTextblock) return normalizeTextblock(node, parent);
  if (node.isLeaf) return node;
  if (node.type === schema.nodes.tableCell || node.type === schema.nodes.tableHeader) {
    const inline: Node[] = [];
    node.forEach((child, _, i) => {
      if (i > 0 && inline.length) inline.push(schema.text(" "));
      if (child.isTextblock) child.forEach((c) => inline.push(c));
      else inline.push(schema.text(child.textContent || " "));
    });
    const p = normalizeTextblock(
      schema.nodes.paragraph.create(null, Fragment.fromArray(inline)),
      node,
    );
    return node.type.create(node.attrs, p, node.marks);
  }
  const children: Node[] = [];
  node.forEach((child) => children.push(normalizeNode(child, node)));
  const isItem = node.type === schema.nodes.listItem || node.type === schema.nodes.taskItem;
  let kept = children.filter(
    (c, i) => !(c.type === schema.nodes.paragraph && c.childCount === 0) || (isItem && i === 0),
  );
  if (!kept.length) kept = [schema.nodes.paragraph.create()];
  if (isItem && kept[0]!.type !== schema.nodes.paragraph)
    kept.unshift(schema.nodes.paragraph.create());
  return node.type.create(node.attrs, Fragment.fromArray(kept), node.marks);
}

type Piece = { node: Node; marks: readonly Mark[] };

function normalizeTextblock(node: Node, parent: Node | null): Node {
  if (node.type.spec.code) return node.type.create(node.attrs, node.content, node.marks);
  const inTable =
    parent?.type === schema.nodes.tableCell || parent?.type === schema.nodes.tableHeader;
  const isHeading = node.type === schema.nodes.heading;
  let pieces: Piece[] = [];
  node.forEach((child) => {
    if (child.isText) {
      let text = child.text ?? "";
      if (child.marks.some((m) => m.type === schema.marks.code))
        text = text.replace(/\r\n?|\n/g, " ");
      else text = text.replace(/\r\n?/g, "\n");
      if (inTable || (isHeading && (node.attrs.level as number) > 2))
        text = text.replace(/\n/g, " ");
      pieces.push({ node: schema.text(text || " ", child.marks), marks: child.marks });
      if (!text) pieces.pop();
    } else if (child.type === schema.nodes.hardBreak && inTable) {
      pieces.push({
        node: schema.nodes.rawInline.create({ source: "<br>" }, null, child.marks),
        marks: child.marks,
      });
    } else {
      pieces.push({ node: child, marks: child.marks });
    }
  });

  // Whitespace around line breaks and at the block edges.
  const isBreak = (p: Piece | undefined) =>
    !!p && (p.node.type === schema.nodes.hardBreak || (p.node.isText && p.node.text === "\n"));
  pieces = splitText(pieces, /\n/);
  const trimmed: Piece[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]!;
    if (
      !p.node.isText ||
      p.node.text === "\n" ||
      p.marks.some((m) => m.type === schema.marks.code)
    ) {
      trimmed.push(p);
      continue;
    }
    let text = p.node.text!;
    if (i === 0 || isBreak(pieces[i - 1])) text = text.replace(/^[ \t]+/, "");
    if (i === pieces.length - 1 || isBreak(pieces[i + 1])) text = text.replace(/[ \t]+$/, "");
    if (text) trimmed.push({ ...p, node: schema.text(text, p.node.marks) });
  }
  pieces = trimmed;
  // Collapse runs of line breaks, drop breaks at the edges.
  const collapsed: Piece[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]!;
    const soft = p.node.isText && p.node.text === "\n";
    if (soft && (isBreak(collapsed[collapsed.length - 1]) || isBreak(pieces[i + 1]))) continue;
    collapsed.push(p);
  }
  pieces = collapsed;
  while (pieces.length && isBreak(pieces[pieces.length - 1])) pieces.pop();
  while (pieces.length && isBreak(pieces[0])) pieces.shift();
  // Whitespace may not sit just inside emphasis delimiters.
  pieces = trimMarkEdges(pieces);
  return node.type.create(node.attrs, Fragment.fromArray(pieces.map((p) => p.node)), node.marks);
}

function splitText(pieces: Piece[], sep: RegExp): Piece[] {
  const out: Piece[] = [];
  for (const p of pieces) {
    if (!p.node.isText || p.marks.some((m) => m.type === schema.marks.code)) {
      out.push(p);
      continue;
    }
    const parts = p.node.text!.split(new RegExp(`(${sep.source})`));
    for (const part of parts)
      if (part) out.push({ node: schema.text(part, p.node.marks), marks: p.node.marks });
  }
  return out;
}

function trimMarkEdges(input: Piece[]): Piece[] {
  let pieces = input;
  for (let guard = 0; guard < 8; guard++) {
    let changed = false;
    const out: Piece[] = [];
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i]!;
      if (!p.node.isText || p.marks.some((m) => m.type === schema.marks.code)) {
        out.push(p);
        continue;
      }
      const prev = pieces[i - 1];
      const next = pieces[i + 1];
      const text = p.node.text!;
      const opening = p.marks.filter(
        (m) => WS_MARKS.has(m.type.name) && !prev?.marks.some((x) => x.eq(m)),
      );
      const closing = p.marks.filter(
        (m) => WS_MARKS.has(m.type.name) && !next?.marks.some((x) => x.eq(m)),
      );
      const lead = /^\s+/.exec(text)?.[0] ?? "";
      const trail = text.length > lead.length ? (/\s+$/.exec(text)?.[0] ?? "") : "";
      if ((lead && opening.length) || (trail && closing.length)) {
        changed = true;
        const core = text.slice(lead.length, text.length - trail.length);
        const strip = (marks: readonly Mark[], drop: Mark[]) =>
          marks.filter((m) => !drop.some((d) => d.eq(m)));
        if (lead) {
          const marks = opening.length ? strip(p.marks, opening) : p.marks;
          out.push({ node: schema.text(lead, marks), marks });
        }
        if (core) out.push({ node: schema.text(core, p.marks), marks: p.marks });
        if (trail) {
          const marks = closing.length ? strip(p.marks, closing) : p.marks;
          out.push({ node: schema.text(trail, marks), marks });
        }
      } else out.push(p);
    }
    pieces = out;
    if (!changed) break;
  }
  return pieces;
}

// ---------------------------------------------------------------------------------------------

const fpCache = new WeakMap<Node, string>();

// A content fingerprint: equal for nodes that serialise to the same Markdown.
export function fingerprint(node: Node): string {
  let fp = fpCache.get(node);
  if (fp === undefined) {
    fp = JSON.stringify(node.toJSON());
    fpCache.set(node, fp);
  }
  return fp;
}
