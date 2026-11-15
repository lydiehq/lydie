// Edits the popover makes to the document. Each is one editor transaction, so Mod+Z undoes it.
import type { Editor } from "@lydie/plugin-api/editor";

import type { LinkHit } from "./extension.ts";
import {
  defaultLabel,
  formatWikiLink,
  formatWikiTarget,
  hrefToTarget,
  isExternalHref,
  looksLikeUrl,
  normalizeUrl,
  parseWikiTarget,
  targetToHref,
} from "./targets.ts";
import type { WikiTarget } from "./targets.ts";

// The hit, re-read from the current document (it may have moved since the popover opened).
export function currentHit(editor: Editor, hit: LinkHit): LinkHit | null {
  const doc = editor.state.doc;
  if (hit.kind === "wiki") {
    const node = hit.pos <= doc.content.size ? doc.nodeAt(hit.pos) : null;
    return node?.type.name === "wikiLink" ? { ...hit, attrs: node.attrs as WikiTarget } : null;
  }
  if (hit.to > doc.content.size) return null;
  const has = doc.rangeHasMark(hit.from, hit.to, editor.schema.marks.link!);
  return has ? { ...hit, text: doc.textBetween(hit.from, hit.to) } : null;
}

export function rangeOf(hit: LinkHit) {
  return hit.kind === "wiki" ? { from: hit.pos, to: hit.pos + 1 } : { from: hit.from, to: hit.to };
}

export function labelOf(hit: LinkHit): string {
  return hit.kind === "wiki" ? (hit.attrs.alias ?? defaultLabel(hit.attrs)) : hit.text;
}

// What the link points at, as typed in the target field.
export function targetTextOf(hit: LinkHit): string {
  if (hit.kind === "wiki") return formatWikiTarget(hit.attrs);
  return isExternalHref(hit.href) ? hit.href : formatWikiTarget(hrefToTarget(hit.href));
}

// Markdown for "Copy link".
export function copyTextOf(hit: LinkHit): string {
  if (hit.kind === "wiki") return formatWikiLink(hit.attrs);
  return isExternalHref(hit.href) ? hit.href : `[${hit.text}](${hit.href})`;
}

export function unlink(editor: Editor, hit: LinkHit) {
  const live = currentHit(editor, hit);
  if (!live) return;
  if (live.kind === "wiki") {
    editor
      .chain()
      .focus()
      .insertContentAt(rangeOf(live), { type: "text", text: labelOf(live) })
      .run();
  } else {
    editor.chain().focus().setTextSelection(rangeOf(live)).unsetLink().run();
  }
}

// Wiki link ⇄ Markdown link, keeping the label and the target.
export function convert(editor: Editor, hit: LinkHit) {
  const live = currentHit(editor, hit);
  if (!live) return;
  if (live.kind === "wiki") {
    const label = labelOf(live);
    editor
      .chain()
      .focus()
      .insertContentAt(rangeOf(live), {
        type: "text",
        text: label,
        marks: [{ type: "link", attrs: { href: targetToHref(live.attrs) } }],
      })
      .run();
    return;
  }
  if (isExternalHref(live.href)) return;
  const target = hrefToTarget(live.href);
  const alias = live.text && live.text !== defaultLabel(target) ? live.text : null;
  editor
    .chain()
    .focus()
    .insertContentAt(rangeOf(live), { type: "wikiLink", attrs: { ...target, alias } })
    .run();
}

export function canConvert(hit: LinkHit): boolean {
  return hit.kind === "wiki" || !isExternalHref(hit.href);
}

// Writes the edited (or new) link over `from..to`. A URL target makes a Markdown link; anything
// else keeps the link's syntax; new links use `format` (a folder's link format; default wiki).
export function applyLink(
  editor: Editor,
  edit: { hit: LinkHit | null; from: number; to: number },
  value: { text: string; target: string },
  format: "wiki" | "markdown" = "wiki",
) {
  const live = edit.hit ? currentHit(editor, edit.hit) : null;
  const range = live ? rangeOf(live) : { from: edit.from, to: edit.to };
  const targetText = value.target.trim();
  if (!targetText) return;
  if (looksLikeUrl(targetText) && !targetText.includes("[[")) {
    const href = normalizeUrl(targetText);
    const text = value.text.trim() || targetText;
    editor
      .chain()
      .focus()
      .insertContentAt(range, { type: "text", text, marks: [{ type: "link", attrs: { href } }] })
      .run();
    return;
  }
  const target = parseWikiTarget(targetText.replace(/^\[\[|\]\]$/g, ""));
  const label = value.text.trim();
  if (live?.kind === "href" || (!live && format === "markdown")) {
    editor
      .chain()
      .focus()
      .insertContentAt(range, {
        type: "text",
        text: label || defaultLabel(target),
        marks: [{ type: "link", attrs: { href: targetToHref(target) } }],
      })
      .run();
    return;
  }
  const alias = label && label !== defaultLabel(target) ? label : (target.alias ?? null);
  editor
    .chain()
    .focus()
    .insertContentAt(range, { type: "wikiLink", attrs: { ...target, alias } })
    .run();
}
