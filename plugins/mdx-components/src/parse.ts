// Reading MDX out of what the editor already has. An MDX file opens in Lydie as ordinary blocks:
// component tags are raw blocks ("Markdown source"), `import`/`export` lines are paragraphs. Nothing
// here changes the document; it only says what those blocks are, so they can be shown as what they
// mean. Pure functions, no editor.

export type Prop = {
  name: string;
  // A string's text, an expression's source without its braces, null for a flag.
  value: string | null;
  kind: "string" | "expression" | "flag";
};

export type Tag = { kind: "open" | "close" | "self"; name: string; props: Prop[] };

const NAME = /^[A-Z][A-Za-z0-9_.]*/;

// A block that is exactly one component tag: `<Name a="x" b={y}>`, `<Name … />` or `</Name>`.
// Components only (capitalised names): HTML stays as it is.
export function parseTag(source: string): Tag | null {
  const text = source.trim();
  const close = /^<\/([A-Z][A-Za-z0-9_.]*)\s*>$/.exec(text);
  if (close) return { kind: "close", name: close[1]!, props: [] };
  // The one piece of HTML that is a component in all but name: a disclosure and its summary.
  const details = /^<details[^>]*>\s*(?:<summary>([\s\S]*?)<\/summary>)?$/.exec(text);
  if (details) {
    const title = details[1]?.replace(/<[^>]+>/g, "").trim();
    return {
      kind: "open",
      name: "details",
      props: title ? [{ name: "title", value: title, kind: "string" }] : [],
    };
  }
  if (/^<\/details>$/.test(text)) return { kind: "close", name: "details", props: [] };
  if (!text.startsWith("<")) return null;
  const name = NAME.exec(text.slice(1))?.[0];
  if (!name) return null;
  const props: Prop[] = [];
  let i = 1 + name.length;
  for (;;) {
    while (i < text.length && /\s/.test(text[i]!)) i++;
    if (i >= text.length) return null;
    if (text.startsWith("/>", i))
      return i + 2 === text.length ? { kind: "self", name, props } : null;
    if (text[i] === ">") return i + 1 === text.length ? { kind: "open", name, props } : null;
    const attr = /^[A-Za-z_:][\w:.-]*/.exec(text.slice(i))?.[0];
    if (!attr) return null;
    i += attr.length;
    if (text[i] !== "=") {
      props.push({ name: attr, value: null, kind: "flag" });
      continue;
    }
    i++;
    const quote = text[i];
    if (quote === '"' || quote === "'") {
      const end = text.indexOf(quote, i + 1);
      if (end === -1) return null;
      props.push({ name: attr, value: text.slice(i + 1, end), kind: "string" });
      i = end + 1;
    } else if (quote === "{") {
      const end = closingBrace(text, i);
      if (end === -1) return null;
      props.push({ name: attr, value: text.slice(i + 1, end).trim(), kind: "expression" });
      i = end + 1;
    } else return null;
  }
}

// The `}` that closes the `{` at `start`, skipping braces inside strings.
function closingBrace(text: string, start: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return i;
  }
  return -1;
}

const ESM =
  /^\s*(import\s[\s\S]*?from\s+['"][^'"]+['"]|import\s+['"][^'"]+['"]|export\s+(const|let|var|default|function)\b)/;

// A paragraph that is module code: `import … from '…'`, `export const …`.
export const isEsm = (text: string) => ESM.test(text);

