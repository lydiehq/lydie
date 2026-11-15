import { InputRule, mergeAttributes, Node, textblockTypeInputRule } from "@tiptap/core";
import { Plugin, PluginKey, Selection, TextSelection } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";

// LaTeX source is the node's text content (no attributes), so it stays editable like code.
// Without a node view the source is all there is; the React editor's view (`math-view.ts`)
// typesets it with KaTeX and shows the source while the caret is inside (`data-editing`).

const MATH_NODES = new Set(["mathInline", "mathBlock"]);

// The math node the caret is in gets `data-editing`, so a view can swap its typeset form for the
// source. A decoration and not view state: ProseMirror hands it to the view on every change.
function editingDecorations(state: EditorState) {
  const { $head } = state.selection;
  if (!MATH_NODES.has($head.parent.type.name)) return DecorationSet.empty;
  const from = $head.before();
  return DecorationSet.create(state.doc, [
    Decoration.node(from, from + $head.parent.nodeSize, { "data-editing": "" }),
  ]);
}

// A typeset node hides its source, so the browser would skip it when moving the caret: arrows
// that would reach a math node from outside land inside its source instead.
function enterMath(view: EditorView, key: string) {
  const { state } = view;
  const { selection } = state;
  if (!selection.empty || MATH_NODES.has(selection.$head.parent.type.name)) return false;
  const $head = selection.$head;
  const forward = key === "ArrowRight" || key === "ArrowDown";
  const inline = forward ? $head.nodeAfter : $head.nodeBefore;
  if ((key === "ArrowRight" || key === "ArrowLeft") && inline?.type.name === "mathInline") {
    const inside = forward ? $head.pos + 1 : $head.pos - 1;
    view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, inside)));
    return true;
  }
  if ($head.depth === 0) return false;
  const atEdge =
    key === "ArrowRight"
      ? $head.parentOffset === $head.parent.content.size
      : key === "ArrowLeft"
        ? $head.parentOffset === 0
        : view.endOfTextblock(forward ? "down" : "up");
  if (!atEdge) return false;
  const beyond = state.doc.resolve(forward ? $head.after() : $head.before());
  const target = Selection.findFrom(beyond, forward ? 1 : -1, true);
  if (target?.$head.parent.type.name !== "mathBlock") return false;
  view.dispatch(state.tr.setSelection(target));
  return true;
}

const mathEditingKey = new PluginKey<DecorationSet>("mathEditing");

function mathEditing() {
  return new Plugin<DecorationSet>({
    key: mathEditingKey,
    state: {
      init: (_, state) => editingDecorations(state),
      apply: (tr, previous, _, state) =>
        tr.docChanged || tr.selectionSet ? editingDecorations(state) : previous,
    },
    props: {
      decorations: (state) => mathEditingKey.getState(state),
      handleKeyDown(view, event) {
        if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
        if (!event.key.startsWith("Arrow")) return false;
        return enterMath(view, event.key);
      },
    },
  });
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    math: {
      insertMathInline: (latex?: string) => ReturnType;
      setMathBlock: () => ReturnType;
    };
  }
}

export const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  content: "text*",
  marks: "",
  code: true,

  parseHTML() {
    return [{ tag: 'span[data-type="math-inline"]', preserveWhitespace: "full" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-type": "math-inline" }), 0];
  },

  renderText({ node }) {
    return `$${node.textContent}$`;
  },

  addCommands() {
    return {
      insertMathInline:
        (latex = "") =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            content: latex ? [{ type: "text", text: latex }] : [],
          }),
    };
  },

  addInputRules() {
    const type = this.type;
    return [
      // `$x$`: opening `$` followed by a non-space, closing `$` preceded by one (Pandoc's rule,
      // which keeps "$5 and $10" as text).
      new InputRule({
        find: /(?:^|[^$\\])\$([^\s$](?:[^$]*[^\s$])?)\$$/,
        handler: ({ state, range, match }) => {
          const latex = match[1] ?? "";
          // Skip the character the pattern matched before the opening `$`, if any.
          const start = range.from + match[0].length - latex.length - 2;
          state.tr.replaceWith(start, range.to, type.create(null, state.schema.text(latex)));
        },
      }),
    ];
  },
});

export const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="math-block"]', preserveWhitespace: "full" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "math-block" }), 0];
  },

  addCommands() {
    return {
      setMathBlock:
        () =>
        ({ commands }) =>
          commands.setNode(this.name),
    };
  },

  addInputRules() {
    return [textblockTypeInputRule({ find: /^\$\$\s$/, type: this.type })];
  },

  // One plugin for both math nodes; it lives here because MathBlock is always installed.
  addProseMirrorPlugins() {
    return [mathEditing()];
  },
});
