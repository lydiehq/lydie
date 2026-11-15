// Headless (no React, no DOM needed to build a schema)
export {
  collaborationLoaded,
  createLydieExtensions,
  loadCollaboration,
  LYDIE_MARK_NAMES,
  LYDIE_NODE_NAMES,
} from "./extensions";
export type { LydieExtensionsOptions, LydieMarkName, LydieNodeName } from "./extensions";
export { getLydieSchema } from "./schema";
export { describeSchema } from "./schema-description";
export type { NodeDescription } from "./schema-description";
export { contentLineStart } from "./content-layout";

export { Callout, calloutLabel, parseFold } from "./extensions/callout";
export type { CalloutAttrs, CalloutFold } from "./extensions/callout";
export { columnShares, resizeColumns, sideHit } from "./extensions/column-layout";
export type { Box, LayoutBlock, Side, SideHit } from "./extensions/column-layout";
export { columnsStacked, setColumnsStacked, STACK_BELOW_REM } from "./extensions/column-resize";
export {
  canDropBeside,
  Column,
  ColumnList,
  dropBeside,
  MAX_COLUMNS,
  moveBlocks,
} from "./extensions/columns";
export type { BlockRange, ColumnAttrs, SideTarget } from "./extensions/columns";
export { CodeBlock, Image, Link, lowlight, OrderedList } from "./extensions/core-overrides";
export { isDiagramLanguage, mountDiagram } from "./diagram";
export type { DiagramOutcome } from "./diagram";
export { Directive, directiveLabel } from "./extensions/directive";
export type { DirectiveAttrs } from "./extensions/directive";
export { Embed } from "./extensions/embed";
export type { EmbedAttrs } from "./extensions/embed";
export { FootnoteDefinition, FootnoteReference } from "./extensions/footnote";
export type { FootnoteAttrs } from "./extensions/footnote";
export { IndentHandler } from "./extensions/indent-handler";
export { KeyboardShortcuts } from "./extensions/keyboard-shortcuts";
export type { KeyboardShortcutsOptions } from "./extensions/keyboard-shortcuts";
export { MathBlock, MathInline } from "./extensions/math";
export { blockRangeOf, EscapeSelectsBlock, NotionShortcuts } from "./extensions/notion-shortcuts";
export type { NotionShortcutsOptions } from "./extensions/notion-shortcuts";
export { RawBlock, RawInline } from "./extensions/raw";
export type { RawAttrs } from "./extensions/raw";
export {
  filterSlashItems,
  SlashCommands,
  slashCommandsPluginKey,
} from "./extensions/slash-commands";
export type {
  SlashCommandItem,
  SlashCommandsOptions,
  SuggestionRender,
} from "./extensions/slash-commands";
export { parseWikiLink, WikiLink, wikiLinkLabel } from "./extensions/wiki-link";
export type { WikiLinkAttrs, WikiLinkOptions } from "./extensions/wiki-link";
export {
  linkContent,
  pageSuggestionPluginKey,
  suggestionToAttrs,
  WikiLinkSuggestions,
  wikiLinkSuggestionPluginKey,
} from "./extensions/wiki-link-suggestion";
export type {
  CreateSubPage,
  SearchDocuments,
  WikiLinkSuggestion,
  WikiLinkSuggestionOptions,
} from "./extensions/wiki-link-suggestion";
export {
  canEditTable,
  columnAlign,
  editTable,
  selectTableLine,
  tableSize,
} from "./extensions/table-tools";
export type { TableAlign, TableAxis, TableEdit, TableTarget } from "./extensions/table-tools";
export { blockTypeActions, getActiveBlockType, markActions, setLinkHref } from "./formatting";
export type { FormattingAction } from "./formatting";
export { defaultSlashItems } from "./slash-items";

// React
export { LydieEditor } from "./react/LydieEditor";
export type { DragHandleBlock, LydieEditorProps } from "./react/LydieEditor";
export type {
  CodeLanguagePickerProps,
  EmbedRenderProps,
  TableHandleAction,
  TableHandleProps,
} from "./react/context";
export { createSuggestionStore } from "./react/suggestion-store";
export { SuggestionPopup } from "./react/SuggestionPopup";

// Building blocks for plugin extensions: plugins reach TipTap and ProseMirror only through here.
export { Extension, getMarkRange } from "@tiptap/core";
export { NodeSelection, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
export type { EditorState, Transaction } from "@tiptap/pm/state";
export { Decoration, DecorationSet } from "@tiptap/pm/view";
export type { EditorView } from "@tiptap/pm/view";
export { Mapping, Step, StepMap } from "@tiptap/pm/transform";
export { Fragment, Slice } from "@tiptap/pm/model";
export type { Node as ProseMirrorNode } from "@tiptap/pm/model";
export { default as Suggestion } from "@tiptap/suggestion";
export type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
export type { SuggestionMenuProps, SuggestionState } from "./react/suggestion-store";
export type { AnyExtension, Editor, JSONContent } from "@tiptap/core";
export { useEditorState } from "@tiptap/react";
