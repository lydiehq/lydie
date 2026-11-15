// Notion's editor shortcuts (notion.com/help/keyboard-shortcuts), mapped onto the Markdown schema.
// No new nodes or attributes: a Notion toggle is a foldable callout, a page block a wiki link.
import {
  Extension,
  getTextBetween,
  getTextSerializersFromSchema,
  isMacOS,
  markInputRule,
  wrappingInputRule,
} from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorState, Selection } from "@tiptap/pm/state";

import type { CalloutAttrs } from "./callout";
import type { WikiLinkAttrs } from "./wiki-link";
import { linkContent, trackPosition } from "./wiki-link-suggestion";
import type { CreateSubPage } from "./wiki-link-suggestion";

export type NotionShortcutsOptions = {
  // Mod-Alt-9 (turn the line into a page) and the `+` menu's "new page" need it.
  createSubPage: CreateSubPage | null;
  onOpenWikiLink: ((attrs: WikiLinkAttrs) => void) | null;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    notionShortcuts: {
      // Lifts the block out of any list and makes it a paragraph (Notion's "Text").
      turnIntoText: () => ReturnType;
      // Wraps the block in a foldable callout, or unwraps the foldable callout it is in.
      toggleFoldableCallout: () => ReturnType;
      // Opens every foldable callout, or closes them all when any is open.
      toggleAllCallouts: () => ReturnType;
      duplicateBlock: () => ReturnType;
      moveBlock: (direction: "up" | "down") => ReturnType;
      // Checks a task, folds a callout or follows a wiki link at the caret (Notion's Mod-Enter).
      activateBlock: () => ReturnType;
    };
  }
}

const ITEMS = new Set(["listItem", "taskItem"]);

// The blocks a block command acts on: a selected block node, the blocks the selection spans, or
// the caret's block. A list item's first paragraph stands for the whole item, as in Notion where
// nested blocks belong to the line above.
export function blockRangeOf(state: EditorState): { from: number; to: number } | null {
  const { selection } = state;
  if (selection instanceof NodeSelection && selection.node.isBlock) {
    return { from: selection.from, to: selection.to };
  }
  const range = selection.$from.blockRange(selection.$to);
  if (!range) return null;
  const parent = range.parent;
  if (range.depth > 0 && ITEMS.has(parent.type.name) && range.startIndex === 0) {
    return { from: range.$from.before(range.depth), to: range.$to.after(range.depth) };
  }
  return { from: range.start, to: range.end };
}

function textOf(editor: Editor, node: ProseMirrorNode) {
  return getTextBetween(
    node,
    { from: 0, to: node.content.size },
    { textSerializers: getTextSerializersFromSchema(editor.schema) },
  );
}

// Mod-Alt-9: the caret's paragraph or heading becomes a link to a new sub-page with its text as the
// title (Notion's "turn into page").
async function turnIntoPage(editor: Editor, createSubPage: CreateSubPage) {
  const { $from } = editor.state.selection;
  const block = $from.parent;
  const start = $from.before();
  const tracked = trackPosition(editor, start);
  try {
    const created = await createSubPage(textOf(editor, block).trim());
    const at = tracked.get();
    if (!created || at === null || editor.isDestroyed) return;
    const current = editor.state.doc.nodeAt(at);
    if (!current?.isTextblock) return;
    const paragraph = editor.schema.nodes.paragraph!.create(
      null,
      editor.schema.nodeFromJSON(linkContent(created)),
    );
    const tr = editor.state.tr.replaceWith(at, at + current.nodeSize, paragraph);
    tr.setSelection(TextSelection.create(tr.doc, at + paragraph.nodeSize - 1));
    editor.view.dispatch(tr);
  } finally {
    tracked.stop();
  }
}

// The selection moved along with the blocks it is in.
function shifted(selection: Selection, doc: ProseMirrorNode, shift: number): Selection {
  if (selection instanceof NodeSelection) return NodeSelection.create(doc, selection.from + shift);
  return TextSelection.between(
    doc.resolve(selection.anchor + shift),
    doc.resolve(selection.head + shift),
  );
}

function canTurnIntoPage(state: EditorState) {
  const { $from } = state.selection;
  return ["paragraph", "heading"].includes($from.parent.type.name);
}

