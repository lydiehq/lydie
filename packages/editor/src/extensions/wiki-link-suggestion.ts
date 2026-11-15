import { Extension } from "@tiptap/core";
import type { Editor, EditorEvents, Range } from "@tiptap/core";
import { PluginKey, TextSelection } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";

import type { SuggestionRender } from "./slash-commands";
import type { WikiLinkAttrs } from "./wiki-link";

// A search result for the `[[` popup. The host owns the data; the editor only asks.
export type WikiLinkSuggestion = {
  // What goes into the link: usually the document's path or name without `.md`.
  target: string;
  // What the popup shows; defaults to `target`.
  title?: string;
  description?: string;
  heading?: string | null;
  blockId?: string | null;
  // Written as a Markdown link `[title](href)` instead of `[[target]]` (a folder's link format).
  href?: string;
  // The `+` menu's first entry: picking it creates a sub-page titled `target` and links it.
  create?: boolean;
};

export type SearchDocuments = (query: string) => Promise<WikiLinkSuggestion[]>;

// Creates a sub-page of the open document titled `title` and returns how to link to it (null:
// nothing was created). The editor has no data access; the host does this.
export type CreateSubPage = (title: string) => Promise<WikiLinkSuggestion | null>;

export type WikiLinkSuggestionOptions = {
  searchDocuments: SearchDocuments | null;
  render: SuggestionRender<WikiLinkSuggestion> | null;
  // Enables Notion's `+` menu (new sub-page first, then `searchDocuments` results).
  createSubPage: CreateSubPage | null;
  pageRender: SuggestionRender<WikiLinkSuggestion> | null;
};

export const wikiLinkSuggestionPluginKey = new PluginKey("wikiLinkSuggestion");
export const pageSuggestionPluginKey = new PluginKey("pageSuggestion");

export function suggestionToAttrs(item: WikiLinkSuggestion): WikiLinkAttrs {
  return {
    target: item.target,
    heading: item.heading ?? null,
    blockId: item.blockId ?? null,
    alias: null,
  };
}

// What picking a suggestion inserts: a wiki link, or a Markdown link in folders that use them.
export function linkContent(item: WikiLinkSuggestion) {
  return item.href
    ? {
        type: "text",
        text: item.title ?? item.target,
        marks: [{ type: "link", attrs: { href: item.href } }],
      }
    : { type: "wikiLink", attrs: suggestionToAttrs(item) };
}

function insertLink(editor: Editor, range: Range, item: WikiLinkSuggestion) {
  editor
    .chain()
    .focus()
    .insertContentAt(range, [linkContent(item), { type: "text", text: " " }])
    .unsetMark("link")
    .run();
}

// Follows a position through later transactions; `get()` is null once the content around it is
// deleted. For results that arrive asynchronously (a page being created).
export function trackPosition(editor: Editor, pos: number) {
  let current: number | null = pos;
  const onTransaction = ({ transaction, appendedTransactions }: EditorEvents["transaction"]) => {
    for (const tr of [transaction, ...appendedTransactions]) {
      if (current === null) return;
      const result = tr.mapping.mapResult(current);
      current = result.deleted ? null : result.pos;
    }
  };
  editor.on("transaction", onTransaction);
  return {
    get: () => current,
    stop: () => void editor.off("transaction", onTransaction),
  };
}

// Creates the page, then inserts the link at `pos`, mapped through whatever happened meanwhile.
// The caret follows the link only if it had not moved.
export async function insertSubPageLink(
  editor: Editor,
  createSubPage: CreateSubPage,
  title: string,
  pos: number,
) {
  const tracked = trackPosition(editor, pos);
  try {
    const created = await createSubPage(title);
    const at = tracked.get();
    if (!created || at === null || editor.isDestroyed) return;
    const { selection } = editor.state;
    const caretThere = selection.empty && selection.from === at;
    const link = editor.schema.nodeFromJSON(linkContent(created));
    const tr = editor.state.tr.insert(at, [link, editor.schema.text(" ")]);
    if (caretThere) tr.setSelection(TextSelection.create(tr.doc, at + link.nodeSize + 1));
    editor.view.dispatch(tr);
  } finally {
    tracked.stop();
  }
}

export const WikiLinkSuggestions = Extension.create<WikiLinkSuggestionOptions>({
  name: "wikiLinkSuggestion",

  addOptions() {
    return { searchDocuments: null, render: null, createSubPage: null, pageRender: null };
  },

  addProseMirrorPlugins() {
    const { searchDocuments, render, createSubPage, pageRender } = this.options;
    const search = async (query: string) => {
      if (!searchDocuments) return [];
      try {
        return await searchDocuments(query);
      } catch {
        return [];
      }
    };
    const plugins = [];
    if (searchDocuments) {
      plugins.push(
        Suggestion<WikiLinkSuggestion, WikiLinkSuggestion>({
          editor: this.editor,
          char: "[[",
          allowSpaces: true,
          allowedPrefixes: null,
          pluginKey: wikiLinkSuggestionPluginKey,
          items: ({ query }) => search(query),
          command: ({ editor, range, props }) => {
            // Swallow an auto-closed `]]` right after the query, if the user typed one.
            const after = editor.state.doc.textBetween(
              range.to,
              Math.min(range.to + 2, editor.state.doc.content.size),
            );
            insertLink(
              editor,
              { from: range.from, to: after === "]]" ? range.to + 2 : range.to },
              props,
            );
          },
          ...(render ? { render } : {}),
        }),
      );
    }
    if (createSubPage) {
      plugins.push(
        // Notion's `+`: at the start of a block or after a space (so `a+b` and `C++` stay text),
        // only once a letter follows (`+1` and the `+ ` bullet never open it), and only in prose
        // (not in code, math or inline code, where ` +x` is common).
        Suggestion<WikiLinkSuggestion, WikiLinkSuggestion>({
          editor: this.editor,
          char: "+",
          allowSpaces: true,
          pluginKey: pageSuggestionPluginKey,
          shouldShow: ({ query, range, transaction }) => {
            if (!/^\p{L}/u.test(query) || /\s\s/.test(query)) return false;
            const $pos = transaction.doc.resolve(range.from);
            if (!["paragraph", "heading"].includes($pos.parent.type.name)) return false;
            return !$pos
              .marksAcross(transaction.doc.resolve(range.to))
              ?.some((m) => m.type.spec.code);
          },
          items: async ({ query }) => {
            const title = query.trim();
            const found = await search(title);
            return [{ target: title, title, description: "New sub-page", create: true }, ...found];
          },
          command: ({ editor, range, props }) => {
            if (!props.create) {
              insertLink(editor, range, props);
              return;
            }
            editor.chain().focus().deleteRange(range).run();
            void insertSubPageLink(editor, createSubPage, props.target, range.from).catch(() => {});
          },
          ...(pageRender ? { render: pageRender } : {}),
        }),
      );
    }
    return plugins;
  },
});
