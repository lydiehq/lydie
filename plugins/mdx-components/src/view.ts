// MDX components, shown as what they are (experimental). The document is not touched: a component
// tag stays a raw block and a module line stays a paragraph, exactly as the file has them. This
// only draws over them: a tag pair becomes a titled frame around its blocks, a self-closing tag
// a card (with the picture it points at), and the file's import/export lines fold into one chip.
// Every one of them can be flipped back to its source, where it is edited as before.
import {
  changedRanges,
  Decoration,
  DecorationSet,
  Extension,
  Plugin,
  PluginKey,
} from "@lydie/plugin-api/editor";
import type { EditorState, ProseMirrorNode, Transaction } from "@lydie/plugin-api/editor";

import { constants, images, prop, readableName, regions, toneOf } from "./parse.ts";
import type { Block, Region, Tag, Tone } from "./parse.ts";

type State = {
  // Regions shown as source, by the position of their first block.
  source: ReadonlySet<number>;
  decorations: DecorationSet;
};

const key = new PluginKey<State>("mdx-components");

const TONES: Record<Tone, { header: string; icon: string; rail: string }> = {
  info: {
    header: "bg-blue-500/8",
    icon: "text-blue-600",
    rail: "before:bg-blue-400/70",
  },
  warning: {
    header: "bg-amber-500/10",
    icon: "text-amber-600",
    rail: "before:bg-amber-400/80",
  },
  danger: {
    header: "bg-red-500/8",
    icon: "text-red-600",
    rail: "before:bg-red-400/70",
  },
  success: {
    header: "bg-green-500/8",
    icon: "text-green-600",
    rail: "before:bg-green-400/70",
  },
  neutral: {
    header: "bg-gray-950/4",
    icon: "text-gray-500",
    rail: "before:bg-gray-950/15",
  },
};

const RAIL =
  "relative ml-5 before:absolute before:-top-2 before:-bottom-2 before:-left-4 before:w-[3px] before:rounded-full before:content-['']";
const PILL = "rounded bg-gray-950/5 px-1.5 py-0.5 font-mono text-[11px] leading-4 text-gray-600";
const TOGGLE =
  "rounded-md px-1.5 py-0.5 font-mono text-[11px] leading-4 text-gray-500 hover:bg-gray-950/5 hover:text-gray-900";
const SOURCE = "font-mono text-xs text-gray-500";

