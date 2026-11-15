// What a document's hover card says about it: the opening lines as a few styled lines (not a
// full render: a card this small reads better as text), its length, and when it was edited.
import type { JSONContent } from "@lydie/editor";

export type Span = {
  text: string;
  bold?: true;
  italic?: true;
  strike?: true;
  code?: true;
  link?: true;
};

export type ExcerptLine =
  | { kind: "heading" | "text" | "quote" | "code"; spans: Span[] }
  | { kind: "bullet"; spans: Span[]; depth: number; marker: string }
  | { kind: "task"; spans: Span[]; depth: number; checked: boolean };

export type Summary = { lines: ExcerptLine[]; truncated: boolean; words: number };

const MAX_LINES = 6;
const MAX_CHARS = 280;

function spansOf(nodes: readonly JSONContent[] | undefined): Span[] {
  const out: Span[] = [];
  for (const node of nodes ?? []) {
    if (node.type === "text") {
      const span: Span = { text: node.text ?? "" };
      for (const mark of node.marks ?? []) {
        if (mark.type === "bold") span.bold = true;
        else if (mark.type === "italic") span.italic = true;
        else if (mark.type === "strike") span.strike = true;
        else if (mark.type === "code") span.code = true;
        else if (mark.type === "link") span.link = true;
      }
      out.push(span);
    } else if (node.type === "wikiLink") {
      const attrs = node.attrs as {
        target?: string;
        heading?: string | null;
        alias?: string | null;
      };
      const text = attrs.alias ?? [attrs.target, attrs.heading].filter(Boolean).join(" › ");
      out.push({ text, link: true });
    } else if (node.type === "hardBreak") {
      out.push({ text: " " });
    } else if (node.type === "rawInline") {
      // `[ ] ` before a list item's text is a task written loosely; it is not content.
      const source = String(node.attrs?.source ?? "");
      if (!/^\[[ xX]\]\s*$/.test(source)) out.push({ text: source });
    } else {
      out.push(...spansOf(node.content));
    }
  }
  return out;
}

// Spans trimmed to `max` characters in all, with an ellipsis where text was cut.
function clip(spans: Span[], max: number): Span[] {
  const out: Span[] = [];
  let left = max;
  for (const span of spans) {
    if (left <= 0) break;
    const text = span.text.length > left ? `${span.text.slice(0, left).trimEnd()}…` : span.text;
    out.push({ ...span, text });
    left -= span.text.length;
  }
  return out;
}

const textOf = (spans: readonly Span[]) => spans.map((s) => s.text).join("");

export function countWords(node: JSONContent): number {
  if (node.type === "text") return (node.text ?? "").split(/\s+/).filter(Boolean).length;
  if (node.type === "wikiLink") return 1;
  return (node.content ?? []).reduce((n, child) => n + countWords(child), 0);
}

export function summarizeDoc(doc: JSONContent, title: string): Summary {
  const lines: ExcerptLine[] = [];
  let truncated = false;
  const push = (line: ExcerptLine) => {
    if (textOf(line.spans).trim() === "") return;
    if (lines.length === MAX_LINES) {
      truncated = true;
      return;
    }
    lines.push({ ...line, spans: clip(line.spans, MAX_CHARS) } as ExcerptLine);
  };
  const firstParagraph = (item: JSONContent) => item.content?.find((c) => c.type === "paragraph");

  const walk = (nodes: readonly JSONContent[] | undefined, depth: number, quote: boolean) => {
    for (const node of nodes ?? []) {
      if (lines.length === MAX_LINES) {
        truncated = true;
        return;
      }
      switch (node.type) {
        case "heading":
          push({ kind: "heading", spans: spansOf(node.content) });
          break;
        case "paragraph":
          push({ kind: quote ? "quote" : "text", spans: spansOf(node.content) });
          break;
        case "blockquote":
        case "callout":
          walk(node.content, depth, true);
          break;
        case "columnList":
        case "column":
          walk(node.content, depth, quote);
          break;
        case "codeBlock":
        case "mathBlock":
          push({ kind: "code", spans: [{ text: textOf(spansOf(node.content)).split("\n")[0]! }] });
          break;
        case "bulletList":
        case "orderedList":
        case "taskList": {
          const start = Number(node.attrs?.start ?? 1);
          (node.content ?? []).forEach((item, i) => {
            const spans = spansOf(firstParagraph(item)?.content);
            const loose = item.content?.[0]?.content?.[0];
            const looseTask =
              loose?.type === "rawInline"
                ? /^\[([ xX])\]/.exec(String(loose.attrs?.source ?? ""))
                : null;
            if (item.type === "taskItem" || looseTask) {
              const checked =
                item.type === "taskItem" ? Boolean(item.attrs?.checked) : looseTask?.[1] !== " ";
              push({ kind: "task", spans, depth, checked });
            } else {
              const marker = node.type === "orderedList" ? `${start + i}.` : "•";
              push({ kind: "bullet", spans, depth, marker });
            }
            walk(
              item.content?.filter((c) => c !== firstParagraph(item)),
              depth + 1,
              quote,
            );
          });
          break;
        }
        default:
          // Tables, images, embeds and rules are left out of a text excerpt.
          break;
      }
    }
  };

  const blocks = doc.content ?? [];
  // A first heading that repeats the title says nothing new.
  const [first, ...rest] = blocks;
  const repeatsTitle =
    first?.type === "heading" &&
    textOf(spansOf(first.content)).trim().toLowerCase() === title.trim().toLowerCase();
  walk(repeatsTitle ? rest : blocks, 0, false);
  return { lines, truncated, words: countWords(doc) };
}

export function editedAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (!Number.isFinite(seconds)) return "";
  if (abs < 45) return "Edited just now";
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["minute", 60],
    ["hour", 3600],
    ["day", 86400],
    ["week", 604800],
    ["month", 2629800],
    ["year", 31557600],
  ];
  let unit = units[0]!;
  for (const candidate of units) if (abs >= candidate[1]) unit = candidate;
  return `Edited ${rtf.format(Math.round(seconds / unit[1]), unit[0])}`;
}

export function wordsLabel(words: number): string {
  if (words === 0) return "";
  const n =
    words < 1000
      ? words.toLocaleString()
      : new Intl.NumberFormat(undefined, { notation: "compact" }).format(words);
  return `${n} ${words === 1 ? "word" : "words"}`;
}
