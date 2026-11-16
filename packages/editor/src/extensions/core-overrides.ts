// TipTap's own extensions, narrowed to the attributes Lydie Markdown can represent. Extra
// attributes would round-trip through the CRDT but be dropped on save, so they are removed here.
import { Code as BaseCode } from "@tiptap/extension-code";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { Image as BaseImage } from "@tiptap/extension-image";
import { Link as BaseLink } from "@tiptap/extension-link";
import { OrderedList as BaseOrderedList } from "@tiptap/extension-list";

import { codeHighlightKey, codeHighlightPlugin, lowlight } from "./code-highlight";

const codeHighlightId = (codeHighlightKey as unknown as { key: string }).key;

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

// TipTap's lowlight plugin is replaced by ours (code-highlight.ts), which highlights only the code
// blocks a transaction touches. An extension made from this one (configure, a node view) runs this
// again over this one's result, so ours is replaced too rather than added twice.
export const CodeBlock = CodeBlockLowlight.extend({
  addProseMirrorPlugins() {
    // Plugin#key is ProseMirror's internal id: "lowlight$" for TipTap's plugin.
    const plugins = (this.parent?.() ?? []).filter((plugin) => {
      const id = (plugin as unknown as { key: string }).key;
      return !id.startsWith("lowlight$") && id !== codeHighlightId;
    });
    return [...plugins, codeHighlightPlugin(this.name)];
  },
}).configure({
  lowlight,
  defaultLanguage: null,
});
