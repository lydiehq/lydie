import { LydieError } from "@lydie/contract";
import type { LinkKind, LinkSyntax, Warning } from "@lydie/contract";

// Opaque body version for optimistic concurrency (`expectedVersion`). cyrb53, not cryptographic.
export function bodyVersion(markdown: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < markdown.length; i++) {
    const ch = markdown.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  return `${markdown.length.toString(36)}-${hash}`;
}

export type BodyEditInput = {
  type?: "replace" | "insertBefore" | "insertAfter" | "prepend" | "append";
  oldStr?: string | undefined;
  newStr: string;
  replaceAll?: boolean;
};

// Applies edits in order. Atomic (the default): an edit whose oldStr matches zero times, or more
// than once without `replaceAll`, fails the whole call with an error naming it, so a multi-edit
// never half-applies. `atomic: false` skips such an edit and reports it in `warnings` instead (the
// core replaying an uploaded edit against a body that moved on). prepend/append add newStr as a
// block, a blank line away from the rest.
export function applyEdits(
  markdown: string,
  edits: readonly BodyEditInput[],
  options: { atomic?: boolean } = {},
): { markdown: string; warnings: Warning[] } {
  let text = markdown;
  const warnings: Warning[] = [];
  edits.forEach((edit, editIndex) => {
    const type = edit.type ?? "replace";
    if (type === "append") {
      const head = text.replace(/\s+$/, "");
      text = head ? `${head}\n\n${edit.newStr.replace(/^\n+/, "")}` : edit.newStr;
      if (head && markdown.endsWith("\n") && !text.endsWith("\n")) text += "\n";
      return;
    }
    if (type === "prepend") {
      const tail = text.replace(/^\s+/, "");
      text = tail ? `${edit.newStr.replace(/\s+$/, "")}\n\n${tail}` : edit.newStr;
      return;
    }
    const oldStr = edit.oldStr ?? "";
    const count = oldStr ? text.split(oldStr).length - 1 : 0;
    const problem =
      count === 0
        ? { code: "no_match" as const, message: "oldStr was not found in the body" }
        : count > 1 && !edit.replaceAll
          ? {
              code: "ambiguous_match" as const,
              message: `oldStr matches ${count} times; add context or set replaceAll`,
            }
          : null;
    if (problem && options.atomic === false) {
      warnings.push({ ...problem, editIndex });
      return;
    }
    if (problem) {
      throw new LydieError("invalid_input", `edits[${editIndex}] (${type}): ${problem.message}`, {
        hint: "Nothing was written. Fetch the document and match its Markdown exactly.",
        details: { editIndex, code: problem.code },
      });
    }
    const replacement =
      type === "insertBefore"
        ? edit.newStr + oldStr
        : type === "insertAfter"
          ? oldStr + edit.newStr
          : edit.newStr;
    text = text.split(oldStr).join(replacement);
  });
  return { markdown: text, warnings };
}

export type ExtractedLink = {
  kind: LinkKind;
  syntax: LinkSyntax;
  // Path or title as written, without `#heading`/`#^block` and without `.md` decoding issues.
  target: string;
  heading: string | null;
  blockId: string | null;
  // The `^id` of the block the link sits in, if it has one.
  sourceBlockId: string | null;
};

export type ExtractedBlock = { id: string; type: string; text: string; order: number };

export type ExtractedHeading = { level: number; text: string };

// What the runtime needs from a body. `@lydie/markdown` provides the real implementation (passed as
// `createRuntime({ extract })`); `extract` below is a small regex fallback.
export type Extracted = {
  links: ExtractedLink[];
  // Blocks that carry a `^id`; others are not indexed.
  blocks: ExtractedBlock[];
  headings: ExtractedHeading[];
  tags: string[];
  // Plain text, for search and previews.
  text: string;
};

export type Extract = (markdown: string) => Extracted;

const FENCED_CODE = /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[^\n]*$|(?![\s\S]))/gm;
const INLINE_CODE = /`[^`\n]*`/g;
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)\s*(?:\r?\n|$)/;
const WIKILINK = /(!?)\[\[([^\]\n|]*?)(?:\|[^\]\n]*)?\]\]/g;
const MD_LINK = /(!?)\[[^\]\n]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const NON_MARKDOWN_FILE = /\.(?!md$)[a-z0-9]{1,8}$/i;
const BLOCK_ID = /(?:^|\s)\^([A-Za-z0-9-]{1,64})\s*$/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[.\]\s+)?/;
const TAG = /(?:^|[\s(])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;

// Splits a link target into its path/title and `#heading` or `#^block` part.
function splitTarget(raw: string): {
  target: string;
  heading: string | null;
  blockId: string | null;
} {
  const hash = raw.indexOf("#");
  if (hash === -1) return { target: raw.trim(), heading: null, blockId: null };
  const target = raw.slice(0, hash).trim();
  const part = raw.slice(hash + 1).trim();
  if (part.startsWith("^")) return { target, heading: null, blockId: part.slice(1) || null };
  // Nested headings are written `#A#B`; the last one is the target.
  const heading = part.split("#").pop()?.trim() || null;
  return { target, heading, blockId: null };
}

