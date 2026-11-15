# AGENTS.md - @lydie/editor

TipTap 3 extensions whose schema is the contract with `@lydie/markdown`, plus a React `<LydieEditor>`.
Licence: MIT.

## May depend on

`@lydie/markdown`. `client/scripts/check-boundaries.ts` is authoritative and runs in CI. Not
`@lydie/ui`: menus and toolbars are render slots the host fills with `@lydie/ui` components.

## Rules

- The schema is a contract. Node/mark names and attributes are pinned by `src/schema.test.ts` and its
  snapshot (`src/__snapshots__/schema.test.ts.snap`). Change them only together with
  `@lydie/markdown`, then update the snapshot (`bun test -u`) in the same change.
- Every node and mark must round-trip through `@lydie/markdown`. TipTap's own extensions are narrowed
  (`core-overrides.ts`) so no attribute exists that Markdown cannot store.
- The headless part (`createLydieExtensions`, `getLydieSchema`, everything in `src/extensions`) must
  not touch the DOM at import time; `getLydieSchema()` runs in Node and workers. React lives in
  `src/react`, and node views are injected through the `nodeViews` option.
- No data access: the `[[` popup calls the host's `searchDocuments(query)`.
- Positioning: floating-ui only (TipTap's BubbleMenu/DragHandle and the suggestion popups). No tippy.
- Every user-visible action is an operation defined with `defineOperation` in `@lydie/contract`.

## Schema

Nodes: `doc, paragraph, text, heading(level), bulletList, orderedList(start), listItem, taskList,
taskItem(checked), blockquote, codeBlock(language), horizontalRule, hardBreak, image(src, alt,
title), table, tableRow, tableHeader, tableCell (both colspan, rowspan, colwidth, align),
callout(kind="note", title=null, fold=null|"open"|"closed"), wikiLink (inline atom: target,
heading, blockId, alias), embed (block atom: target, heading, blockId, alias), mathInline (inline, content text*), mathBlock
(block, content text*), footnoteReference (inline atom: label), footnoteDefinition (block+: label),
directive (block+: name, attrs: Record<string,string>), columnList (block, column+), column
(block+: width=null, percent of the row), rawBlock (block atom: source), rawInline (inline atom:
source)`. Marks: `bold, italic, strike, code, link(href, title), highlight`.

The code mark excludes only itself (TipTap's excludes every mark), as in @lydie/markdown, so
``[`x`](url)`` keeps its link. `embed` carries the same attributes as Markdown's; `embedSource(attrs)`
rebuilds the text between the brackets (what `renderEmbed` gets as `target`, and what embeds
stored before the split still hold whole in `target`); typed and `insertEmbed({ target })` embeds
are split with `parseWikiLink`.

Still different from @lydie/markdown (LYD-156; both need a migration of stored Yjs documents):
`image` is a block node, and table cells take `block+`, not one paragraph.

Choices the Markdown side must know: `image` is a block node (TipTap default, as in v1); math
source is the node's text content, not an attribute; footnotes carry `label` (not in the original
list, but needed); `callout.fold` maps `+` → "open", `-` → "closed"; `directive` and `callout` hold
`block+` (an empty directive gets one empty paragraph); `tableRow` content is
`(tableCell | tableHeader)*`; heading levels 1–6; `columnList`/`column` are `::::columns` /
`:::column{width="40%"}` (any other shape of that directive stays a `directive`).

## Public API (`src/index.ts`)

Headless:

- `createLydieExtensions(options)`: the full extension set. Options: `placeholder` (empty
  paragraphs; an empty heading shows "Heading N" instead),
  `collaboration: { document: Y.Doc, field?, awareness?, user?, renderCaret?, renderSelection? }`
  (disables local undo; `awareness` adds collaboration carets), `slashItems` (array or getter),
  `slashRender`, `searchDocuments`, `wikiLinkRender`, `onOpenWikiLink`, `onOpenLink`,
  `createSubPage(title) => Promise<WikiLinkSuggestion | null>` (the host creates a child of the open
  document; enables Mod-Alt-9 and the `+` menu), `pageRender` (the `+` menu), `nodeViews`,
  `extensions` (extra, e.g. from plugins).
- `getLydieSchema()`, `describeSchema(schema)`, `LYDIE_NODE_NAMES`, `LYDIE_MARK_NAMES`.
- `contentLineStart(fullWidth)`: the `--editor-content-line-start` value the editor sets (where
  the text column starts; tables line up with it). Share pages set it on their body too.
- Extensions: Callout, WikiLink, WikiLinkSuggestions, Embed, MathInline, MathBlock,
  FootnoteReference, FootnoteDefinition, Directive, ColumnList, Column, RawBlock, RawInline,
  OrderedList, Image, Link,
  CodeBlock (lowlight `common` grammars loaded in their own chunk, `grammarsReady`; blocks are
  highlighted again when they arrive; only transactions that touch a code block re-highlight),
  IndentHandler, KeyboardShortcuts, NotionShortcuts, EscapeSelectsBlock, SlashCommands,
  DragFeedback (`drag-feedback.ts`, in place of StarterKit's dropcursor: the drop line,
  `.lydie-drop-indicator` with `data-kind="block" | "inline"`, spans the block's content box,
  not its padded border box; and `setDragSource(view, range | null)` decorates the dragged blocks
  with `.lydie-drag-source`; beside a block, where a drop makes columns, the line stands upright,
  `data-kind="column"`; looks in `@lydie/ui`'s editor-content.css).
- Commands: `setCallout/toggleCallout/unsetCallout`, `insertWikiLink`, `insertEmbed`,
  `insertMathInline`, `setMathBlock`, `insertFootnoteReference`, `setDirective`, `openLinkEditor`,
  `turnIntoText`, `toggleFoldableCallout`, `toggleAllCallouts`, `duplicateBlock`,
  `moveBlock("up" | "down")`, `activateBlock` (Notion's Mod-Enter), `insertColumns(count)` (2 to
  `MAX_COLUMNS` = 5 empty columns, in place of an empty paragraph or after the caret's top-level
  block; caret in the first).
- Columns (`columns.ts`, transforms on a Transaction, see "Columns" below): `dropBeside(tr, source,
  target)`, `moveBlocks(tr, source, insert)`, `canDropBeside(doc, source, target)`; the geometry
  (`column-layout.ts`, plain numbers): `sideHit(blocks, point)`, `columnShares(widths)` (from
  `@lydie/markdown/columns`, which share pages and embeds use too), `resizeColumns(shares, index,
  dx, total)`; stacking (`column-resize.ts`): `columnsStacked(state)`, `setColumnsStacked(view,
  stacked)`, `STACK_BELOW_REM` (40).
- Table edits (`table-tools.ts`, by table position + row/column index, not by selection; what the
  table handles run): `editTable(state, target, edit)` → transaction or null, `canEditTable`, edits
  insert before/after, move before/after, duplicate, clear, delete, align (columns: every cell's
  `align`, Markdown's `:-:`). Markdown pins the header: row 0 cannot be moved, deleted, duplicated
  or have a row inserted above it, and nothing moves into it. `selectTableLine` (a row/column
  CellSelection), `tableSize`, `columnAlign`.
- Helpers: `parseWikiLink`, `wikiLinkLabel`, `calloutLabel`, `parseFold`, `directiveLabel`,
  `filterSlashItems`, `suggestionToAttrs`, `blockTypeActions`, `markActions`, `getActiveBlockType`,
  `setLinkHref` (ported from v1's formatting-actions), `defaultSlashItems`, `blockRangeOf(state)`
  (the blocks a block command acts on), `linkContent(suggestion)` (what a `[[`/`+` pick inserts),
  `pageSuggestionPluginKey`. Types: `CreateSubPage`; `WikiLinkSuggestion.create` marks the `+`
  menu's "new sub-page" entry.

React:

- `<LydieEditor>`: `content` (ProseMirror JSON; re-applied when it changes to something the editor did
  not emit), `onUpdate(json, editor)` (the document is serialised per change only when this is
  set), `onCreate(editor)`, `editable`, `autofocus`, `ydoc`/`ydocField`,
  `collab: { ydoc, awareness?, readOnly?, field?, user?, renderCaret?, renderSelection? }` (hosted
  mode: binds the Yjs document, shows other people's carets through
  `@tiptap/extension-collaboration-caret` when `awareness` is given; the editor is rebuilt when the
  binding changes),
  `placeholder`, `fullWidth`, `className` (on a flex column down to the ProseMirror root, which
  grows: give the editor a height, e.g. `grow` in a flex column, and clicks anywhere below the
  text land in it), `aria-label`, `slashItems` + `renderSlashMenu`,
  `searchDocuments` + `renderWikiLinkMenu` (draws the `[[` and `+` menus), `createSubPage`,
  `onOpenWikiLink`, `onOpenLink`, `bubbleMenu(editor)`,
  `dragHandle` (a node, or `(block: DragHandleBlock | null) => node` for the block under the
  pointer, `{ type, label? }` with `label` "H1"…"H6" for headings; the function form sets
  `data-block-labels` on the content so `editor-content.css` drops its own heading hover label;
  the handle is as tall as the block's first line; for a bulleted or numbered item it is measured
  from the list's left edge, so it sits left of the marker as in Notion; a table's is measured
  from the text column, not its full-width scroller; a drag from it shows the
  blocks as a card, `.lydie-drag-preview`, lifted from where they were (`react/drag-preview.ts`,
  replacing TipTap's bare clone), dims them in place and hides the handle until it ends, then
  forgets the block it was on, so the next hover shows it (TipTap re-targets it on the drop and only
  shows it for a different block); it never
  targets a table cell's content, the table moves as one block; blocks in a column have their own
  handles, a column none), `renderCodeLanguagePicker`,
  `renderTableHandle(props: TableHandleProps)` (Tiptap's Table Node, `react/TableControls.tsx`:
  while editable, hovering a table shows a grip on the hovered column's top edge and row's left
  edge, drawn by this slot (`@lydie/ui`'s `TableHandleMenu`; a plain fallback otherwise) with
  `{ axis, actions: TableHandleAction[], onOpenChange }`; opening it selects the line and keeps
  the controls in place; plus "+" bars along the right and bottom edges, `.lydie-table-add`, that
  add a column or row at the end and put the caret in its first cell; positioned against the
  editor's root, which is `relative`), `extensions`, `renderEmbed({ target, selected })`
  (installs a React node view for `embed`; without it embeds show as source), `filterSlashItems(items,
  query)` (replaces the default `/` filter). Renderers get `SuggestionMenuProps`
  (`items, query, selectedIndex, onSelect, onHighlight`); keys and positioning are handled here.
- Building blocks for plugin extensions (plugins reach TipTap/ProseMirror only through here):
  `Extension`, `getMarkRange`, `Plugin`, `PluginKey`, `NodeSelection`, `TextSelection`, `Decoration`,
  `DecorationSet`, `Step`, `StepMap`, `Mapping`, `Fragment`, `Slice`, `Suggestion`, `SuggestionPopup`.
- `createSuggestionStore`, `useEditorState` (re-exported from `@tiptap/react`), types `Editor`,
  `JSONContent`, `AnyExtension`.
- `@lydie/editor/styles.css`: only an `@source` so Tailwind scans the editor's components.

## Loading and open cost

- `collaboration` needs `loadCollaboration()` first (the Yjs binding is its own chunk);
  `<LydieEditor>` with a Y.Doc waits for it (an `aria-busy` placeholder), so local windows never
  load Yjs. TipTap's drag handle imports y-tiptap too: it is `lazy` (preloaded at idle).
- The view is created empty; the content goes in after `EditorContent` has installed the node views
  (a layout effect, before the host's `onCreate`), with `addToHistory: false` and `preventUpdate`:
  TipTap re-sets node views on mount and ProseMirror redraws everything when they change.
- Code blocks and callouts are plain ProseMirror node views (`codeBlockView`, `calloutView`; the
  code language picker alone is React through `ReactRenderer`): TipTap's React node views read the
  DOM selection in a ref callback on mount, a forced layout per block.
- Math (`react/node-views/math-view.ts`, also plain node views) is typeset with KaTeX, which is
  large: `react/node-views/katex.ts` (KaTeX and its stylesheet) is imported only by `loadKatex()`,
  the first time a document shows math, so it lands in its own chunk. Until then the source
  stands in. The source shows while the caret is in the node: the math plugin (`math.ts`, headless)
  marks that node `data-editing` with a decoration, and `editor-content.css` swaps the two (a block
  keeps the typeset form under its source as a live preview). A click on the typeset form puts the
  caret at the end of the source; arrow keys that reach a math node from outside go into its
  source, since the browser would skip hidden text. `renderToString`, not `render`: the latter
  refuses quirks-mode documents (happy-dom's).
- Task items (`extensions/task-item.ts`) keep TipTap's node view and add @lydie/ui's
  CheckboxMark as plain DOM (`[data-checkbox-mark]`, the same SVG and `checkbox-checkmark`
  classes) after its input; the input lies on the mark, invisible, and `editor-content.css`
  draws the mark from `:checked`.

## Input rules and shortcuts

TipTap defaults as in v1 (`#`, `-`, `1.`, `[ ]`, `>`, ` ``` `, `---`, `**`, `*`, `~~`, `` ` ``,
`==`), plus: `[!kind]± ` (also inside `> `) → callout, `[[a#b|c]]` → wikiLink, `![[x]]` alone →
embed, `$x$` → mathInline (Pandoc rule: no space inside the dollars), `$$ ` → mathBlock, `[^1]` →
footnoteReference (not at block start), `[^1]: ` → footnoteDefinition, `:::name ` → directive.
Tab/Shift-Tab nest/lift list and task items or insert/remove a tab (v1 indent handler); Shift-Tab with
nothing to outdent returns false, so a host extension (or the browser) takes it. On a selected node
(Escape, a click on an image, the drag handle) Tab never types over it (LYD-378): a list or task
item indents (Shift-Tab outdents) and stays selected, an inline node gets the tab after it, any
other block is left alone (Shift-Tab passes to the host); a selected table (all its cells, as
prosemirror-tables makes it) puts the caret in its first cell. Mod-k calls
`onOpenLink` when there is a selection or a link under the caret, otherwise bubbles up; without
`onOpenLink` it always bubbles and leaves the selection alone. From a selected inline node (a
clicked wiki link, inline math), End/Home/PageUp/PageDown, Up/Down and modified arrows first
collapse to the side they head to (the far side with Shift) and then let the browser move: the
browser alone kept the node selected, so typing replaced it (`keyboard-shortcuts.ts`).

Notion's shortcuts (`notion-shortcuts.ts`, priority 110, above TipTap's own bindings):

- Block types: Mod-Alt-0 text (also lifts out of lists), 1–3 H1–H3, 4 to-do, 5 bullet list,
  6 numbered list (these replace TipTap's H4–H6; type `####` for those), 7 toggle = wrap in / unwrap
  a foldable callout (`fold: "open"`; Lydie has no toggle node), 8 code block (Mod-Alt-c too),
  9 turn the line into a page (needs `createSubPage`; the paragraph or heading becomes a paragraph
  holding a link to the new child page titled with its text). Off macOS also Notion's
  Mod-Shift-0…6; Mod-Shift-7/8/9 stay TipTap's ordered/bullet/task list (macOS reserves
  Cmd-Shift-3/4/5 for screenshots, Ctrl-Alt is AltGr on many Windows layouts).
- Mod-Enter: toggles the task the caret is in, else follows the wiki link at the caret
  (`onOpenWikiLink`), else folds/unfolds the foldable callout around it; never a hard break
  (Shift-Enter is), so it is always handled. Mod-d duplicates the block(s) below and moves into the
  copy; Mod-Shift-ArrowUp/Down move the block within its parent (a list item's first paragraph
  stands for the item); Mod-Alt-t opens all foldable callouts, or closes all when any is open;
  Mod-a selects the block's text, then (second press, empty block) the document.
- Escape (`EscapeSelectsBlock`, priority 10 so suggestion menus and the links plugin get it first)
  selects the top-level block as a NodeSelection; with one already selected it returns false.
  Typing over a selected container block appends to its end instead of replacing it.
- Typing: `" ` (and `“ `) → blockquote besides `> `; `~s~` → strike besides `~~s~~` (no space
  inside the tildes); `[] ` → to-do is TipTap's own rule.
- `+` menu (`wiki-link-suggestion.ts`, with `createSubPage`): at the block start or after a space,
  once a letter follows, only in paragraphs and headings and not in inline code. Items: "new
  sub-page" (`create: true`, calls `createSubPage(query)` and inserts the link when it resolves,
  position mapped meanwhile), then `searchDocuments` hits.

## Columns

Blocks side by side, as in Notion. `columnList` (a row) holds `column`s; a row lives at the top
level (no columns inside columns). Made with `insertColumns` (the `/` menu's "2/3/4 Columns") or by
dragging blocks with the handle beside another block:

- Where (`sideHit`): a band just inside a block's left edge, or its right edge and up to 96 px of
  margin beyond it (band 10% of the block, 24–48 px). Never left of the block, where the handle is:
  dragging down the gutter reorders. Candidates are the top-level blocks around the pointer and, for
  a row, the blocks in its columns.
- What (`dropBeside`): beside a top-level block, a new row of that block and the dragged ones;
  beside a block in a column, one more column in that row (widths reset to equal). List items are
  wrapped in a copy of their list. No target: beside the dragged blocks or around them, a row,
  a full row (`MAX_COLUMNS`), or a column's only content back where it is.
- Leaving (`moveBlocks`, ProseMirror's own drop otherwise): a column whose blocks all moved goes,
  a row down to one column becomes its blocks. A row is never dropped into a column (no line shows).
- Widths: `column.width` (percent, null = equal part of the rest) drawn as flex-grow by a
  decoration (`column-resize.ts`; renderHTML cannot see siblings). Hovering the gap between columns
  shows `.lydie-column-resize`; dragging it previews through plugin state and writes all widths
  of the row (rounded to 0.1) once on release: one undo step, one sync.
- From the keyboard: the bar is a separator (`aria-valuenow` = the left column's percent of the
  row, `aria-valuemin`/`max` from the 10% minimum, `aria-label` "Resize columns N and N+1"),
  `tabindex="-1"`, so typing never meets it. Tab on a selected row (Escape from inside it)
  focuses its first gap (a DOM keydown handler, ahead of the indent handler's Tab). Arrow keys
  move it by `COLUMN_RESIZE_STEP` (2%), Shift by `COLUMN_RESIZE_STEP_LARGE` (10%), Home/End to the
  minimum; Tab/Shift-Tab go to the next/previous gap and past the last/first back into the text;
  Escape returns to the end of the column left of the bar. The presses preview like a drag and
  are written once, when the bar loses focus: one undo step.
- Narrow (LYD-373): below `STACK_BELOW_REM` (40rem) of the editor's own width (a ResizeObserver on
  the root, so a narrow pane stacks too, not only a phone) the root gets `data-columns="stacked"`
  and editor-content.css stacks every row, as share pages do below a 40rem viewport. Stacked,
  the gaps show no resize bar and refuse keyboard focus (Tab on a selected row does nothing rather
  than fall to the indent handler), and no block offers a drop beside it (`sideTargetAt` is null),
  so a drag only reorders, also into and out of columns. Widths stay in the document.

## Tests

`bun test`; `extensions/notion-shortcuts.test.ts` (every Notion key and typing rule; presses keys
through `handleKeyDown`, since TipTap's `keyboardShortcut` command keeps only document steps, not
selection changes, and always returns true); `test/setup.ts` (preloaded via `bunfig.toml`) registers happy-dom, which is enough for
ProseMirror and React here. `schema.test.ts` (proves headless by importing the schema in a separate
`bun -e` process without the DOM preload), `extensions/extensions.test.ts` (input rules and
commands, typed through the input-rule plugin), `extensions/indent-handler.test.ts` (Tab and
Shift-Tab on a selected block of every kind never remove it), `react/LydieEditor.test.tsx` (mount, update,
controlled content, editable, Yjs, the drag handle after a drop), `extensions/columns.test.ts` (insert, drop beside, move out,
refusals, undo, HTML round trip, and `handleDrop` with stubbed block boxes since happy-dom has no
layout), `extensions/column-layout.test.ts` (zones and widths), `extensions/column-resize.test.ts`
(the resize bar from the keyboard, with real keydown events on an editor mounted in the document;
stacking in a narrow editor). Note: TipTap 3 runs input-rule handlers after the typed character
is in the document; derive positions from `range`, not from "text not yet inserted".

## Diagrams (`src/diagram.ts`)

`mountDiagram(element, source)` draws Mermaid text into an element with Pele (`pele`, MIT, no
dependencies; the renderer Obsidian uses) and resolves `{ ok }` or `{ ok: false, message }`.
`isDiagramLanguage(language)` says whether a code block is a diagram (`mermaid`, `mmd`). Pele is
imported only inside `mountDiagram` (`pele/lazy`), so documents without diagrams never fetch it.
The mermaid plugin does the rest.
