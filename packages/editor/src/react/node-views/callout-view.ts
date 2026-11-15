import type { NodeViewRenderer } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { calloutLabel } from "../../extensions/callout";
import type { CalloutAttrs } from "../../extensions/callout";

// MingCute "information" and "right" glyphs (Apache-2.0, as in @lydie/ui's icons), inlined so the
// editor needs no icon package.
const LINE: Record<string, string> = {
  fill: "none",
  stroke: "currentColor",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "stroke-width": "2",
};
const INFO_PATH: Record<string, string> = {
  ...LINE,
  d: "M12 8h.002M11 11h1v6h.5m8.5-5a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
};
const CHEVRON_PATH: Record<string, string> = { ...LINE, d: "M9.343 6.343 15 12l-5.657 5.657" };

const SVG = "http://www.w3.org/2000/svg";
function icon(path: Record<string, string>, className: string) {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", className);
  const p = document.createElementNS(SVG, "path");
  for (const [name, value] of Object.entries(path)) p.setAttribute(name, value);
  svg.append(p);
  return svg;
}

// A callout: a title row (icon, editable title, fold toggle) over the editable content. A plain
// ProseMirror node view, not a React one: TipTap's React node views move their content element in a
// ref callback that reads the DOM selection, which forces a layout per block on open.
export const calloutView: NodeViewRenderer = ({ editor, node: initial, getPos }) => {
  let node = initial;
  const dom = document.createElement("div");
  dom.dataset.type = "callout";
  const header = document.createElement("div");
  header.dataset.calloutTitle = "";
  header.contentEditable = "false";
  const title = document.createElement("input");
  title.setAttribute("aria-label", "Callout title");
  title.className = "min-w-0 flex-1 bg-transparent outline-none placeholder:text-current";
  const fold = document.createElement("button");
  fold.type = "button";
  fold.className = "rounded p-0.5 text-gray-500 hover:bg-gray-950/5";
  const chevron = icon(CHEVRON_PATH, "size-3.5 transition-transform");
  fold.append(chevron);
  const content = document.createElement("div");
  content.dataset.calloutContent = "";
  header.append(icon(INFO_PATH, "size-4 shrink-0"), title, fold);
  dom.append(header, content);

  const setAttrs = (patch: Partial<CalloutAttrs>) => {
    const pos = getPos();
    if (typeof pos !== "number") return;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch }),
    );
  };
  title.addEventListener("input", () => setAttrs({ title: title.value || null }));
  fold.addEventListener("click", () =>
    setAttrs({ fold: (node.attrs as CalloutAttrs).fold === "closed" ? "open" : "closed" }),
  );

  const render = (next: ProseMirrorNode) => {
    const attrs = next.attrs as CalloutAttrs;
    const folded = attrs.fold === "closed";
    dom.dataset.kind = attrs.kind;
    dom.dataset.folded = String(folded);
    title.placeholder = calloutLabel({ kind: attrs.kind, title: null });
    title.readOnly = !editor.isEditable;
    // Typing in the field already shows the new value; do not move its caret.
    if (title.value !== (attrs.title ?? "")) title.value = attrs.title ?? "";
    fold.hidden = !attrs.fold;
    fold.setAttribute("aria-label", folded ? "Expand callout" : "Collapse callout");
    fold.setAttribute("aria-expanded", String(!folded));
    chevron.classList.toggle("rotate-90", !folded);
  };
  render(node);

  return {
    dom,
    contentDOM: content,
    update(next) {
      if (next.type !== node.type) return false;
      node = next;
      render(next);
      return true;
    },
    // The title row is ours: ProseMirror leaves its events and mutations alone.
    stopEvent: (event) => header.contains(event.target as Node),
    ignoreMutation: (mutation) =>
      mutation.type !== "selection" && !content.contains(mutation.target),
  };
};
