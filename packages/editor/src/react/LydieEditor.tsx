import type { AnyExtension, Editor, FocusPosition, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { EditorContent, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import type { Doc as YDoc } from "yjs";

import { contentLineStart } from "../content-layout";
import { collaborationLoaded, createLydieExtensions, loadCollaboration } from "../extensions";
import { filterSlashItems } from "../extensions/slash-commands";
import type { SlashCommandItem } from "../extensions/slash-commands";
import type { WikiLinkAttrs } from "../extensions/wiki-link";
import type {
  CreateSubPage,
  SearchDocuments,
  WikiLinkSuggestion,
} from "../extensions/wiki-link-suggestion";
import { LydieEditorSlotsContext } from "./context";
import type { CodeLanguagePickerProps, EmbedRenderProps, TableHandleProps } from "./context";
import { DefaultSuggestionList } from "./DefaultSuggestionList";
import { startBlockDrag } from "./drag-preview";
import { calloutView } from "./node-views/callout-view";
import { codeBlockView } from "./node-views/CodeBlockView";
import { EmbedView } from "./node-views/EmbedView";
import { mathBlockView, mathInlineView } from "./node-views/math-view";
import { RawBlockView, RawInlineView } from "./node-views/RawViews";
import { createSuggestionStore } from "./suggestion-store";
import type { SuggestionMenuProps, SuggestionStore } from "./suggestion-store";
import { SuggestionPopup } from "./SuggestionPopup";
import { TableControls } from "./TableControls";

export type LydieEditorProps = {
  // ProseMirror JSON. Read on mount and whenever it changes to something the editor did not emit
  // itself. Ignored when `ydoc` is set (the Yjs document is the content then).
  content?: JSONContent;
  onUpdate?: (content: JSONContent, editor: Editor) => void;
  // Called with the editor instance once it exists (and again if it is recreated for a new ydoc).
  onCreate?: (editor: Editor) => void;
  editable?: boolean;
  autofocus?: FocusPosition;
  // Collaborative editing: the Yjs document and the XmlFragment field to bind. Prefer `collab`.
  ydoc?: YDoc;
  ydocField?: string;
  // A collaborative binding (hosted mode): the document, the provider's awareness for other
  // people's carets, and read-only access. Without it the editor edits `content` (Markdown path).
  collab?: {
    ydoc: YDoc;
    awareness?: unknown;
    readOnly?: boolean;
    field?: string;
    user?: { name: string; color: string };
    renderCaret?: (user: Record<string, unknown>) => HTMLElement;
    renderSelection?: (user: Record<string, unknown>) => Record<string, string>;
  };
  placeholder?: string;
  fullWidth?: boolean;
  className?: string;
  "aria-label"?: string;
  // `/` menu entries. Without them the `/` menu is off.
  slashItems?: readonly SlashCommandItem[];
  renderSlashMenu?: (props: SuggestionMenuProps<SlashCommandItem>) => ReactNode;
  // Replaces the default `/` filter (prefix, then substring), e.g. to rank fuzzily or by use.
  filterSlashItems?: (items: readonly SlashCommandItem[], query: string) => SlashCommandItem[];
  // `[[` link search. Without it the `[[` popup is off (typing `[[Note]]` still makes a link).
  searchDocuments?: SearchDocuments;
  renderWikiLinkMenu?: (props: SuggestionMenuProps<WikiLinkSuggestion>) => ReactNode;
  onOpenWikiLink?: (attrs: WikiLinkAttrs) => void;
  // Creates a sub-page of the open document (Mod-Alt-9 and the `+` menu, which is drawn by
  // `renderWikiLinkMenu`; its first item has `create: true`). Without it both are off.
  createSubPage?: CreateSubPage;
  onOpenLink?: (editor: Editor) => void;
  // Shown over a non-empty text selection (v1's dark formatting bar).
  bubbleMenu?: (editor: Editor) => ReactNode;
  // Show it over a selection in a read-only editor too (someone who may comment, not edit). The
  // menu then has to leave out what changes the document.
  bubbleMenuWhenReadOnly?: boolean;
  // Content of the block drag handle (v1 used a dotted grip icon). A function gets the block under
  // the pointer, so the handle can show its type (a heading's "H2") in place of the hover label
  // the document styles would otherwise add next to it.
  dragHandle?: ReactNode | ((block: DragHandleBlock | null) => ReactNode);
  renderCodeLanguagePicker?: (props: CodeLanguagePickerProps) => ReactNode;
  // The grip on a hovered table's row or column and its menu (the editor positions it and
  // supplies the actions). Without it a plain fallback shows.
  renderTableHandle?: (props: TableHandleProps) => ReactNode;
  // Renders `![[embeds]]` (read when the editor is created; without it they show as source).
  renderEmbed?: (props: EmbedRenderProps) => ReactNode;
  // Extra extensions, e.g. from plugins. Read once, when the editor is created.
  extensions?: AnyExtension[];
};

// The block the drag handle is on. `label` is its short type, set for headings ("H1"…"H6").
export type DragHandleBlock = { type: string; label?: string };

const DRAG_HANDLE_NESTED = {
  edgeDetection: { threshold: -16 },
  // A cell's content is not a block of its own: the table's grips move rows and columns, and the
  // block handle stays on the table as a whole.
  rules: [
    {
      id: "notInsideTableCells",
      evaluate: ({ parent }: { parent: ProseMirrorNode | null }) =>
        parent?.type.name === "tableCell" || parent?.type.name === "tableHeader" ? 1000 : 0,
    },
    // Blocks in a column have handles of their own; a column has none (it is moved by its
    // blocks), and the row loses to the block under the pointer.
    {
      id: "columnsByTheirBlocks",
      evaluate: ({ node }: { node: ProseMirrorNode }) =>
        node.type.name === "column" ? 1000 : node.type.name === "columnList" ? 500 : 0,
    },
  ],
};
const BUBBLE_OPTIONS = { placement: "bottom" as const };

type BubbleProps = { editor: Editor; state: EditorState; from: number; to: number };

// v1's rule: show for a real text selection, not for empty or whitespace-only ranges.
function shouldShowBubble({ editor, state, from, to }: BubbleProps, whenReadOnly = false) {
  if ((!editor.isEditable && !whenReadOnly) || state.selection.empty) return false;
  // Whole cells (a table grip's row or column) have the table menu instead.
  if (state.selection instanceof NodeSelection || state.selection instanceof CellSelection) {
    return false;
  }
  return state.doc.textBetween(from, to).trim().length > 0;
}

type BuildOptions = {
  ydoc: YDoc | undefined;
  ydocField: string | undefined;
  collab: LydieEditorProps["collab"];
  placeholder: string | undefined;
  hasSlashItems: boolean;
  hasSearch: boolean;
  hasCreatePage: boolean;
  // Without it Mod-k leaves the selection alone and bubbles to the host (its command palette).
  hasOpenLink: boolean;
  hasEmbed: boolean;
  extensions: AnyExtension[] | undefined;
};

// Callbacks read the latest props through the ref when they run, never during render.
function buildExtensions(
  latest: RefObject<LydieEditorProps>,
  slashStore: SuggestionStore<SlashCommandItem>,
  wikiStore: SuggestionStore<WikiLinkSuggestion>,
  pageStore: SuggestionStore<WikiLinkSuggestion>,
  options: BuildOptions,
) {
  return createLydieExtensions({
    placeholder: options.placeholder,
    collaboration: options.collab
      ? {
          document: options.collab.ydoc,
          field: options.collab.field ?? options.ydocField,
          awareness: options.collab.awareness,
          user: options.collab.user,
          renderCaret: options.collab.renderCaret,
          renderSelection: options.collab.renderSelection,
        }
      : options.ydoc
        ? { document: options.ydoc, field: options.ydocField }
        : undefined,
    slashItems: () => latest.current.slashItems ?? [],
    slashFilter: (items, query) =>
      latest.current.filterSlashItems?.(items, query) ?? filterSlashItems(items, query),
    slashRender: options.hasSlashItems ? slashStore.render : undefined,
    searchDocuments: options.hasSearch
      ? (query) => latest.current.searchDocuments?.(query) ?? Promise.resolve([])
      : undefined,
    wikiLinkRender: wikiStore.render,
    createSubPage: options.hasCreatePage
      ? (title) => latest.current.createSubPage?.(title) ?? Promise.resolve(null)
      : undefined,
    pageRender: pageStore.render,
    onOpenWikiLink: (attrs) => latest.current.onOpenWikiLink?.(attrs),
    onOpenLink: options.hasOpenLink ? (editor) => latest.current.onOpenLink?.(editor) : undefined,
    nodeViews: {
      callout: calloutView,
      codeBlock: codeBlockView,
      mathBlock: mathBlockView,
      mathInline: mathInlineView,
      rawBlock: ReactNodeViewRenderer(RawBlockView),
      rawInline: ReactNodeViewRenderer(RawInlineView, { as: "span" }),
      ...(options.hasEmbed ? { embed: ReactNodeViewRenderer(EmbedView) } : {}),
    },
    extensions: options.extensions,
  });
}

// TipTap's drag handle imports its Yjs support (y-tiptap, yjs) whether or not the document is
// collaborative, so it loads on its own, fetched once the editor module is evaluated: it only
// appears on hover.
const loadDragHandle = () =>
  import("@tiptap/extension-drag-handle-react").then((m) => ({ default: m.DragHandle }));
const DragHandle = lazy(loadDragHandle);
if (typeof window !== "undefined") {
  const idle =
    (globalThis as { requestIdleCallback?: (fn: () => void) => void }).requestIdleCallback ??
    ((fn: () => void) => setTimeout(fn, 1000));
  idle(() => void loadDragHandle().catch(() => {}));
}

type HandleState = { block: DragHandleBlock; lineHeight: number | undefined };

function describeBlock(editor: Editor, node: ProseMirrorNode, pos: number): HandleState {
  const label = node.type.name === "heading" ? `H${String(node.attrs.level)}` : undefined;
  const dom = editor.view.nodeDOM(pos);
  const lineHeight =
    dom instanceof HTMLElement ? Number.parseFloat(getComputedStyle(dom).lineHeight) : Number.NaN;
  return {
    block: label ? { type: node.type.name, label } : { type: node.type.name },
    lineHeight: Number.isFinite(lineHeight) ? lineHeight : undefined,
  };
}

// A bulleted or numbered item's marker is drawn outside the <li>, in the list's padding. As in
// Notion the marker belongs to the block, so the handle goes left of it: measured from the list's
// left edge, a top-level item's handle shares the paragraphs' column. Task items keep their
// checkbox inside the <li> and need nothing. A table's wrapper spans the editor's whole width and
// pads the table to the text column, so its handle is measured from the padding's inner edge. A
// bare embed (a collection) is laid out the same way by the host (editor-content.css), but its
// title is text: its handle sits where a paragraph's does, a block padding (the wrapper's right
// padding) left of the text column.
function handleAnchor(dom: Element | null) {
  const table = dom?.querySelector(":scope > table");
  const embed = !table && dom?.querySelector("[data-embed-bare]");
  if (dom && (table || embed)) {
    return {
      getBoundingClientRect: () => {
        const box = dom.getBoundingClientRect();
        const style = getComputedStyle(dom);
        const inset = Number.parseFloat(style.paddingLeft);
        const left = box.left + inset - (embed ? Number.parseFloat(style.paddingRight) : 0);
        return new DOMRect(left, box.top, box.right - left, box.height);
      },
    };
  }
  const list = dom?.tagName === "LI" ? dom.parentElement : null;
  if (!dom || !list || list.dataset.type === "taskList") return null;
  return {
    getBoundingClientRect: () => {
      const item = dom.getBoundingClientRect();
      const left = list.getBoundingClientRect().left;
      return new DOMRect(left, item.top, item.right - left, item.height);
    },
  };
}

// The handle sits at the block's top-left corner; as tall as the block's first line, its content is
// centred on that line (a heading's is taller than a paragraph's).
function BlockDragHandle({
  editor,
  content,
}: {
  editor: Editor;
  content: NonNullable<LydieEditorProps["dragHandle"]>;
}) {
  const [state, setState] = useState<HandleState | null>(null);
  // Set in onNodeChange, which TipTap calls right before it positions the handle.
  const target = useRef<Element | null>(null);
  // On the document, so it runs after TipTap's listener on the handle (see startBlockDrag). The
  // handle lives beside the ProseMirror root, not inside it.
  useEffect(() => {
    const onDragStart = (event: DragEvent) => {
      if (editor.isDestroyed || !(event.target instanceof Element)) return;
      const handle = event.target.closest(".drag-handle");
      if (handle && editor.view.dom.parentElement?.contains(handle)) startBlockDrag(editor, event);
    };
    document.addEventListener("dragstart", onDragStart);
    return () => document.removeEventListener("dragstart", onDragStart);
  }, [editor]);
  return (
    <DragHandle
      editor={editor}
      nested={DRAG_HANDLE_NESTED}
      getReferencedVirtualElement={() => handleAnchor(target.current)}
      // TipTap hides the handle when a drag ends, but the drop's own transaction has already
      // re-targeted it to whatever block now sits at the dragged block's old position, and a hover
      // only shows the handle for a block other than its target: hovering that block first after a
      // drop left the handle hidden (LYD-354). Forgetting the target makes the next hover show it.
      onElementDragEnd={() => {
        if (!editor.isDestroyed)
          editor.view.dispatch(editor.state.tr.setMeta("hideDragHandle", true));
      }}
      onNodeChange={({ node, pos }) => {
        // Called on every edit while the handle shows. A null node (pointer left) keeps the last
        // block, so the handle does not change while it hides.
        if (!node) return;
        const dom = editor.view.nodeDOM(pos);
        target.current = dom instanceof Element ? dom : null;
        const next = describeBlock(editor, node, pos);
        setState((prev) =>
          prev &&
          prev.block.type === next.block.type &&
          prev.block.label === next.block.label &&
          prev.lineHeight === next.lineHeight
            ? prev
            : next,
        );
      }}
    >
      <div className="flex items-center" style={{ height: state?.lineHeight }}>
        {typeof content === "function" ? content(state?.block ?? null) : content}
      </div>
    </DragHandle>
  );
}

// A collaborative document (a Y.Doc) needs the Yjs binding, loaded on first use: until it is in,
// an empty placeholder stands in (collab documents load asynchronously anyway).
export function LydieEditor(props: LydieEditorProps) {
  const collaborative = Boolean(props.collab?.ydoc ?? props.ydoc);
  const [ready, setReady] = useState(collaborationLoaded);
  useEffect(() => {
    if (!collaborative || ready) return;
    let live = true;
    void loadCollaboration().then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [collaborative, ready]);
  if (collaborative && !ready) return <div aria-busy="true" data-editor-loading="" />;
  return <EditorWithContent {...props} />;
}

function EditorWithContent(props: LydieEditorProps) {
  const {
    content,
    autofocus = false,
    ydocField,
    fullWidth = false,
    className,
    bubbleMenu,
    bubbleMenuWhenReadOnly = false,
    dragHandle,
  } = props;

  // One function for the menu's lifetime (it is registered once); the prop may change later,
  // when the person's access is known.
  const bubbleWhenReadOnly = useRef(bubbleMenuWhenReadOnly);
  useEffect(() => {
    bubbleWhenReadOnly.current = bubbleMenuWhenReadOnly;
  }, [bubbleMenuWhenReadOnly]);
  const showBubble = useCallback(
    (bubble: BubbleProps) => shouldShowBubble(bubble, bubbleWhenReadOnly.current),
    [],
  );

  // Callbacks change on every render; the extensions read the latest ones through this ref, so the
  // editor is only rebuilt when the Yjs document changes.
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });

  const [slashStore] = useState(() => createSuggestionStore<SlashCommandItem>());
  const [wikiStore] = useState(() => createSuggestionStore<WikiLinkSuggestion>());
  const [pageStore] = useState(() => createSuggestionStore<WikiLinkSuggestion>());
  const lastContent = useRef<JSONContent | undefined>(content);

  const ydoc = props.collab?.ydoc ?? props.ydoc;
  const awareness = props.collab?.awareness;
  const editable = (props.editable ?? true) && !props.collab?.readOnly;

  // Rebuilt only when the collaborative binding changes (as the editor is).
  // The ref object is handed to callbacks that read `.current` when they run, not during render.
  // oxlint-disable-next-line react/refs
  const extensions = useMemo(
    () =>
      buildExtensions(latest, slashStore, wikiStore, pageStore, {
        ydoc,
        ydocField,
        collab: props.collab,
        placeholder: props.placeholder,
        hasSlashItems: props.slashItems !== undefined,
        hasSearch: props.searchDocuments !== undefined,
        hasCreatePage: props.createSubPage !== undefined,
        hasOpenLink: props.onOpenLink !== undefined,
        hasEmbed: props.renderEmbed !== undefined,
        extensions: props.extensions,
      }),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- rebuilt with the editor, on the binding
    [ydoc, awareness],
  );

  // The view starts empty and gets the content once TipTap has installed the node views (its
  // EditorContent sets them after mount, and ProseMirror redraws the whole document when node
  // views change): a long document is rendered once instead of twice.
  const editor = useEditor(
    {
      extensions,
      content: undefined,
      editable,
      autofocus,
      editorProps: {
        // A function so ProseMirror re-reads it on each update. `data-block-labels` tells
        // editor-content.css that the drag handle shows heading levels, so it drops its own label.
        attributes: () => ({
          class: "editor-content w-full grow pb-8 outline-none",
          "data-doc-content": "",
          ...(props["aria-label"] ? { "aria-label": props["aria-label"] } : {}),
          ...(typeof latest.current.dragHandle === "function" ? { "data-block-labels": "" } : {}),
        }),
      },
      onUpdate: ({ editor }) => {
        // Serialising a long document on every keystroke is costly; skip it when nobody listens.
        if (!latest.current.onUpdate) return;
        const json = editor.getJSON();
        lastContent.current = json;
        latest.current.onUpdate?.(json, editor);
      },
    },
    [ydoc, awareness],
  );

  // Runs after EditorContent's mount (children first) and before the host's onCreate (a passive
  // effect): not an edit, so no undo step and no update event.
  const filled = useRef<Editor | null>(null);
  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed || ydoc || filled.current === editor) return;
    filled.current = editor;
    if (content === undefined) return;
    try {
      const doc = editor.schema.nodeFromJSON(content);
      const tr = editor.state.tr
        .replaceWith(0, editor.state.doc.content.size, doc.content)
        .setMeta("addToHistory", false)
        .setMeta("preventUpdate", true);
      editor.view.dispatch(tr.setSelection(TextSelection.atStart(tr.doc)));
    } catch {
      editor.commands.setContent(content, { emitUpdate: false });
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- once per editor; later content below
  }, [editor, ydoc]);

  // From an effect rather than TipTap's onCreate, so StrictMode's discarded instance is never
  // handed out.
  useEffect(() => {
    if (editor && !editor.isDestroyed) latest.current.onCreate?.(editor);
  }, [editor]);

  useEffect(() => {
    if (!editor || ydoc || content === undefined || content === lastContent.current) return;
    lastContent.current = content;
    editor.commands.setContent(content, { emitUpdate: false });
  }, [editor, ydoc, content]);

  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable, false);
  }, [editor, editable]);

  // The `[[` and `+` menus look the same.
  const linkMenu = (menu: SuggestionMenuProps<WikiLinkSuggestion>) =>
    props.renderWikiLinkMenu ? (
      props.renderWikiLinkMenu(menu)
    ) : (
      <DefaultSuggestionList
        {...menu}
        label={(item) => item.title ?? item.target}
        description={(item) => item.description}
        emptyLabel="No matching documents"
      />
    );

  const lineStart = contentLineStart(fullWidth);
  const root = useRef<HTMLDivElement>(null);

  return (
    <LydieEditorSlotsContext.Provider
      value={{
        renderCodeLanguagePicker: props.renderCodeLanguagePicker,
        renderEmbed: props.renderEmbed,
      }}
    >
      {/* Columns down to the ProseMirror root, so it fills whatever height the host gives the
          editor and a click anywhere below the text lands in it. */}
      {/* Relative: the table controls are placed against it. */}
      <div ref={root} className={`relative flex flex-col ${className ?? ""}`} data-lydie-editor="">
        {bubbleMenu && (
          <BubbleMenu
            editor={editor}
            shouldShow={showBubble}
            options={BUBBLE_OPTIONS}
            className="z-40"
          >
            {bubbleMenu(editor)}
          </BubbleMenu>
        )}
        {dragHandle && editable && (
          <Suspense fallback={null}>
            <BlockDragHandle editor={editor} content={dragHandle} />
          </Suspense>
        )}
        <EditorContent
          editor={editor}
          // Full width is 100%, not `none`, so blocks can animate between the two widths.
          className={
            fullWidth
              ? "flex grow flex-col [--editor-block-max-width:100%] [--editor-block-padding-x:5rem] [--editor-table-min-width:auto] [--editor-text-width:none]"
              : "flex grow flex-col"
          }
          style={{ "--editor-content-line-start": lineStart } as CSSProperties}
        />
        {editable && (
          <TableControls editor={editor} container={root} renderHandle={props.renderTableHandle} />
        )}
        <SuggestionPopup editor={editor} store={slashStore}>
          {(menu) =>
            props.renderSlashMenu ? (
              props.renderSlashMenu(menu)
            ) : (
              <DefaultSuggestionList
                {...menu}
                label={(item) => item.title}
                description={(item) => item.description}
              />
            )
          }
        </SuggestionPopup>
        <SuggestionPopup editor={editor} store={wikiStore}>
          {linkMenu}
        </SuggestionPopup>
        <SuggestionPopup editor={editor} store={pageStore}>
          {linkMenu}
        </SuggestionPopup>
      </div>
    </LydieEditorSlotsContext.Provider>
  );
}
