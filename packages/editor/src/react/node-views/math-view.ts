import type { NodeViewRenderer } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

type Katex = typeof import("./katex").default;

let katex: Katex | null = null;
let katexLoading: Promise<Katex> | null = null;

// KaTeX is large: fetched the first time a document shows math, then shared by every view.
export function loadKatex(): Promise<Katex> {
  katexLoading ??= import("./katex").then((m) => (katex = m.default));
  return katexLoading;
}

// Math as KaTeX typesets it, with the LaTeX source (the node's content) hidden until the caret
// goes in: the math plugin marks that node `data-editing` and the stylesheet swaps the two. A
// block keeps its typeset form under the source while editing, as a live preview. A plain
// ProseMirror node view, like the callout's, so opening a document forces no layout per node.
function mathView(display: boolean): NodeViewRenderer {
  return ({ editor, node: initial, getPos }) => {
    let node = initial;
    let rendered: string | null = null;
    let destroyed = false;
    const tag = display ? "div" : "span";
    const dom = document.createElement(tag);
    dom.dataset.type = display ? "math-block" : "math-inline";
    dom.dataset.mathView = "";
    const source = document.createElement(tag);
    source.dataset.mathSource = "";
    // Typed wide: a div-or-span union loses the event map, so listeners would get a bare Event.
    const preview: HTMLElement = document.createElement(tag);
    preview.dataset.mathPreview = "";
    preview.contentEditable = "false";
    dom.append(source, preview);

    const render = () => {
      const latex = node.textContent;
      if (latex === rendered) return;
      preview.toggleAttribute("data-empty", !latex.trim());
      if (!latex.trim()) {
        preview.textContent = "Empty equation";
        rendered = latex;
        return;
      }
      if (!katex) {
        // The source stands in until KaTeX arrives; `rendered` stays unset so it renders then.
        preview.textContent = latex;
        void loadKatex().then(() => {
          if (!destroyed) render();
        });
        return;
      }
      try {
        // renderToString escapes the source, and `trust` is off, so \href and friends stay text.
        preview.innerHTML = katex.renderToString(latex, {
          displayMode: display,
          throwOnError: false,
          errorColor: "var(--color-red-600)",
        });
      } catch {
        // throwOnError covers bad LaTeX; anything else KaTeX throws leaves the source showing.
        preview.textContent = latex;
      }
      rendered = latex;
    };
    render();

    // A click on the typeset form edits the source, with the caret at its end.
    preview.addEventListener("mousedown", (event) => {
      if (!editor.isEditable || event.button !== 0) return;
      const pos = getPos();
      if (typeof pos !== "number") return;
      event.preventDefault();
      const { state } = editor.view;
      const end = pos + node.nodeSize - 1;
      editor.view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, end)));
      editor.view.focus();
    });

    return {
      dom,
      contentDOM: source,
      update(next) {
        if (next.type !== node.type) return false;
        node = next;
        render();
        return true;
      },
      destroy() {
        destroyed = true;
      },
      stopEvent: (event) => preview.contains(event.target as Node),
      ignoreMutation: (mutation) =>
        mutation.type !== "selection" && preview.contains(mutation.target),
    };
  };
}

export const mathBlockView = mathView(true);
export const mathInlineView = mathView(false);
