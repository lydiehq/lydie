// Mermaid diagrams, drawn where they are written. A diagram is a code block whose language is
// `mermaid`, in the file and in the document, and stays one: this only draws over it. The block
// is hidden and its diagram shown in its place; "Edit" brings the code back under a live
// preview. A diagram that does not parse shows the parser's message and its code.
import {
  changedRanges,
  changedTextblocks,
  Decoration,
  DecorationSet,
  Extension,
  isDiagramLanguage,
  mountDiagram,
  Plugin,
  PluginKey,
} from "@lydie/plugin-api/editor";
import type { EditorState, ProseMirrorNode, Transaction } from "@lydie/plugin-api/editor";

export type State = {
  // Diagrams whose code is shown, by the position of their block.
  editing: ReadonlySet<number>;
  // The source each of those is drawn from: while its code is typed, the preview is drawn again
  // only once typing pauses (PREVIEW_DELAY), not per key.
  drawn: ReadonlyMap<number, string>;
  decorations: DecorationSet;
};

export const mermaidKey = new PluginKey<State>("mermaid");

export type DiagramBlock = { from: number; to: number; source: string };

// The document's diagrams, wherever they sit (top level, in a list, in a callout).
export function diagramBlocks(doc: ProseMirrorNode): DiagramBlock[] {
  const found: DiagramBlock[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "codeBlock") return !node.isTextblock;
    if (isDiagramLanguage(node.attrs.language)) {
      found.push({ from: pos, to: pos + node.nodeSize, source: node.textContent });
    }
    return false;
  });
  return found;
}

// The diagram's colours are the page's: Pele reads these variables, so light and dark follow
// the theme without drawing again.
const THEME = [
  "--pele-bg: transparent",
  "--pele-fg: var(--color-gray-900)",
  "--pele-muted: var(--color-gray-500)",
  "--pele-line: var(--color-gray-600)",
  "--pele-surface: color-mix(in oklab, var(--color-gray-950) 4%, transparent)",
  "--pele-surface-alt: color-mix(in oklab, var(--color-gray-950) 8%, transparent)",
  "--pele-border: color-mix(in oklab, var(--color-gray-950) 18%, transparent)",
  "--pele-font: inherit",
].join("; ");

const FRAME =
  "group/diagram relative my-3 rounded-xl border border-gray-950/8 font-sans select-none";
const CANVAS = "flex justify-center overflow-x-auto px-4 py-5 [&>svg]:h-auto [&>svg]:max-w-full";
const BUTTON =
  "absolute right-2 bottom-2 rounded-md bg-surface px-2 py-0.5 text-xs text-gray-600 opacity-0 shadow-sm ring-1 ring-gray-950/10 transition-opacity group-hover/diagram:opacity-100 hover:text-gray-900 focus-visible:opacity-100";
const PROBLEM = "px-4 py-3 font-mono text-xs whitespace-pre-wrap text-red-600";
const EMPTY = "px-4 py-5 text-center text-sm text-gray-400";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Heights of the diagrams drawn so far, by source: drawing is asynchronous, and a page opened
// again would otherwise grow under the reader as each diagram lands.
const heights = new Map<string, number>();

function diagramWidget(
  block: DiagramBlock,
  editing: boolean,
  toggle: (show?: boolean) => void,
): HTMLElement {
  const frame = el("div", FRAME);
  frame.contentEditable = "false";
  frame.dataset.diagram = "mermaid";
  frame.setAttribute("style", THEME);
  const button = el("button", BUTTON, editing ? "Done" : "Edit");
  button.type = "button";
  button.setAttribute(
    "aria-label",
    editing ? "Hide the diagram's code" : "Edit the diagram's code",
  );
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => toggle());
  if (block.source.trim() === "") {
    frame.append(el("div", EMPTY, "An empty diagram. Write Mermaid in the code below."), button);
    return frame;
  }
  const canvas = el("div", CANVAS);
  canvas.dataset.diagramCanvas = "";
  frame.append(canvas, button);
  const known = heights.get(block.source);
  if (known) canvas.style.minHeight = `${known}px`;
  void mountDiagram(canvas, block.source).then((outcome) => {
    canvas.style.minHeight = "";
    if (outcome.ok) {
      if (canvas.offsetHeight > 0) heights.set(block.source, canvas.offsetHeight);
      return;
    }
    frame.dataset.diagramError = "";
    canvas.replaceWith(el("div", PROBLEM, outcome.message));
    // What cannot be drawn is shown as it is written, so it can be put right.
    if (!editing) toggle(true);
  });
  return frame;
}