// String constants a file exports (`export const Shot = "https://…"`): what a prop like
// `image={Shot}` refers to.
export function constants(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const pattern = /export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*\n?\s*["'`]([^"'`\n]+)["'`]/g;
  for (const match of text.matchAll(pattern)) out.set(match[1]!, match[2]!);
  return out;
}

export type Block = { type: string; text: string; from: number; to: number };

export type Region =
  // A run of import/export paragraphs.
  | { kind: "esm"; blocks: Block[]; imports: number; exports: number }
  // `<Name>` … `</Name>` with blocks between.
  | { kind: "container"; tag: Tag; open: Block; close: Block; inner: Block[]; depth: number }
  // `<Name … />`.
  | { kind: "leaf"; tag: Tag; block: Block };

// What a document's top-level blocks are, in MDX terms. A tag without its partner is left alone.
export function regions(blocks: readonly Block[]): Region[] {
  const out: Region[] = [];
  const stack: Array<{ tag: Tag; index: number }> = [];
  let esm: Block[] = [];
  const flush = () => {
    if (esm.length === 0) return;
    out.push({
      kind: "esm",
      blocks: esm,
      // By line: a file's imports and exports often sit in one paragraph.
      imports: esm.flatMap((b) => b.text.split("\n")).filter((l) => /^\s*import\b/.test(l)).length,
      exports: esm.flatMap((b) => b.text.split("\n")).filter((l) => /^\s*export\b/.test(l)).length,
    });
    esm = [];
  };
  blocks.forEach((block, index) => {
    if (block.type === "paragraph" && stack.length === 0 && isEsm(block.text)) {
      esm.push(block);
      return;
    }
    flush();
    // A tag written over several lines is not an HTML block to Markdown: it arrives as a
    // paragraph whose text is the tag.
    if (block.type !== "rawBlock" && block.type !== "paragraph") return;
    const tag = parseTag(block.text);
    if (!tag) return;
    if (tag.kind === "self") out.push({ kind: "leaf", tag, block });
    else if (tag.kind === "open") stack.push({ tag, index });
    else {
      // The nearest opening tag of that name; anything opened after it was never closed.
      const at = stack.map((s) => s.tag.name).lastIndexOf(tag.name);
      if (at === -1) return;
      const opened = stack[at]!;
      stack.length = at;
      out.push({
        kind: "container",
        tag: opened.tag,
        open: blocks[opened.index]!,
        close: block,
        inner: blocks.slice(opened.index + 1, index),
        depth: at,
      });
    }
  });
  flush();
  return out.sort((a, b) => start(a) - start(b));
}

const start = (region: Region) =>
  region.kind === "esm"
    ? region.blocks[0]!.from
    : region.kind === "leaf"
      ? region.block.from
      : region.open.from;

// How a component reads: the words on it and the colour of its kind.
export type Tone = "info" | "warning" | "danger" | "success" | "neutral";

export function toneOf(tag: Tag): Tone {
  const hint = [
    tag.name,
    ...tag.props
      .filter((p) => /^(type|variant|kind|intent|severity|status|icon)$/i.test(p.name))
      .map((p) => p.value ?? ""),
  ]
    .join(" ")
    .toLowerCase();
  if (/danger|error|critical|destructive/.test(hint)) return "danger";
  if (/warn|caution|attention/.test(hint)) return "warning";
  if (/success|tip|check|done/.test(hint)) return "success";
  if (/info|note|fyi|callout|admonition|hint/.test(hint)) return "info";
  return "neutral";
}

export const prop = (tag: Tag, ...names: string[]) =>
  tag.props.find((p) => names.includes(p.name) && p.kind === "string")?.value ?? null;

// "CalloutBox" → "Callout box"; "ProductScreenshot" → "Product screenshot".
export function readableName(name: string): string {
  const words = name
    .split(".")
    .pop()!
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i;

// Pictures a component points at: a prop that is an image URL, or names an exported constant
// that is one. The same picture in a light and a dark variant shows once.
export function images(
  tag: Tag,
  known: ReadonlyMap<string, string>,
): Array<{ name: string; url: string }> {
  const out: Array<{ name: string; url: string }> = [];
  for (const p of tag.props) {
    const url =
      p.kind === "string"
        ? p.value
        : p.kind === "expression"
          ? (known.get(p.value ?? "") ?? null)
          : null;
    if (!url || !/^https?:\/\//.test(url) || !IMAGE.test(url)) continue;
    if (/dark/i.test(p.name) && out.length > 0) continue;
    out.push({ name: p.name, url });
  }
  return out;
}
