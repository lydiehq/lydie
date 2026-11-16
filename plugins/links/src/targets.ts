// Pure link helpers: parsing and writing wiki links and Markdown hrefs, preview targets, and the
// part of a document a `#heading` or `#^block` points at. No data access here.
import type { DocumentOutline, JSONContent } from "@lydie/plugin-api";

export type WikiTarget = {
  // Path or title as written, without `.md` or the `#part` (empty: this document).
  target: string;
  heading: string | null;
  blockId: string | null;
  alias: string | null;
};

// The text between `[[` and `]]`: `Note#Heading|alias`, `Note#^block`, `#Heading`.
export function parseWikiTarget(inner: string): WikiTarget {
  const pipe = inner.indexOf("|");
  const ref = pipe === -1 ? inner : inner.slice(0, pipe);
  const alias = pipe === -1 ? null : inner.slice(pipe + 1).trim() || null;
  const hash = ref.indexOf("#");
  const target = (hash === -1 ? ref : ref.slice(0, hash)).trim().replace(/\.md$/i, "");
  const fragment = hash === -1 ? "" : ref.slice(hash + 1).trim();
  if (fragment.startsWith("^"))
    return { target, heading: null, blockId: fragment.slice(1) || null, alias };
  return { target, heading: fragment || null, blockId: null, alias };
}

// `Note#Heading` / `Note#^block` (no alias, no brackets).
export function formatWikiTarget(t: Pick<WikiTarget, "target" | "heading" | "blockId">): string {
  if (t.blockId) return `${t.target}#^${t.blockId}`;
  if (t.heading) return `${t.target}#${t.heading}`;
  return t.target;
}

export function formatWikiLink(t: WikiTarget): string {
  return `[[${formatWikiTarget(t)}${t.alias ? `|${t.alias}` : ""}]]`;
}

// What a link shows when it has no alias.
export function defaultLabel(t: Pick<WikiTarget, "target" | "heading" | "blockId">): string {
  return [t.target, t.heading, t.blockId && `^${t.blockId}`].filter(Boolean).join(" > ");
}

// A scheme other than a relative path: https:, mailto:, obsidian:, … (`C:` drive letters are not).
export function isExternalHref(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) && !/^[a-z]:[\\/]/i.test(href);
}

const OPENABLE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

// The URL to open for an external href, or null when its scheme is not one a link may open.
// Documents come from collaborators and imports, so `javascript:`, `data:`, `file:` and other
// apps' protocol handlers are refused. The URL parser drops the whitespace and control characters
// a browser would ignore, so the scheme checked is the one that would run.
export function openableUrl(href: string): string | null {
  try {
    const url = new URL(href);
    return OPENABLE_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function looksLikeUrl(text: string): boolean {
  const t = text.trim();
  if (/\s/.test(t) || !t) return false;
  if (isExternalHref(t)) return true;
  return /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i.test(t);
}

export function normalizeUrl(text: string): string {
  const t = text.trim();
  return isExternalHref(t) ? t : `https://${t}`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// An internal Markdown link (`Folder/My%20note.md#Heading`) as a wiki target.
export function hrefToTarget(href: string): WikiTarget {
  const hash = href.indexOf("#");
  const path = safeDecode(hash === -1 ? href : href.slice(0, hash)).replace(/^\.\//, "");
  const fragment = hash === -1 ? "" : safeDecode(href.slice(hash + 1));
  const target = path.replace(/\.md$/i, "");
  if (fragment.startsWith("^"))
    return { target, heading: null, blockId: fragment.slice(1) || null, alias: null };
  return { target, heading: fragment || null, blockId: null, alias: null };
}

// The Markdown-link form Obsidian writes: `My%20note.md#Heading%20text`.
export function targetToHref(t: Pick<WikiTarget, "target" | "heading" | "blockId">): string {
  const encode = (s: string) => encodeURI(s).replace(/[()#?]/g, (c) => encodeURIComponent(c));
  const path = t.target ? `${encode(t.target)}.md` : "";
  if (t.blockId) return `${path}#^${t.blockId}`;
  if (t.heading) return `${path}#${encode(t.heading)}`;
  return path;
}

// The key links resolve by (as the runtime's `linkKey`): last path segment, no `.md`, folded.
export function linkKey(refOrTitle: string): string {
  const last = refOrTitle.split("/").pop() ?? refOrTitle;
  return last
    .replace(/\.(md|base)$/i, "")
    .trim()
    .normalize("NFC")
    .toLowerCase();
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ---- Preview targets: `doc:<id>[#Heading|#^block]` or a wiki target

export type PreviewTarget =
  | { kind: "doc"; id: string; heading: string | null; blockId: string | null }
  | { kind: "wiki"; link: WikiTarget }
  | { kind: "url"; href: string };

export function parsePreviewTarget(target: string): PreviewTarget {
  if (target.startsWith("doc:")) {
    const link = parseWikiTarget(target.slice(4));
    return { kind: "doc", id: link.target, heading: link.heading, blockId: link.blockId };
  }
  if (isExternalHref(target)) return { kind: "url", href: target };
  return { kind: "wiki", link: parseWikiTarget(target) };
}

// ---- Sections

function textOf(node: JSONContent): string {
  return node.text ?? (node.content ?? []).map(textOf).join("");
}

export function headingMatches(text: string, wanted: string): boolean {
  const norm = (s: string) =>
    s
      .replace(/\s\^[A-Za-z0-9-]+$/, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  return norm(text) === norm(wanted);
}

// The top-level nodes a heading or block link points at: a heading and everything up to the next
// heading of the same or a higher level; a block alone. The whole document without a part.
export function sectionOf(
  content: JSONContent,
  outline: DocumentOutline,
  part: { heading?: string | null; blockId?: string | null },
): { nodes: JSONContent[]; found: boolean } {
  const nodes = content.content ?? [];
  if (part.blockId) {
    const block = outline.blocks.find((b) => b.id === part.blockId);
    const node = block ? nodes[block.index] : undefined;
    return node ? { nodes: [node], found: true } : { nodes: [], found: false };
  }
  if (part.heading) {
    const start = nodes.findIndex(
      (n) => n.type === "heading" && headingMatches(textOf(n), part.heading!),
    );
    if (start === -1) return { nodes: [], found: false };
    const level = Number(nodes[start]!.attrs?.level ?? 1);
    let end = start + 1;
    while (end < nodes.length) {
      const n = nodes[end]!;
      if (n.type === "heading" && Number(n.attrs?.level ?? 1) <= level) break;
      end++;
    }
    return { nodes: nodes.slice(start, end), found: true };
  }
  return { nodes, found: true };
}

const IMAGE = /\.(png|jpe?g|gif|svg|webp|avif|bmp)$/i;

export function isImageTarget(target: string): boolean {
  return IMAGE.test(target.split("#")[0]!.trim());
}

// Where a note created from an unresolved link goes: beside the note that links to it, which is
// also where link resolution looks first, so the link resolves to it.
export function newNoteTitle(target: string): string {
  return (target.split("/").pop() ?? target).replace(/\.md$/i, "").trim() || "Untitled";
}
