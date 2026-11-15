// ProseMirror → Lydie Markdown, canonical style. Used for new documents and for blocks that changed.
//
// Every block serializer returns text whose first line carries no prefix and whose later lines
// already carry `ctx.prefix` (the absolute container prefix: indentation, `> ` markers). That lets
// containers mix freshly serialised children with verbatim slices of the original source.
import type { Mark, Node } from "prosemirror-model";

import { normalizeForMarkdown } from "./normalize";
import type { Hints } from "./parse";
import { schema } from "./schema";

export type SerializeCtx = {
  eol: string;
  // Prefix for every line after the first.
  prefix: string;
  hints?: Hints;
  inTable?: boolean;
  // Escape every punctuation character that could have a meaning (fallback when verification fails).
  aggressive?: boolean;
  // List markers the next list must not use, so adjacent lists do not merge.
  avoidMarkers?: string[];
  // The block starts the file, where `---` would open frontmatter.
  atFileStart?: boolean;
};

export function joinLines(lines: string[], prefix: string, eol: string): string {
  const blank = prefix.trimEnd();
  let out = lines[0] ?? "";
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    out += eol + (line === "" ? blank : prefix + line);
  }
  return out;
}

export function blankSeparator(prefix: string, eol: string): string {
  return eol + prefix.trimEnd() + eol + prefix;
}

// Separator placed before `child` inside a freshly serialised container.
function childSeparator(parent: Node, child: Node, prefix: string, eol: string): string {
  const t = parent.type.name;
  if (t === "bulletList" || t === "orderedList" || t === "taskList") return eol + prefix;
  if ((t === "listItem" || t === "taskItem") && isList(child)) return eol + prefix;
  return blankSeparator(prefix, eol);
}

export function isList(node: Node): boolean {
  const t = node.type.name;
  return t === "bulletList" || t === "orderedList" || t === "taskList";
}

export function isEmptyParagraph(node: Node): boolean {
  return node.type === schema.nodes.paragraph && node.childCount === 0;
}

// The marker that starts a serialised list, for keeping adjacent lists apart.
export function listMarkerOf(text: string): string | null {
  const m = /^[ \t]*(?:([-*+])|\d{1,9}([.)]))(?:[ \t]|$|\r|\n)/.exec(text);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

export function serializeChildren(parent: Node, ctx: SerializeCtx): string {
  let out = "";
  let prev: Node | null = null;
  let prevText = "";
  const n = parent.childCount;
  parent.forEach((child, _, i) => {
    if (isEmptyParagraph(child) && n > 1 && !(i === 0 && isItem(parent))) return;
    const avoid: string[] = [];
    if (prev && isList(prev) && isList(child)) {
      const m = listMarkerOf(prevText);
      if (m) avoid.push(m);
    }
    const text = serializeBlock(child, {
      ...ctx,
      hints: undefined,
      avoidMarkers: avoid,
      atFileStart: ctx.atFileStart && prev === null,
    });
    if (prev) out += childSeparator(parent, child, ctx.prefix, ctx.eol);
    out += text;
    prev = child;
    prevText = text;
  });
  return out;
}

function isItem(node: Node): boolean {
  return node.type === schema.nodes.listItem || node.type === schema.nodes.taskItem;
}

export function serializeBody(doc: Node, eol: string): string {
  const body = serializeChildren(normalizeForMarkdown(doc), { eol, prefix: "", atFileStart: true });
  return body === "" ? "" : body + eol;
}

