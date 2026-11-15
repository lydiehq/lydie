// What a Markdown file means to the database: its frontmatter (properties), its body, and the index
// data extracted from the body. In the database a body never contains the frontmatter: properties
// live in `documents.properties`, and the file is `prefix + body`.
import { normalizeId } from "@lydie/contract";
import type { Properties, PropertyValue } from "@lydie/contract";
import { extract as extractMarkdown } from "@lydie/markdown";
import type { Extract, Extracted, ExtractedLink } from "@lydie/runtime";

// Same rules as @lydie/markdown's frontmatter split: `---` on the first line (after an optional
// BOM), closed by `---` or `...` on a line of its own.
const OPEN = /^---[ \t]*(\r\n|\n|\r)/;

// Length of the frontmatter block (with its closing line ending) and BOM: the body starts there.
export function prefixLength(source: string): number {
  const from = source.startsWith("﻿") ? 1 : 0;
  const open = OPEN.exec(source.slice(from));
  if (!open) return from;
  const yamlFrom = from + open[0].length;
  const close = /^(?:---|\.\.\.)[ \t]*(?:\r\n|\n|\r|$)/gm;
  close.lastIndex = yamlFrom;
  for (let m = close.exec(source); m; m = close.exec(source)) {
    if (m.index < yamlFrom) continue;
    return m.index + m[0].length;
  }
  return from;
}

export type FileContent = {
  source: string;
  prefix: string;
  body: string;
  // Frontmatter as YAML values; null when there is none. `error` when it is not a YAML mapping.
  frontmatter: Record<string, unknown> | null;
  frontmatterError: string | null;
  // The id in `id:`, if the frontmatter has one (a UUID; files written before them say a ULID).
  id: string | null;
  // The properties the database holds: representable values, without the identity `id`.
  properties: Properties;
};

export function readContent(source: string): FileContent {
  const end = prefixLength(source);
  const prefix = source.slice(0, end);
  let frontmatter: Record<string, unknown> | null = null;
  let frontmatterError: string | null = null;
  if (prefix.trim().replace(/^﻿/, "") !== "") {
    const info = extractMarkdown(prefix);
    frontmatter = info.properties;
    frontmatterError = info.frontmatterError;
  }
  const rawId = frontmatter?.id;
  const id = typeof rawId === "string" ? normalizeId(rawId) : null;
  return {
    source,
    prefix,
    body: source.slice(end),
    frontmatter,
    frontmatterError,
    id,
    properties: toProperties(frontmatter),
  };
}

function representable(value: unknown): value is PropertyValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

// Frontmatter values the contract's `Properties` can hold. Others (nested maps, number lists) stay
// in the file untouched and are not visible to operations. An `id` that is an id is identity, not a property.
export function toProperties(frontmatter: Record<string, unknown> | null): Properties {
  const out: Properties = {};
  if (!frontmatter) return out;
  for (const [key, value] of Object.entries(frontmatter)) {
    if (key.length === 0 || key.length > 128) continue;
    if (key === "id" && typeof value === "string" && normalizeId(value)) continue;
    if (representable(value)) out[key] = value;
  }
  return out;
}

// The frontmatter to write so the file holds `properties`: keys the database cannot represent (and
// the identity `id`) are kept, representable keys follow `properties`. Key order is preserved by
// @lydie/markdown's `save`, which rewrites only changed keys.
export function mergeFrontmatter(
  frontmatter: Record<string, unknown> | null,
  properties: Properties,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const fm = frontmatter ?? {};
  for (const [key, value] of Object.entries(fm)) {
    const visible = Object.hasOwn(toProperties({ [key]: value }), key);
    if (!visible) out[key] = value;
    else if (Object.hasOwn(properties, key)) out[key] = properties[key];
  }
  for (const [key, value] of Object.entries(properties)) {
    if (!Object.hasOwn(out, key)) out[key] = value;
  }
  return out;
}

export type Eol = "\n" | "\r\n";

export function dominantEol(text: string): Eol {
  let crlf = 0;
  let lf = 0;
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) {
    if (text[i - 1] === "\r") crlf++;
    else lf++;
  }
  return crlf > lf ? "\r\n" : "\n";
}

// A new body for a file whose current body is `previous`: lines written with bare `\n` in a CRLF
// file get CRLF unless that exact line already existed (so untouched lines keep their bytes), and
// the presence of a final line ending follows the file.
export function fitBody(previous: string, next: string, fileEol: Eol): string {
  let out = next;
  if (fileEol === "\r\n" && /(^|[^\r])\n/.test(next)) {
    const old = new Set(previous.match(/[^\n]*\n/g) ?? []);
    out = (next.match(/[^\n]*\n|[^\n]+$/g) ?? [])
      .map((line) => {
        if (!line.endsWith("\n") || line.endsWith("\r\n") || old.has(line)) return line;
        return `${line.slice(0, -1)}\r\n`;
      })
      .join("");
  }
  const endsWithEol = (s: string) => /(\r\n|\n|\r)$/.test(s);
  if (previous !== "" && out !== "" && endsWithEol(previous) && !endsWithEol(out)) out += fileEol;
  return out;
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const NON_MARKDOWN_FILE = /\.(?!md$)[a-z0-9]{1,8}$/i;
const BLOCK_ID = /^[A-Za-z0-9-]{1,64}$/;

// @lydie/markdown's extractor in the shape @lydie/runtime stores (links, `^id` blocks, headings,
// tags, text). Pass it to `createRuntime({ extract })`. Run on bodies (no frontmatter).
export const extractBody: Extract = (markdown) => {
  const x = extractMarkdown(markdown);
  const blockIdAt = new Map<number, string>();
  for (const b of x.blocks) if (b.id && BLOCK_ID.test(b.id)) blockIdAt.set(b.index, b.id);
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();
  for (const l of x.links) {
    if (l.block < 0) continue;
    const syntax = l.kind === "wikilink" || l.kind === "embed" ? "wikilink" : "markdown";
    const kind = l.kind === "embed" || l.kind === "image" ? "embed" : "link";
    const target = l.target.trim();
    if (!target) continue;
    if (syntax === "markdown" && (SCHEME.test(target) || NON_MARKDOWN_FILE.test(target))) continue;
    const link: ExtractedLink = {
      kind,
      syntax,
      target,
      heading: l.heading,
      blockId: l.blockId && BLOCK_ID.test(l.blockId) ? l.blockId : null,
      sourceBlockId: blockIdAt.get(l.block) ?? null,
    };
    const key = [kind, syntax, target, link.heading, link.blockId, link.sourceBlockId].join("\0");
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(link);
  }
  const out: Extracted = {
    links,
    blocks: x.blocks
      .filter((b) => b.id && BLOCK_ID.test(b.id))
      .map((b) => ({ id: b.id!, type: b.type, text: b.text, order: b.index })),
    headings: x.headings.map((h) => ({ level: h.level, text: h.text })),
    tags: x.tags,
    text: x.text,
  };
  return out;
};
