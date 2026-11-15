import { mergeAttributes, Node } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

import { inlineAtomInputRule } from "./input-rules";

// `[[target#heading|alias]]` or `[[target#^blockId|alias]]`. An empty target links inside the
// current document (`[[#heading]]`).
export type WikiLinkAttrs = {
  target: string;
  heading: string | null;
  blockId: string | null;
  alias: string | null;
};

export type WikiLinkOptions = {
  // Called on Mod-click, or on any click when the editor is read-only.
  onOpen: ((attrs: WikiLinkAttrs) => void) | null;
  // Optional lookup so links to missing documents can be shown as unresolved.
  isResolved: ((attrs: WikiLinkAttrs) => boolean) | null;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    wikiLink: {
      insertWikiLink: (attrs: Partial<WikiLinkAttrs> & { target: string }) => ReturnType;
    };
  }
}

// Parses the text between `[[` and `]]`.
export function parseWikiLink(inner: string): WikiLinkAttrs {
  const pipe = inner.indexOf("|");
  const ref = pipe === -1 ? inner : inner.slice(0, pipe);
  const alias = pipe === -1 ? null : inner.slice(pipe + 1).trim() || null;
  const hash = ref.indexOf("#");
  const target = (hash === -1 ? ref : ref.slice(0, hash)).trim();
  const fragment = hash === -1 ? "" : ref.slice(hash + 1).trim();
  if (fragment.startsWith("^")) {
    return { target, heading: null, blockId: fragment.slice(1) || null, alias };
  }
  return { target, heading: fragment || null, blockId: null, alias };
}

export function wikiLinkLabel(attrs: WikiLinkAttrs) {
  if (attrs.alias) return attrs.alias;
  const parts = [attrs.target, attrs.heading, attrs.blockId && `^${attrs.blockId}`].filter(Boolean);
  return parts.join(" > ");
}

// A nullable string attribute stored as `data-<name>` (camel-cased in the node).
export function stringAttr(name: string) {
  return {
    default: null,
    parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`),
    renderHTML: (attrs: Record<string, unknown>) => {
      const value = attrs[toCamel(name)];
      return typeof value === "string" ? { [`data-${name}`]: value } : {};
    },
  };
}

function toCamel(name: string) {
  return name.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
}

export const WikiLink = Node.create<WikiLinkOptions>({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { onOpen: null, isResolved: null };
  },

  addAttributes() {
    return {
      target: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-target") ?? "",
        renderHTML: (attrs) => ({ "data-target": attrs.target as string }),
      },
      heading: stringAttr("heading"),
      blockId: stringAttr("block-id"),
      alias: stringAttr("alias"),
    };
  },

  parseHTML() {
    return [{ tag: 'a[data-type="wiki-link"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as WikiLinkAttrs;
    const resolved = this.options.isResolved?.(attrs) ?? true;
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        "data-type": "wiki-link",
        "data-unresolved": resolved ? undefined : "true",
      }),
      wikiLinkLabel(attrs),
    ];
  },

  renderText({ node }) {
    return wikiLinkLabel(node.attrs as WikiLinkAttrs);
  },

  addCommands() {
    return {
      insertWikiLink:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },

  addInputRules() {
    return [
      inlineAtomInputRule({
        // Not after `!`: that is an embed.
        find: /(?<!!)\[\[([^[\]]+)\]\]$/,
        type: this.type,
        getAttributes: (match) => parseWikiLink(match[1] ?? ""),
      }),
    ];
  },

  addProseMirrorPlugins() {
    const { onOpen } = this.options;
    if (!onOpen) return [];
    const name = this.name;
    return [
      new Plugin({
        key: new PluginKey("wikiLinkOpen"),
        props: {
          handleClickOn: (view, _pos, node, _nodePos, event) => {
            if (node.type.name !== name) return false;
            if (view.editable && !(event.metaKey || event.ctrlKey)) return false;
            onOpen(node.attrs as WikiLinkAttrs);
            return true;
          },
        },
      }),
    ];
  },
});