// Cheap and stable: the widget of an unchanged diagram is kept, not drawn again.
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function build(
  doc: ProseMirrorNode,
  editing: ReadonlySet<number>,
  drawn: ReadonlyMap<number, string>,
): DecorationSet {
  const blocks = diagramBlocks(doc);
  if (blocks.length === 0) return DecorationSet.empty;
  const out: Decoration[] = [];
  for (const block of blocks) {
    const shown = editing.has(block.from) || block.source.trim() === "";
    const source = (editing.has(block.from) && drawn.get(block.from)) || block.source;
    const drawing = { ...block, source };
    out.push(
      Decoration.widget(
        block.from,
        (view, getPos) =>
          diagramWidget(drawing, shown, (show) => {
            const at = getPos();
            if (at === undefined) return;
            view.dispatch(view.state.tr.setMeta(mermaidKey, { toggle: at, show }));
          }),
        {
          key: `mermaid:${shown}:${source.length}:${hash(source)}`,
          side: -1,
          ignoreSelection: true,
          stopEvent: () => true,
        },
      ),
    );
    if (!shown) out.push(Decoration.node(block.from, block.to, { class: "hidden" }));
  }
  return DecorationSet.create(doc, out);
}

// How long typing in a diagram's code must pause before its preview is drawn again.
export const PREVIEW_DELAY = 300;

type Meta = { toggle: number; show?: boolean } | { redraw: true };

export function initState(doc: ProseMirrorNode): State {
  return { editing: new Set(), drawn: new Map(), decorations: build(doc, new Set(), new Map()) };
}

const sourceAt = (doc: ProseMirrorNode, pos: number) => doc.nodeAt(pos)?.textContent ?? "";

export function applyState(tr: Transaction, value: State): State {
  const meta = tr.getMeta(mermaidKey) as Meta | undefined;
  if (!tr.docChanged && !meta) return value;
  const editing = new Set([...value.editing].map((pos) => tr.mapping.map(pos, -1)));
  const drawn = new Map(
    [...value.drawn].map(([pos, source]) => [tr.mapping.map(pos, -1), source] as const),
  );
  if (meta && "redraw" in meta) {
    for (const pos of editing) drawn.set(pos, sourceAt(tr.doc, pos));
  } else if (meta) {
    const show = meta.show ?? !editing.has(meta.toggle);
    if (show) {
      editing.add(meta.toggle);
      drawn.set(meta.toggle, sourceAt(tr.doc, meta.toggle));
    } else {
      editing.delete(meta.toggle);
      drawn.delete(meta.toggle);
    }
  } else {
    const mapped = value.decorations.map(tr.mapping, tr.doc);
    // Nothing a diagram is drawn from changed: the drawings stay where they were.
    if (!touchesDiagram(tr, mapped)) return { editing, drawn, decorations: mapped };
  }
  return { editing, drawn, decorations: build(tr.doc, editing, drawn) };
}

// Whether a change touched a diagram: a code block it changed is (now) one, or it came near a
// diagram's drawing (one deleted leaves its widget where it was).
function touchesDiagram(tr: Transaction, mapped: DecorationSet) {
  if (
    changedTextblocks(tr).some(
      ({ node }) => node.type.name === "codeBlock" && isDiagramLanguage(node.attrs.language),
    )
  ) {
    return true;
  }
  if (mapped === DecorationSet.empty) return false;
  return changedRanges(tr).some(([from, to]) => mapped.find(from - 1, to + 1).length > 0);
}

export const Mermaid = Extension.create({
  name: "mermaid",
  addProseMirrorPlugins() {
    return [
      new Plugin<State>({
        key: mermaidKey,
        state: {
          init: (_config, state: EditorState) => initState(state.doc),
          apply: (tr: Transaction, value: State): State => applyState(tr, value),
        },
        props: {
          decorations: (state) => mermaidKey.getState(state)?.decorations ?? DecorationSet.empty,
        },
        view() {
          let timer: ReturnType<typeof setTimeout> | undefined;
          return {
            update(view, prevState) {
              const value = mermaidKey.getState(view.state);
              if (!value || value.editing.size === 0 || view.state.doc === prevState.doc) return;
              const behind = [...value.editing].some(
                (pos) => value.drawn.get(pos) !== sourceAt(view.state.doc, pos),
              );
              clearTimeout(timer);
              if (!behind) return;
              timer = setTimeout(() => {
                if (!view.isDestroyed)
                  view.dispatch(view.state.tr.setMeta(mermaidKey, { redraw: true }));
              }, PREVIEW_DELAY);
            },
            destroy: () => clearTimeout(timer),
          };
        },
      }),
    ];
  },
});