const ICONS: Record<Tone, string> = {
  info: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z",
  warning: "M12 3 1.5 21h21L12 3Zm1 14h-2v-2h2v2Zm0-4h-2V9h2v4Z",
  danger: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v6Z",
  success:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.2 14.2-4-4 1.4-1.4 2.6 2.6 5.6-5.6 1.4 1.4-7 7Z",
  neutral: "M4 5h7v6H4V5Zm9 0h7v6h-7V5ZM4 13h7v6H4v-6Zm9 0h7v6h-7v-6Z",
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(tone: Tone): HTMLElement {
  const wrap = el("span", `inline-flex size-4 shrink-0 ${TONES[tone].icon}`);
  wrap.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="${ICONS[tone]}"/></svg>`;
  return wrap;
}

// The props a card does not already show as its title or picture.
function pills(tag: Tag, skip: readonly string[]): HTMLElement[] {
  return tag.props
    .filter((p) => !skip.includes(p.name))
    .slice(0, 6)
    .map((p) => {
      const value =
        p.value === null ? "" : p.value.length > 28 ? `${p.value.slice(0, 27)}…` : p.value;
      return el("span", PILL, p.kind === "flag" ? p.name : `${p.name}=${value}`);
    });
}

type Dispatch = (id: number) => void;

function toggle(id: number, shown: boolean, dispatch: Dispatch): HTMLElement {
  const button = el("button", TOGGLE, shown ? "Hide source" : "</>");
  button.type = "button";
  button.title = shown ? "Show it as a component" : "Show its Markdown source";
  button.setAttribute("aria-label", button.title);
  // The editor keeps its selection: the click is ours.
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => dispatch(id));
  return button;
}

function containerHeader(
  region: Extract<Region, { kind: "container" }>,
  shown: boolean,
  dispatch: Dispatch,
) {
  const tone = toneOf(region.tag);
  const title = prop(region.tag, "title", "label", "heading", "name");
  const header = el(
    "div",
    `mt-4 mb-2 flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 font-sans select-none ${TONES[tone].header}`,
  );
  header.contentEditable = "false";
  header.dataset.mdx = "container";
  header.dataset.component = region.tag.name;
  header.append(
    icon(tone),
    el(
      "span",
      "truncate text-sm font-medium text-gray-900",
      title ?? readableName(region.tag.name),
    ),
  );
  if (title)
    header.append(el("span", "shrink-0 text-xs text-gray-500", readableName(region.tag.name)));
  header.append(
    ...pills(region.tag, ["title", "label", "heading", "name", "icon"]),
    el("span", "grow"),
    toggle(region.open.from, shown, dispatch),
  );
  return header;
}

function leafCard(
  region: Extract<Region, { kind: "leaf" }>,
  known: ReadonlyMap<string, string>,
  shown: boolean,
  dispatch: Dispatch,
) {
  const pictures = images(region.tag, known);
  const card = el(
    "div",
    "my-3 overflow-hidden rounded-xl border border-gray-950/10 bg-gray-950/[0.02] font-sans select-none",
  );
  card.contentEditable = "false";
  card.dataset.mdx = "leaf";
  card.dataset.component = region.tag.name;
  const caption = prop(region.tag, "alt", "title", "caption", "label");
  for (const picture of pictures.slice(0, 1)) {
    const img = el("img", "block max-h-96 w-full bg-gray-950/5 object-contain");
    img.src = picture.url;
    img.alt = caption ?? "";
    img.loading = "lazy";
    card.append(img);
  }
  const bar = el("div", "flex min-w-0 items-center gap-2 px-3 py-2");
  bar.append(
    icon("neutral"),
    el("span", "shrink-0 text-sm font-medium text-gray-900", readableName(region.tag.name)),
  );
  if (caption) bar.append(el("span", "truncate text-xs text-gray-500", caption));
  const used = new Set(["alt", "title", "caption", "label", ...tagImageProps(region.tag, known)]);
  bar.append(
    ...pills(region.tag, [...used]),
    el("span", "grow"),
    toggle(region.block.from, shown, dispatch),
  );
  card.append(bar);
  return card;
}

// Props that are pictures (both variants), so they do not also show as text.
function tagImageProps(tag: Tag, known: ReadonlyMap<string, string>): string[] {
  return tag.props
    .filter((p) => {
      const url =
        p.kind === "string" ? p.value : p.kind === "expression" ? known.get(p.value ?? "") : null;
      return typeof url === "string" && /^https?:\/\//.test(url);
    })
    .map((p) => p.name);
}

function esmChip(region: Extract<Region, { kind: "esm" }>, shown: boolean, dispatch: Dispatch) {
  const chip = el(
    "div",
    "my-1 flex items-center gap-2 font-sans text-xs text-gray-500 select-none",
  );
  chip.contentEditable = "false";
  chip.dataset.mdx = "esm";
  const parts = [
    region.imports ? `${region.imports} import${region.imports === 1 ? "" : "s"}` : null,
    region.exports ? `${region.exports} export${region.exports === 1 ? "" : "s"}` : null,
  ].filter((p) => p !== null);
  chip.append(
    el("span", PILL, "MDX"),
    el("span", "", parts.join(" · ")),
    toggle(region.blocks[0]!.from, shown, dispatch),
  );
  return chip;
}

// A block's text as the file has it: a raw block's source, and for a paragraph its text with
// the inline source it holds (a tag over several lines is one inline raw node in a paragraph).
export function sourceOf(node: ProseMirrorNode): string {
  if (node.type.name === "rawBlock") return String(node.attrs.source ?? "");
  let text = "";
  node.forEach((child) => {
    if (child.isText) text += child.text ?? "";
    else if (child.type.name === "rawInline") text += String(child.attrs.source ?? "");
    else if (child.type.name === "hardBreak") text += "\n";
    else text += child.textContent;
  });
  return text;
}

function blocksOf(doc: ProseMirrorNode): Block[] {
  const blocks: Block[] = [];
  doc.forEach((node, offset) => {
    blocks.push({
      type: node.type.name,
      text: sourceOf(node),
      from: offset,
      to: offset + node.nodeSize,
    });
  });
  return blocks;
}

const MDX_START = /^\s*(import\s|export\s|<[A-Z])/;
// "import " is the longest start MDX_START looks at.
const MDX_START_LENGTH = 7;

// Whether a block could be part of MDX: a raw block, or a paragraph (regions read no other
// blocks) whose source starts as a module line or a component tag does. Reads only the start of
// the block, not its whole text.
export function startsLikeMdx(node: ProseMirrorNode): boolean {
  if (node.type.name === "rawBlock") return true;
  if (node.type.name !== "paragraph") return false;
  let start = "";
  for (let i = 0; i < node.childCount && start.trimStart().length < MDX_START_LENGTH; i++) {
    const child = node.child(i);
    if (child.isText) start += child.text ?? "";
    else if (child.type.name === "rawInline") start += String(child.attrs.source ?? "");
    else if (child.type.name === "hardBreak") start += "\n";
    else start += child.textContent;
  }
  return MDX_START.test(start);
}

// Whether a change may have added MDX to a document that had none: one of the top-level blocks it
// touched (only those are read) now starts like it.
function addsMdx(tr: Transaction): boolean {
  const doc = tr.doc;
  const size = doc.content.size;
  let found = false;
  for (const [from, to] of changedRanges(tr)) {
    doc.nodesBetween(Math.max(0, from - 1), Math.min(size, to + 1), (node) => {
      if (!found && startsLikeMdx(node)) found = true;
      return false;
    });
    if (found) return true;
  }
  return false;
}

function build(doc: ProseMirrorNode, source: ReadonlySet<number>): DecorationSet {
  // Cheap way out for documents with no MDX in them, which is nearly all of them.
  let any = false;
  doc.forEach((node) => {
    any ||= startsLikeMdx(node);
  });
  if (!any) return DecorationSet.empty;
  const blocks = blocksOf(doc);
  const found = regions(blocks);
  const known = constants(
    found.flatMap((r) => (r.kind === "esm" ? r.blocks.map((b) => b.text) : [])).join("\n"),
  );
  const out: Decoration[] = [];
  const hide = (block: Block) =>
    out.push(Decoration.node(block.from, block.to, { class: "hidden" }));
  const widget = (at: number, id: string, make: (dispatch: Dispatch) => HTMLElement) =>
    out.push(
      Decoration.widget(
        at,
        (view) => make((region) => view.dispatch(view.state.tr.setMeta(key, { toggle: region }))),
        { key: id, side: -1, ignoreSelection: true, stopEvent: () => true },
      ),
    );
  for (const region of found) {
    if (region.kind === "esm") {
      const id = region.blocks[0]!.from;
      const shown = source.has(id);
      widget(id, `esm:${id}:${shown}:${region.imports}:${region.exports}`, (d) =>
        esmChip(region, shown, d),
      );
      for (const block of region.blocks) {
        if (shown) out.push(Decoration.node(block.from, block.to, { class: SOURCE }));
        else hide(block);
      }
    } else if (region.kind === "container") {
      const id = region.open.from;
      const shown = source.has(id);
      widget(id, `open:${id}:${shown}:${region.open.text}`, (d) =>
        containerHeader(region, shown, d),
      );
      if (!shown) {
        hide(region.open);
        hide(region.close);
      }
      const rail = `${RAIL} ${TONES[toneOf(region.tag)].rail}`;
      for (const block of region.inner)
        out.push(Decoration.node(block.from, block.to, { class: rail }));
    } else {
      const id = region.block.from;
      const shown = source.has(id);
      widget(id, `leaf:${id}:${shown}:${region.block.text}`, (d) =>
        leafCard(region, known, shown, d),
      );
      if (!shown) hide(region.block);
    }
  }
  return DecorationSet.create(doc, out);
}

export const MdxComponents = Extension.create({
  name: "mdxComponents",
  addProseMirrorPlugins() {
    return [
      new Plugin<State>({
        key,
        state: {
          init: (_config, state: EditorState) => ({
            source: new Set<number>(),
            decorations: build(state.doc, new Set()),
          }),
          apply(tr: Transaction, value: State): State {
            const meta = tr.getMeta(key) as { toggle: number } | undefined;
            if (!tr.docChanged && !meta) return value;
            // What is shown as source stays so while the text around it changes.
            const source = new Set([...value.source].map((pos) => tr.mapping.map(pos, -1)));
            if (meta) {
              if (source.has(meta.toggle)) source.delete(meta.toggle);
              else source.add(meta.toggle);
            } else if (value.decorations === DecorationSet.empty && !addsMdx(tr)) {
              return { source, decorations: DecorationSet.empty };
            }
            return { source, decorations: build(tr.doc, source) };
          },
        },
        props: {
          decorations: (state) => key.getState(state)?.decorations ?? DecorationSet.empty,
        },
      }),
    ];
  },
});
