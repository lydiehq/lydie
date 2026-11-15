// TipTap's own extensions, narrowed to the attributes Lydie Markdown can represent. Extra
// attributes would round-trip through the CRDT but be dropped on save, so they are removed here.
import { Code as BaseCode } from "@tiptap/extension-code";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { Image as BaseImage } from "@tiptap/extension-image";
import { Link as BaseLink } from "@tiptap/extension-link";
import { OrderedList as BaseOrderedList } from "@tiptap/extension-list";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { DecorationSet } from "@tiptap/pm/view";
import { createLowlight } from "lowlight";

// `start` only: Markdown has no list-style type.
export const OrderedList = BaseOrderedList.extend({
  addAttributes() {
    return {
      start: {
        default: 1,
        parseHTML: (el) =>
          el.hasAttribute("start") ? parseInt(el.getAttribute("start") ?? "", 10) : 1,
      },
    };
  },
});

// Markdown allows code inside links and emphasis (`[`x`](url)`). TipTap's code mark excludes every
// other mark ("_"), so such a link was dropped when the text reached the editor. Like
// @lydie/markdown's schema, it now excludes only itself.
export const Code = BaseCode.extend({ excludes: "code" });

// No width/height: Markdown images have src, alt and title.
export const Image = BaseImage.extend({
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
    };
  },
});

// href and title only. target/rel/class are rendering options, not document data.
export const Link = BaseLink.extend({
  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML: (el) => el.getAttribute("href"),
      },
      title: {
        default: null,
        parseHTML: (el) => el.getAttribute("title"),
      },
    };
  },
});

// v1 loaded every highlight.js grammar (`all`, ~190 languages); `common` (~37) covers what people
// write in notes at a fraction of the weight. Unknown languages keep their name and stay plain.
// The grammars load in their own chunk, started with this module; code blocks painted before they
// arrive are highlighted again then.
export const lowlight = createLowlight();

let grammarsLoaded = false;
const grammarListeners = new Set<() => void>();
export const grammarsReady: Promise<void> = import("./grammars")
  .then(({ grammars }) => {
    lowlight.register(grammars);
    grammarsLoaded = true;
    for (const listener of [...grammarListeners]) listener();
  })
  .catch(() => {});

// For useSyncExternalStore: the language list changes once, when the grammars load.
export function subscribeGrammars(listener: () => void) {
  grammarListeners.add(listener);
  return () => grammarListeners.delete(listener);
}
export const grammarsVersion = () => grammarsLoaded;

const refreshKey = new PluginKey("lowlightRefresh");

// Whether a transaction can change any code block's highlighting: a step's old or new range
// touches a code block (an edit inside one, one added or removed), or the cursor is in one.
// TipTap's plugin decides this by walking the whole document twice per transaction, which is most
// of its cost while typing in a long document.
function touchesCodeBlock(tr: Transaction, oldState: EditorState, name: string) {
  if (oldState.selection.$head.parent.type.name === name) return true;
  if (tr.selection.$head.parent.type.name === name) return true;
  let found = false;
  tr.steps.forEach((step, i) => {
    if (found) return;
    const before = tr.docs[i]!;
    const after = tr.docs[i + 1] ?? tr.doc;
    step.getMap().forEach((oldStart, oldEnd, newStart, newEnd) => {
      if (found) return;
      const check = (doc: typeof before, from: number, to: number) =>
        doc.nodesBetween(Math.max(0, from), Math.min(doc.content.size, to), (node) => {
          if (node.type.name === name) found = true;
          return !found && !node.isTextblock;
        });
      check(before, oldStart, oldEnd);
      if (!found) check(after, newStart, newEnd);
    });
  });
  return found;
}

export const CodeBlock = CodeBlockLowlight.extend({
  addProseMirrorPlugins() {
    const name = this.name;
    return (this.parent?.() ?? []).map((plugin) => {
      const state = plugin.spec.state;
      // Plugin#key is ProseMirror's internal id: "lowlight$" for TipTap's plugin.
      const id = (plugin as unknown as { key: string }).key;
      if (!id.startsWith("lowlight$") || !state) return plugin;
      // TipTap's lowlight plugin with a cheaper "did code change" test (which also catches edits
      // to a block the cursor is not in, e.g. by a collaborator) and a refresh when the grammars
      // arrive.
      const wrapped: Plugin<DecorationSet> = new Plugin<DecorationSet>({
        key: refreshKey,
        state: {
          init: state.init,
          apply(tr, set, oldState, newState) {
            // init highlights every code block in the document.
            if (tr.getMeta(refreshKey)) return state.init.call(this, {}, newState);
            if (!tr.docChanged) return set;
            if (touchesCodeBlock(tr, oldState, name)) return state.init.call(this, {}, newState);
            return set.map(tr.mapping, tr.doc);
          },
        },
        props: { decorations: (s) => wrapped.getState(s) },
        view(view) {
          if (grammarsLoaded) return {};
          const off = subscribeGrammars(() => {
            if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(refreshKey, true));
          });
          return { destroy: off };
        },
      });
      return wrapped;
    });
  },
}).configure({
  lowlight,
  defaultLanguage: null,
});