// Markdown for one block, see the module comment for the prefix convention.
export function serializeBlock(node: Node, ctx: SerializeCtx): string {
  const { eol, prefix } = ctx;
  switch (node.type.name) {
    case "paragraph":
      return joinLines(escapeLineStarts(serializeInline(node, ctx).split("\n")), prefix, eol);
    case "heading":
      return heading(node, ctx);
    case "codeBlock":
      return codeBlock(node, ctx);
    case "mathBlock": {
      const latex = node.textContent;
      return joinLines(["$$", ...(latex ? latex.split("\n") : []), "$$"], prefix, eol);
    }
    case "horizontalRule":
      return ctx.atFileStart ? "***" : "---";
    case "blockquote": {
      const inner = serializeChildren(node, { ...ctx, prefix: prefix + "> " });
      return inner === "" ? ">" : "> " + inner;
    }
    case "callout": {
      const fold = (node.attrs.fold as string | null) ?? "";
      const title = ((node.attrs.title as string | null) ?? "").replace(/\s*\n\s*/g, " ");
      const header = `> [!${node.attrs.kind as string}]${fold}${title ? " " + title : ""}`;
      const inner = serializeChildren(node, { ...ctx, prefix: prefix + "> " });
      return inner === "" ? header : header + eol + prefix + "> " + inner;
    }
    case "bulletList":
    case "taskList":
    case "orderedList":
      return list(node, ctx);
    case "table":
      return table(node, ctx);
    case "footnoteDefinition": {
      const inner = serializeChildren(node, { ...ctx, prefix: prefix + "    " });
      const head = `[^${node.attrs.label as string}]:`;
      return inner === "" ? head : `${head} ${inner}`;
    }
    case "directive":
      return directive(node, ctx);
    case "columnList":
      return directive(node, ctx, "columns", {});
    case "column":
      return directive(node, ctx, "column", columnAttrs(node));
    case "embed":
      return `![[${wikiInner(node, false)}]]`;
    case "rawBlock":
      return joinLines((node.attrs.source as string).split("\n"), prefix, eol);
    default:
      throw new Error(`cannot serialise block node "${node.type.name}"`);
  }
}

