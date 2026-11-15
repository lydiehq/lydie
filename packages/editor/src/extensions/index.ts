import type { AnyExtension, Editor, NodeViewRenderer } from "@tiptap/core";
import { Highlight } from "@tiptap/extension-highlight";
import { TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { CharacterCount, Placeholder, Selection } from "@tiptap/extensions";
import { StarterKit } from "@tiptap/starter-kit";
import type { Doc as YDoc } from "yjs";

import { Callout } from "./callout";
import { Column, ColumnList } from "./columns";
import { Code, CodeBlock, Image, Link, OrderedList } from "./core-overrides";
import { Directive } from "./directive";
import { DragFeedback } from "./drag-feedback";
import { Embed } from "./embed";
import { FootnoteDefinition, FootnoteReference } from "./footnote";
import { IndentHandler } from "./indent-handler";
import { KeyboardShortcuts } from "./keyboard-shortcuts";
import { MathBlock, MathInline } from "./math";
import { EscapeSelectsBlock, NotionShortcuts } from "./notion-shortcuts";
import { RawBlock, RawInline } from "./raw";
import { SlashCommands } from "./slash-commands";
import type { SlashCommandItem, SuggestionRender } from "./slash-commands";
import { TaskItem } from "./task-item";
import { WikiLink } from "./wiki-link";
import type { WikiLinkAttrs } from "./wiki-link";
import { WikiLinkSuggestions } from "./wiki-link-suggestion";
import type { CreateSubPage, SearchDocuments, WikiLinkSuggestion } from "./wiki-link-suggestion";

// The contract with @lydie/markdown: these names (and the attributes in schema.test.ts) are what
// the Markdown engine produces and consumes. Change them only together with it.
export const LYDIE_NODE_NAMES = [
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "hardBreak",
  "image",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
  "callout",
  "wikiLink",
  "embed",
  "mathInline",
  "mathBlock",
  "footnoteReference",
  "footnoteDefinition",
  "directive",
  "columnList",
  "column",
  "rawBlock",
  "rawInline",
] as const;

export const LYDIE_MARK_NAMES = ["bold", "italic", "strike", "code", "link", "highlight"] as const;

export type LydieNodeName = (typeof LYDIE_NODE_NAMES)[number];
export type LydieMarkName = (typeof LYDIE_MARK_NAMES)[number];

export type LydieExtensionsOptions = {
  // Shown in the empty block that has the cursor.
  placeholder?: string;
  // A Yjs document to edit collaboratively. Disables the local undo history (Yjs has its own).
  // With `awareness` (a y-protocols Awareness, e.g. the collab provider's), other people's carets
  // and selections show too.
  collaboration?: {
    document: YDoc;
    field?: string;
    awareness?: unknown;
    user?: { name: string; color: string };
    renderCaret?: (user: Record<string, unknown>) => HTMLElement;
    renderSelection?: (user: Record<string, unknown>) => Record<string, string>;
  };
  // Items for the `/` menu. A function is re-read on every keystroke, so it can change over time.
  slashItems?: readonly SlashCommandItem[] | (() => readonly SlashCommandItem[]);
  slashRender?: SuggestionRender<SlashCommandItem>;
  // Replaces the default `/` filter.
  slashFilter?: (items: readonly SlashCommandItem[], query: string) => SlashCommandItem[];
  // Enables the `[[` popup. The editor never reads documents itself.
  searchDocuments?: SearchDocuments;
  wikiLinkRender?: SuggestionRender<WikiLinkSuggestion>;
  onOpenWikiLink?: (attrs: WikiLinkAttrs) => void;
  // Creates a sub-page of the open document. Enables Mod-Alt-9 (turn the line into a page) and
  // the `+` menu (rendered by `pageRender`, which gets the same items as the `[[` menu).
  createSubPage?: CreateSubPage;
  pageRender?: SuggestionRender<WikiLinkSuggestion>;
  // Called by Mod-k (and the `openLinkEditor` command) so the host can show its link editor.
  onOpenLink?: (editor: Editor) => void;
  // Node views by node name, supplied by a renderer (the React editor passes its own).
  nodeViews?: Partial<Record<LydieNodeName, NodeViewRenderer>>;
  // Extra extensions, e.g. from plugins. They must not add nodes or marks outside the contract
  // unless @lydie/markdown learns them too.
  extensions?: AnyExtension[];
};

type CollaborationModule = typeof import("./collaboration");
let collaborationModule: CollaborationModule | null = null;
let collaborationLoading: Promise<CollaborationModule> | null = null;

// Loads the Yjs binding (once). `createLydieExtensions` with `collaboration` needs it loaded.
export function loadCollaboration(): Promise<CollaborationModule> {
  collaborationLoading ??= import("./collaboration").then((m) => (collaborationModule = m));
  return collaborationLoading;
}
export const collaborationLoaded = () => collaborationModule !== null;

export function createLydieExtensions(options: LydieExtensionsOptions = {}): AnyExtension[] {
  const slashItems = options.slashItems;
  const getSlashItems =
    typeof slashItems === "function" ? slashItems : () => slashItems ?? ([] as const);

  const schemaExtensions: AnyExtension[] = [
    StarterKit.configure({
      code: false,
      codeBlock: false,
      link: false,
      underline: false,
      orderedList: false,
      // DragFeedback draws the drop line instead.
      dropcursor: false,
      undoRedo: options.collaboration ? false : undefined,
    }),
    Code,
    OrderedList,
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    Image,
    Link.configure({ openOnClick: false, autolink: true, defaultProtocol: "https" }),
    Highlight,
    CodeBlock,
    Callout,
    WikiLink.configure({ onOpen: options.onOpenWikiLink ?? null }),
    Embed,
    MathInline,
    MathBlock,
    FootnoteReference,
    FootnoteDefinition,
    Directive,
    ColumnList,
    Column,
    RawBlock,
    RawInline,
  ];

  const withViews = schemaExtensions.map((extension) => {
    const view = options.nodeViews?.[extension.name as LydieNodeName];
    return view ? extension.extend({ addNodeView: () => view }) : extension;
  });

  const behaviour: AnyExtension[] = [
    IndentHandler,
    KeyboardShortcuts.configure({ onOpenLink: options.onOpenLink ?? null }),
    NotionShortcuts.configure({
      createSubPage: options.createSubPage ?? null,
      onOpenWikiLink: options.onOpenWikiLink ?? null,
    }),
    EscapeSelectsBlock,
    DragFeedback,
    SlashCommands.configure({
      items: getSlashItems,
      render: options.slashRender ?? null,
      ...(options.slashFilter ? { filter: options.slashFilter } : {}),
    }),
    WikiLinkSuggestions.configure({
      searchDocuments: options.searchDocuments ?? null,
      render: options.wikiLinkRender ?? null,
      createSubPage: options.createSubPage ?? null,
      pageRender: options.pageRender ?? null,
    }),
    Selection,
    CharacterCount,
  ];
  if (options.placeholder) {
    const text = options.placeholder;
    behaviour.push(
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === "heading" ? `Heading ${String(node.attrs.level)}` : text,
      }),
    );
  }
  if (options.collaboration) {
    if (!collaborationModule)
      throw new Error("Call loadCollaboration() before a collaborative editor");
    const { Collaboration, CollaborationCaret } = collaborationModule;
    const collab = options.collaboration;
    behaviour.push(
      Collaboration.configure({
        document: collab.document,
        field: collab.field ?? "default",
      }),
    );
    if (collab.awareness) {
      behaviour.push(
        CollaborationCaret.configure({
          provider: { awareness: collab.awareness },
          ...(collab.user ? { user: collab.user } : {}),
          ...(collab.renderCaret ? { render: collab.renderCaret } : {}),
          ...(collab.renderSelection ? { selectionRender: collab.renderSelection } : {}),
        }),
      );
    }
  }

  return [...withViews, ...behaviour, ...(options.extensions ?? [])];
}
