// Mermaid diagrams, drawn where they are written. A diagram is a code block whose language is
// `mermaid`, in the file and in the document, and stays one: this only draws over it. The block
// is hidden and its diagram shown in its place; "Edit" brings the code back under a live
// preview. A diagram that does not parse shows the parser's message and its code.
import {
  Decoration,
  DecorationSet,
  Extension,
  isDiagramLanguage,
  mountDiagram,
  Plugin,
  PluginKey,
} from "@lydie/plugin-api/editor";
import type { EditorState, ProseMirrorNode, Transaction } from "@lydie/plugin-api/editor";

type State = {
  // Diagrams whose code is shown, by the position of their block.
  editing: ReadonlySet<number>;
  decorations: DecorationSet;
};

const key = new PluginKey<State>("mermaid");

export type DiagramBlock = { from: number; to: number; source: string };

// The document's diagrams, wherever they sit (top level, in a list, in a callout).
export function diagramBlocks(doc: ProseMirrorNode): DiagramBlock[] {
  const found: DiagramBlock[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "codeBlock") return true;
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

function build(doc: ProseMirrorNode, editing: ReadonlySet<number>): DecorationSet {
  const blocks = diagramBlocks(doc);
  if (blocks.length === 0) return DecorationSet.empty;
  const out: Decoration[] = [];
  for (const block of blocks) {
    const shown = editing.has(block.from) || block.source.trim() === "";
    out.push(
      Decoration.widget(
        block.from,
        (view, getPos) =>
          diagramWidget(block, shown, (show) => {
            const at = getPos();
            if (at === undefined) return;
            view.dispatch(view.state.tr.setMeta(key, { toggle: at, show }));
          }),
        {
          key: `mermaid:${shown}:${block.source.length}:${hash(block.source)}`,
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

export const Mermaid = Extension.create({
  name: "mermaid",
  addProseMirrorPlugins() {
    return [
      new Plugin<State>({
        key,
        state: {
          init: (_config, state: EditorState) => ({
            editing: new Set<number>(),
            decorations: build(state.doc, new Set()),
          }),
          apply(tr: Transaction, value: State): State {
            const meta = tr.getMeta(key) as { toggle: number; show?: boolean } | undefined;
            if (!tr.docChanged && !meta) return value;
            const editing = new Set([...value.editing].map((pos) => tr.mapping.map(pos, -1)));
            if (meta) {
              const show = meta.show ?? !editing.has(meta.toggle);
              if (show) editing.add(meta.toggle);
              else editing.delete(meta.toggle);
            }
            return { editing, decorations: build(tr.doc, editing) };
          },
        },
        props: {
          decorations: (state) => key.getState(state)?.decorations ?? DecorationSet.empty,
        },
      }),
    ];
  },
});