function heading(node: Node, ctx: SerializeCtx): string {
  const level = node.attrs.level as number;
  const text = serializeInline(node, ctx);
  if (text.includes("\n") && level <= 2) {
    const lines = escapeLineStarts(text.split("\n"));
    return joinLines([...lines, level === 1 ? "===" : "---"], ctx.prefix, ctx.eol);
  }
  const flat = text.replace(/\n/g, " ");
  if (flat === "") return "#".repeat(level);
  // A trailing run of `#` after a space would be read as the closing sequence.
  const safe = flat.replace(/(^|[ \t])(#+)$/, "$1\\$2");
  return `${"#".repeat(level)} ${safe}`;
}

function codeBlock(node: Node, ctx: SerializeCtx): string {
  const language = (node.attrs.language as string | null) ?? "";
  const content = node.textContent;
  const lines = content === "" ? [] : content.split("\n");
  const hints = ctx.hints;
  if (
    hints?.indented &&
    !language &&
    lines.length &&
    lines[0]!.trim() !== "" &&
    lines[lines.length - 1]!.trim() !== ""
  ) {
    return joinLines(
      lines.map((l) => (l === "" ? "" : "    " + l)),
      ctx.prefix,
      ctx.eol,
    );
  }
  let char = hints?.fence?.[0] === "~" ? "~" : "`";
  if (char === "`" && language.includes("`")) char = "~";
  let size = Math.max(3, hints?.fence?.length ?? 3);
  for (const line of lines) {
    const m = new RegExp(`^ {0,3}(\\${char}+)`).exec(line);
    if (m?.[1] && m[1].length >= size) size = m[1].length + 1;
  }
  const fence = char.repeat(size);
  return joinLines([fence + language, ...lines, fence], ctx.prefix, ctx.eol);
}

const BULLETS = ["-", "*", "+"] as const;

function list(node: Node, ctx: SerializeCtx): string {
  const { eol, prefix } = ctx;
  const avoid = ctx.avoidMarkers ?? [];
  const ordered = node.type === schema.nodes.orderedList;
  let bullet: string = ctx.hints?.bullet ?? "-";
  if (avoid.includes(bullet)) bullet = BULLETS.find((b) => !avoid.includes(b)) ?? bullet;
  let delimiter: string = ctx.hints?.delimiter ?? ".";
  if (avoid.includes(delimiter)) delimiter = delimiter === "." ? ")" : ".";
  const check = ctx.hints?.check ?? "x";
  const start = ordered ? ((node.attrs.start as number | null) ?? 1) : 1;
  const items: string[] = [];
  node.forEach((item, _, i) => {
    const marker = ordered ? `${start + i}${delimiter} ` : `${bullet} `;
    items.push(
      serializeListItem(item, marker, { ...ctx, hints: undefined, avoidMarkers: [] }, check),
    );
  });
  return items.join(eol + prefix);
}

// One list item. `marker` is the list marker with its trailing whitespace, e.g. "- " or "10. ".
export function serializeListItem(
  item: Node,
  marker: string,
  ctx: SerializeCtx,
  check = "x",
): string {
  const width = marker.replace(/\t/g, "    ").length;
  const childPrefix = ctx.prefix + " ".repeat(width);
  let head = marker;
  if (item.type === schema.nodes.taskItem) head += item.attrs.checked ? `[${check}] ` : "[ ] ";
  const inner = serializeChildren(item, {
    ...ctx,
    prefix: childPrefix,
    hints: undefined,
    avoidMarkers: [],
  });
  return inner === "" ? head.trimEnd() : head + inner;
}

function table(node: Node, ctx: SerializeCtx): string {
  const lines: string[] = [];
  const cellCtx: SerializeCtx = { ...ctx, inTable: true };
  node.forEach((row, _, r) => {
    const cells: string[] = [];
    row.forEach((cell) => {
      const p = cell.firstChild;
      cells.push(p ? serializeInline(p, cellCtx).replace(/\n/g, " ") : "");
    });
    lines.push(`| ${cells.join(" | ")} |`);
    if (r === 0) {
      const align: string[] = [];
      row.forEach((cell) => {
        const a = cell.attrs.align as string | null;
        align.push(a === "left" ? ":--" : a === "center" ? ":-:" : a === "right" ? "--:" : "---");
      });
      lines.push(`| ${align.join(" | ")} |`);
    }
  });
  return joinLines(lines, ctx.prefix, ctx.eol);
}

// Nodes written as container directives; an outer one needs a longer fence than any inside it.
const FENCED = new Set([schema.nodes.directive, schema.nodes.columnList, schema.nodes.column]);

function directiveDepth(node: Node): number {
  let depth = 0;
  node.forEach((child) => {
    if (FENCED.has(child.type)) depth = Math.max(depth, 1 + directiveDepth(child));
    else if (!child.isLeaf && !child.isTextblock) depth = Math.max(depth, directiveDepth(child));
  });
  return depth;
}

function directiveAttrs(attrs: Record<string, unknown>): string {
  const entries = Object.entries(attrs ?? {});
  if (!entries.length) return "";
  const parts = entries.map(([k, v]) => {
    const value = (
      typeof v === "string" ? v : v === null || v === undefined ? "" : JSON.stringify(v)
    )
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;");
    return `${k}="${value}"`;
  });
  return `{${parts.join(" ")}}`;
}

function columnAttrs(node: Node): Record<string, string> {
  const width = node.attrs.width as number | null;
  return typeof width === "number" && Number.isFinite(width) && width > 0 && width < 1000
    ? { width: `${String(width)}%` }
    : {};
}

function directive(
  node: Node,
  ctx: SerializeCtx,
  name = node.attrs.name as string,
  attrs = node.attrs.attrs as Record<string, unknown>,
): string {
  const fence = ":".repeat(3 + directiveDepth(node));
  const open = `${fence}${name}${directiveAttrs(attrs)}`;
  const inner = serializeChildren(node, { ...ctx, hints: undefined, avoidMarkers: [] });
  const { eol, prefix } = ctx;
  return inner === ""
    ? open + eol + prefix + fence
    : open + eol + prefix + inner + eol + prefix + fence;
}

function wikiInner(node: Node, inTable: boolean): string {
  const a = node.attrs as {
    target: string;
    heading: string | null;
    blockId: string | null;
    alias: string | null;
  };
  let out = a.target ?? "";
  if (a.heading !== null && a.heading !== undefined) out += "#" + a.heading;
  if (a.blockId !== null && a.blockId !== undefined) out += "#^" + a.blockId;
  if (a.alias !== null && a.alias !== undefined) out += (inTable ? "\\|" : "|") + a.alias;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Lines inside paragraphs and setext headings

function escapeLineStarts(lines: string[]): string[] {
  return lines.map((line, i) => {
    let m: RegExpExecArray | null;
    if ((m = /^(#{1,6})(?=[ \t]|$)/.exec(line))) return "\\" + line;
    if (/^>/.test(line)) return "\\" + line;
    if (/^[-+*](?=[ \t]|$)/.test(line)) return "\\" + line;
    if ((m = /^(\d{1,9})([.)])(?=[ \t]|$)/.exec(line)))
      return `${m[1]}\\${line.slice(m[1]!.length)}`;
    if (/^([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(line)) return "\\" + line;
    if (i > 0 && /^(?:=+|-+)[ \t]*$/.test(line)) return "\\" + line;
    if (/^`{3,}[^`]*$/.test(line) || /^(?:~~~|:::|\$\$)/.test(line)) return "\\" + line;
    if (/^\+/.test(line) && /^\+(?=[ \t]|$)/.test(line)) return "\\" + line;
    return line;
  });
}

// ---------------------------------------------------------------------------------------------
// Inline content

const ASCII_PUNCT = /[!-/:-@[-`{-~]/;

function isWs(ch: string): boolean {
  return ch === "" || /\s/.test(ch);
}
function isAlnum(ch: string): boolean {
  return /[\p{L}\p{N}]/u.test(ch);
}

type Item = { node: Node; marks: readonly Mark[] };

const DELIM: Record<string, [string, string]> = {
  bold: ["**", "**"],
  italic: ["*", "*"],
  strike: ["~~", "~~"],
  highlight: ["==", "=="],
};

function inlineItems(node: Node): Item[] {
  const items: Item[] = [];
  node.forEach((child) =>
    items.push({ node: child, marks: child.marks.filter((m) => m.type !== schema.marks.code) }),
  );
  return items;
}

// Serialises the inline content of a textblock. Soft line breaks stay "\n"; the caller prefixes lines.
export function serializeInline(node: Node, ctx: SerializeCtx): string {
  const items = inlineItems(node);
  const stack: Mark[] = [];
  let out = "";
  const hints = ctx.hints;

  const closeFrom = (index: number) => {
    while (stack.length > index) {
      const mark = stack.pop()!;
      out += closeMark(mark);
    }
  };
  const closeMark = (mark: Mark): string => {
    if (mark.type === schema.marks.link) return linkClose(mark);
    const d = delim(mark);
    return d;
  };
  const delim = (mark: Mark): string => {
    const name = mark.type.name;
    if (name === "italic") return hints?.em === "_" ? "_" : "*";
    if (name === "bold") return hints?.strong === "__" ? "__" : "**";
    return DELIM[name]?.[0] ?? "";
  };
  const linkClose = (mark: Mark): string => {
    const href = mark.attrs.href as string;
    const title = mark.attrs.title as string | null;
    return `](${destination(href)}${title ? ` "${title.replace(/(["\\])/g, "\\$1")}"` : ""})`;
  };

  for (let i = 0; i < items.length; i++) {
    const { node: child, marks } = items[i]!;
    let keep = 0;
    while (keep < stack.length && marks.some((m) => m.eq(stack[keep]!))) keep++;
    closeFrom(keep);

    // Autolinks: a link whose only content is its own URL is written without brackets.
    const linkMark = marks.find((m) => m.type === schema.marks.link);
    if (linkMark && !stack.includes(linkMark)) {
      const auto = autolink(items, i, linkMark, out);
      if (auto) {
        // Marks other than the link still open around it.
        for (const m of marks) {
          if (m !== linkMark && !stack.some((s) => s.eq(m))) {
            out += delim(m);
            stack.push(m);
          }
        }
        out += auto.text;
        i = auto.end - 1;
        continue;
      }
    }
    // Marks that last longer open first (outside), so they need not close and reopen.
    const opening = marks
      .filter((m) => !stack.some((s) => s.eq(m)))
      .sort(
        (a, b) =>
          runLength(items, i, b) - runLength(items, i, a) ||
          (a.type === schema.marks.link ? -1 : b.type === schema.marks.link ? 1 : 0),
      );
    for (const m of opening) {
      out += m.type === schema.marks.link ? "[" : delimFor(m, out, items, i);
      stack.push(m);
    }
    const insideLink = stack.some((m) => m.type === schema.marks.link);
    const after = nextChar(items, i);
    out += inlineAtom(child, ctx, lastChar(out), after, insideLink);
  }
  closeFrom(0);
  return out;

  // `_` cannot open or close intraword; fall back to `*` there.
  function delimFor(m: Mark, before: string, list: Item[], i: number): string {
    const d = delim(m);
    if (d[0] !== "_") return d;
    const prev = lastChar(before);
    const first = list[i]?.node.isText ? ((list[i]!.node.text ?? "")[0] ?? "") : "";
    if (isAlnum(prev) || !first) return m.type.name === "italic" ? "*" : "**";
    return d;
  }
}

function runLength(items: Item[], i: number, mark: Mark): number {
  let n = 0;
  while (i + n < items.length && items[i + n]!.marks.some((m) => m.eq(mark))) n++;
  return n;
}

function lastChar(s: string): string {
  return s.length ? s[s.length - 1]! : "";
}

function nextChar(items: Item[], i: number): string {
  const next = items[i + 1]?.node;
  if (!next) return "";
  if (next.isText) return next.text?.[0] ?? "";
  switch (next.type.name) {
    case "rawInline":
      return (next.attrs.source as string)[0] ?? "";
    case "wikiLink":
    case "footnoteReference":
      return "[";
    case "image":
      return "!";
    case "mathInline":
      return "$";
    case "hardBreak":
      return "\n";
    default:
      return "x";
  }
}

function autolink(
  items: Item[],
  i: number,
  link: Mark,
  before: string,
): { text: string; end: number } | null {
  const node = items[i]!.node;
  if (!node.isText || node.marks.some((m) => m.type === schema.marks.code)) return null;
  const next = items[i + 1];
  if (next && next.marks.some((m) => m.eq(link))) return null;
  const text = node.text ?? "";
  const href = link.attrs.href as string;
  if (link.attrs.title) return null;
  const prev = lastChar(before);
  // A bare URL extends over following non-space text, so only write one when what follows ends it.
  const follow = next?.node.isText ? (next.node.text ?? "") : next ? "x" : "";
  const endsUrl = follow === "" || /^\s/.test(follow) || /^[).,;:!?*_~]+(\s|$)/.test(follow);
  const bareOk = (isWs(prev) || /[*_~(]/.test(prev)) && endsUrl;
  if (text === href) {
    if (
      bareOk &&
      /^https?:\/\/[\w-]+(\.[\w-]+)+(\/[\w/%~+=&#-]*)?$/.test(href) &&
      /[\w/]$/.test(href)
    ) {
      return { text, end: i + 1 };
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^\s<>]*$/.test(href))
      return { text: `<${href}>`, end: i + 1 };
  }
  if (href === `mailto:${text}` && /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(text)) {
    return { text: `<${text}>`, end: i + 1 };
  }
  if (
    href === `http://${text}` &&
    bareOk &&
    /^www\.[\w-]+(\.[\w-]+)+(\/[\w/%~+=&#-]*)?$/.test(text) &&
    /[\w/]$/.test(text)
  ) {
    return { text, end: i + 1 };
  }
  return null;
}

function destination(href: string): string {
  if (href === "") return "<>";
  let depth = 0;
  let balanced = true;
  for (const ch of href) {
    if (ch === "(") depth++;
    else if (ch === ")" && --depth < 0) balanced = false;
  }
  if (depth !== 0) balanced = false;
  if (/[\s<>]/.test(href) || !balanced) return `<${href.replace(/([<>\\])/g, "\\$1")}>`;
  return href.replace(/\\(?=[!-/:-@[-`{-~]|$)/g, "\\\\");
}

function inlineAtom(
  node: Node,
  ctx: SerializeCtx,
  before: string,
  after: string,
  insideLink: boolean,
): string {
  switch (node.type.name) {
    case "text": {
      const text = node.text ?? "";
      if (node.marks.some((m) => m.type === schema.marks.code))
        return codeSpan(text, ctx.inTable ?? false);
      return escapeText(text, ctx, before, after, insideLink);
    }
    case "hardBreak":
      return ctx.hints?.hardBreak === "  " ? "  \n" : "\\\n";
    case "image": {
      const alt = ((node.attrs.alt as string | null) ?? "").replace(/([\\[\]])/g, "\\$1");
      const title = node.attrs.title as string | null;
      return `![${alt}](${destination((node.attrs.src as string | null) ?? "")}${title ? ` "${title.replace(/(["\\])/g, "\\$1")}"` : ""})`;
    }
    case "wikiLink":
      return `[[${wikiInner(node, ctx.inTable ?? false)}]]`;
    case "mathInline":
      return `$${node.textContent}$`;
    case "footnoteReference":
      return `[^${node.attrs.label as string}]`;
    case "rawInline":
      return node.attrs.source as string;
    default:
      throw new Error(`cannot serialise inline node "${node.type.name}"`);
  }
}

function codeSpan(text: string, inTable: boolean): string {
  let longest = 0;
  for (const m of text.matchAll(/`+/g)) longest = Math.max(longest, m[0].length);
  const fence = "`".repeat(longest + 1);
  const pad =
    text.startsWith("`") ||
    text.endsWith("`") ||
    (text.startsWith(" ") && text.endsWith(" ") && text.trim() !== "")
      ? " "
      : "";
  const body = inTable ? text.replace(/\|/g, "\\|") : text;
  return fence + pad + body + pad + fence;
}

const AGGRESSIVE = /[\\`*_[\]<>&~=$%|#!{}()+\-.:^"']/;

export function escapeText(
  text: string,
  ctx: SerializeCtx,
  before: string,
  after: string,
  insideLink: boolean,
): string {
  let out = "";
  const dollars = (text.match(/\$/g) ?? []).length;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const prev = i > 0 ? text[i - 1]! : before;
    const next = i < text.length - 1 ? text[i + 1]! : after;
    if (ch === "\n") {
      out += ch;
      continue;
    }
    if (ctx.aggressive && AGGRESSIVE.test(ch)) {
      out += "\\" + ch;
      continue;
    }
    let esc = false;
    switch (ch) {
      case "\\":
        // At the end of a text node a delimiter or atom may follow, so escape there too.
        esc = i === text.length - 1 || next === "\n" || ASCII_PUNCT.test(next);
        break;
      case "`":
      case "[":
        esc = true;
        break;
      case "]":
        esc = insideLink;
        break;
      case "*":
        esc = !(isWs(prev) && isWs(next));
        break;
      case "_":
        esc = !(isAlnum(prev) && isAlnum(next)) && !(isWs(prev) && isWs(next));
        break;
      case "<":
        esc = /[A-Za-z/!?]/.test(next);
        break;
      case "&":
        esc = /^&(?:#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/.test(
          text.slice(i) + after,
        );
        break;
      case "~":
        esc = next === "~" || prev === "~";
        break;
      case "=":
        esc =
          (next === "=" || prev === "=") &&
          !(
            isWs(prev === "=" ? (text[i - 2] ?? before) : prev) &&
            isWs(next === "=" ? (text[i + 2] ?? after) : next)
          );
        break;
      case "$":
        esc =
          dollars > 1 ||
          before === "$" ||
          after === "$" ||
          prev === "$" ||
          next === "$" ||
          (!isWs(next) && after.includes("$"));
        break;
      case "%":
        esc = next === "%" || prev === "%";
        break;
      case "|":
        esc = ctx.inTable ?? false;
        break;
      case "!":
        esc = next === "[";
        break;
    }
    out += esc ? "\\" + ch : ch;
  }
  return out;
}