export const NotionShortcuts = Extension.create<NotionShortcutsOptions>({
  name: "notionShortcuts",
  // Above TipTap's own bindings (heading's Mod-Alt-4…6, hard break's Mod-Enter, core's Mod-a).
  priority: 110,

  addOptions() {
    return { createSubPage: null, onOpenWikiLink: null };
  },

  addCommands() {
    return {
      turnIntoText:
        () =>
        ({ state, commands }) => {
          // One lift per nesting level (the commands share this transaction).
          for (let depth = state.selection.$from.depth; depth > 0; depth--) {
            if (!commands.liftListItem("taskItem") && !commands.liftListItem("listItem")) break;
          }
          return commands.setParagraph();
        },

      toggleFoldableCallout:
        () =>
        ({ state, commands }) => {
          const { $from } = state.selection;
          for (let depth = $from.depth; depth > 0; depth--) {
            const node = $from.node(depth);
            if (node.type.name === "callout" && (node.attrs as CalloutAttrs).fold !== null) {
              return commands.lift("callout");
            }
          }
          return commands.setCallout({ kind: "note", fold: "open" });
        },

      toggleAllCallouts:
        () =>
        ({ state, tr, dispatch }) => {
          const callouts: { pos: number; node: ProseMirrorNode }[] = [];
          state.doc.descendants((node, pos) => {
            if (node.type.name === "callout" && node.attrs.fold !== null) {
              callouts.push({ pos, node });
            }
          });
          if (callouts.length === 0) return false;
          const fold = callouts.some(({ node }) => node.attrs.fold === "open") ? "closed" : "open";
          if (dispatch) {
            for (const { pos, node } of callouts) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, fold });
            }
          }
          return true;
        },

      duplicateBlock:
        () =>
        ({ state, tr, dispatch }) => {
          const range = blockRangeOf(state);
          if (!range) return false;
          if (dispatch) {
            const copy = state.doc.slice(range.from, range.to).content;
            tr.insert(range.to, copy);
            // Notion moves to the copy.
            const shift = range.to - range.from;
            tr.setSelection(shifted(state.selection, tr.doc, shift));
          }
          return true;
        },

      moveBlock:
        (direction) =>
        ({ state, tr, dispatch }) => {
          const range = blockRangeOf(state);
          if (!range) return false;
          const $from = state.doc.resolve(range.from);
          const parent = $from.parent;
          const startIndex = $from.index();
          const endIndex = state.doc.resolve(range.to).index($from.depth);
          const moved = state.doc.slice(range.from, range.to).content;
          let shift: number;
          if (direction === "up") {
            const before = startIndex > 0 ? parent.child(startIndex - 1) : null;
            // At the edge: nothing to swap with, but the key is still ours.
            if (!before) return true;
            if (!dispatch) return true;
            tr.replaceWith(
              range.from - before.nodeSize,
              range.to,
              moved.append(Fragment.from(before)),
            );
            shift = -before.nodeSize;
          } else {
            const after = endIndex < parent.childCount ? parent.child(endIndex) : null;
            if (!after) return true;
            if (!dispatch) return true;
            tr.replaceWith(
              range.from,
              range.to + after.nodeSize,
              Fragment.from(after).append(moved),
            );
            shift = after.nodeSize;
          }
          tr.setSelection(shifted(state.selection, tr.doc, shift)).scrollIntoView();
          return true;
        },

      activateBlock:
        () =>
        ({ state, tr, dispatch }) => {
          const open = this.options.onOpenWikiLink;
          const { selection } = state;
          if (selection instanceof NodeSelection && selection.node.type.name === "wikiLink") {
            if (!open) return false;
            if (dispatch) open(selection.node.attrs as WikiLinkAttrs);
            return true;
          }
          const { $from } = selection;
          // A task is checked even with a link at the caret: checking is the block's own action.
          for (let depth = $from.depth; depth > 0; depth--) {
            const node = $from.node(depth);
            if (node.type.name !== "taskItem") continue;
            if (dispatch) {
              tr.setNodeMarkup($from.before(depth), undefined, {
                ...node.attrs,
                checked: !node.attrs.checked,
              });
            }
            return true;
          }
          if (selection.empty && open) {
            const link = [$from.nodeAfter, $from.nodeBefore].find(
              (node) => node?.type.name === "wikiLink",
            );
            if (link) {
              if (dispatch) open(link.attrs as WikiLinkAttrs);
              return true;
            }
          }
          for (let depth = $from.depth; depth > 0; depth--) {
            const node = $from.node(depth);
            if (node.type.name !== "callout" || node.attrs.fold === null) continue;
            if (dispatch) {
              tr.setNodeMarkup($from.before(depth), undefined, {
                ...node.attrs,
                fold: node.attrs.fold === "open" ? "closed" : "open",
              });
            }
            return true;
          }
          return false;
        },
    };
  },

  addKeyboardShortcuts() {
    const editor = this.editor;
    const createSubPage = this.options.createSubPage;
    // Notion's block types by digit. 4…6 replace TipTap's H4…H6 (still typed as `####` etc.).
    const blockTypes: Record<number, () => boolean> = {
      0: () => editor.commands.turnIntoText(),
      1: () => editor.commands.toggleHeading({ level: 1 }),
      2: () => editor.commands.toggleHeading({ level: 2 }),
      3: () => editor.commands.toggleHeading({ level: 3 }),
      4: () => editor.commands.toggleTaskList() || true,
      5: () => editor.commands.toggleBulletList() || true,
      6: () => editor.commands.toggleOrderedList() || true,
      7: () => editor.commands.toggleFoldableCallout(),
      8: () => editor.commands.toggleCodeBlock(),
      9: () => {
        if (!createSubPage || !canTurnIntoPage(editor.state)) return false;
        void turnIntoPage(editor, createSubPage).catch(() => {});
        return true;
      },
    };
    const bindings: Record<string, () => boolean> = {};
    for (const [digit, run] of Object.entries(blockTypes)) bindings[`Mod-Alt-${digit}`] = run;
    // Windows and Linux: Notion's Ctrl+Shift+digit (Ctrl+Alt is AltGr on many layouts). 7…9 stay
    // TipTap's (and Google Docs') ordered, bullet and task list; macOS keeps Cmd+Shift+3…5 for
    // screenshots, so it has only the Mod-Alt set.
    if (!isMacOS()) {
      for (const digit of [0, 1, 2, 3, 4, 5, 6])
        bindings[`Mod-Shift-${digit}`] = blockTypes[digit]!;
    }

    return {
      ...bindings,
      // Notion has no hard break on Mod-Enter (Shift-Enter still is one), so it is always ours.
      "Mod-Enter": () => {
        editor.commands.activateBlock();
        return true;
      },
      "Mod-d": () => editor.commands.duplicateBlock(),
      "Mod-Shift-ArrowUp": () => editor.commands.moveBlock("up"),
      "Mod-Shift-ArrowDown": () => editor.commands.moveBlock("down"),
      "Mod-Alt-t": () => editor.commands.toggleAllCallouts(),
      // First press: the block's text; second press (or an empty block): the whole document.
      "Mod-a": () => {
        const { selection } = editor.state;
        const { $from, $to } = selection;
        if (selection instanceof NodeSelection) return false;
        if (!$from.sameParent($to) || !$from.parent.isTextblock) return false;
        const start = $from.start();
        const end = $from.end();
        if (start === end || (selection.from === start && selection.to === end)) return false;
        return editor.commands.setTextSelection({ from: start, to: end });
      },
    };
  },

  addInputRules() {
    const { nodes, marks } = this.editor.schema;
    return [
      // Notion's `"` quote, besides Markdown's `>`.
      wrappingInputRule({ find: /^\s*["“]\s$/, type: nodes.blockquote! }),
      // Notion's single tildes; `~~s~~` stays TipTap's. No space just inside the tildes, and only
      // after a space or the block start, so the double form is never cut short.
      markInputRule({ find: /(?:^|\s)(~(?![\s~])([^~]+)(?<!\s)~)$/, type: marks.strike! }),
    ];
  },
});

// Notion's Escape: selects the top-level block the caret is in. Below every other extension, so
// menus and popovers that close on Escape get it first.
export const EscapeSelectsBlock = Extension.create({
  name: "escapeSelectsBlock",
  priority: 10,

  addKeyboardShortcuts() {
    return {
      Escape: ({ editor }) => {
        const { selection } = editor.state;
        // Already a top-level block (or everything) selected: let the host have it.
        if (selection.$from.depth === 0) return false;
        const pos = selection.$from.before(1);
        editor.view.dispatch(
          editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)),
        );
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("escapeSelectsBlock"),
        props: {
          // Typing over a selected block (after Escape) goes to its end instead of replacing it.
          handleTextInput(view, _from, _to, text) {
            const { selection } = view.state;
            if (!(selection instanceof NodeSelection)) return false;
            const node = selection.node;
            if (!node.isBlock || node.isAtom || node.content.size === 0) return false;
            const end = TextSelection.near(view.state.doc.resolve(selection.to - 1), -1);
            if (!(end instanceof TextSelection)) return false;
            view.dispatch(view.state.tr.setSelection(end).insertText(text).scrollIntoView());
            return true;
          },
        },
      }),
    ];
  },
});