type Chunk = { lines: string[]; type: string };

// Top-level blocks: list items and headings are one block per line, other blocks run until a blank
// line. Code is blanked out beforehand so it never yields links, tags or ids.
function chunks(text: string): Chunk[] {
  const out: Chunk[] = [];
  let current: Chunk | null = null;
  for (const line of text.split("\n")) {
    if (!line.trim()) {
      current = null;
      continue;
    }
    const standaloneId = /^\s*\^[A-Za-z0-9-]{1,64}\s*$/.test(line);
    if (standaloneId && out.length > 0) {
      // `^id` on its own line names the block above it (tables, quotes, lists).
      out.at(-1)!.lines.push(line);
      current = null;
      continue;
    }
    const type = HEADING.test(line)
      ? "heading"
      : LIST_ITEM.test(line)
        ? "listItem"
        : line.trimStart().startsWith(">")
          ? "blockquote"
          : line.trimStart().startsWith("|")
            ? "table"
            : "paragraph";
    const continues =
      current && type !== "heading" && type !== "listItem" && current.type !== "heading";
    if (continues && current) current.lines.push(line);
    else {
      current = { lines: [line], type };
      out.push(current);
    }
  }
  return out;
}

function plain(line: string): string {
  return line
    .replace(BLOCK_ID, "")
    .replace(HEADING, "$2")
    .replace(LIST_ITEM, "")
    .replace(/^\s*>\s?/, "")
    .replace(/!?\[\[([^\]|]*?)(?:\|([^\]]*))?\]\]/g, (_, t: string, alias?: string) => alias ?? t)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_~=`]+/g, "")
    .trim();
}

// A minimal, dependency-free extractor. Good enough for tests and as a fallback; the real one parses
// Markdown properly (@lydie/markdown).
export function extract(markdown: string): Extracted {
  const withoutFrontmatter = markdown.replace(FRONTMATTER, "");
  const text = withoutFrontmatter
    .replace(FENCED_CODE, (code) => code.replace(/[^\n]/g, " "))
    .replace(INLINE_CODE, (code) => " ".repeat(code.length));
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();
  const blocks: ExtractedBlock[] = [];
  const headings: ExtractedHeading[] = [];
  const tags = new Set<string>();
  const add = (link: ExtractedLink) => {
    const key = [
      link.kind,
      link.syntax,
      link.target,
      link.heading,
      link.blockId,
      link.sourceBlockId,
    ].join("\u0000");
    if (link.target === "" || seen.has(key)) return;
    seen.add(key);
    links.push(link);
  };

  chunks(text).forEach((chunk, order) => {
    const body = chunk.lines.join("\n");
    const id = BLOCK_ID.exec(chunk.lines.at(-1)!)?.[1] ?? null;
    if (id) {
      blocks.push({
        id,
        type: chunk.type,
        text: chunk.lines.map(plain).filter(Boolean).join(" "),
        order,
      });
    }
    if (chunk.type === "heading") {
      const m = HEADING.exec(chunk.lines[0]!)!;
      headings.push({ level: m[1]!.length, text: plain(chunk.lines[0]!) });
    }
    for (const m of body.matchAll(TAG)) tags.add(m[1]!);
    for (const m of body.matchAll(WIKILINK)) {
      const { target, heading, blockId } = splitTarget(m[2]!);
      add({
        kind: m[1] ? "embed" : "link",
        syntax: "wikilink",
        target,
        heading,
        blockId,
        sourceBlockId: id,
      });
    }
    for (const m of body.matchAll(MD_LINK)) {
      const href = m[2]!;
      if (href.startsWith("#") || SCHEME.test(href)) continue;
      const { target, heading, blockId } = splitTarget(safeDecode(href));
      if (!target || NON_MARKDOWN_FILE.test(target)) continue;
      add({
        kind: m[1] ? "embed" : "link",
        syntax: "markdown",
        target,
        heading,
        blockId,
        sourceBlockId: id,
      });
    }
  });
  return {
    links,
    blocks,
    headings,
    tags: [...tags],
    text: text.split("\n").map(plain).filter(Boolean).join("\n"),
  };
}

// Only the links. Kept for callers of the first API.
export function extractLinks(markdown: string): ExtractedLink[] {
  return extract(markdown).links;
}

// Normalises a link target or a title to the key used for title-based resolution:
// last path segment, no `.md`, trimmed, lower-cased.
export function linkKey(refOrTitle: string): string {
  const last = refOrTitle.split("/").pop() ?? refOrTitle;
  return last.replace(/\.md$/i, "").trim().normalize("NFC").toLowerCase();
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
