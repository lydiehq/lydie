import { fillPageIcon } from "@lydie/plugin-api";
import type { OpenGesture } from "@lydie/plugin-api";
// Link behaviour inside the editor: the link menu on the selection, modifier clicks, Mod+K, Escape,
// and the unresolved-link decoration. The hover preview is the overlay's (LinkLayer). State lives in a small per-editor store the overlay (LinkLayer)
// renders from; the extension itself never reads data.
import {
  changedTextblocks,
  Decoration,
  DecorationSet,
  Extension,
  getMarkRange,
  NodeSelection,
  Plugin,
  PluginKey,
} from "@lydie/plugin-api/editor";
import type {
  Editor,
  EditorView,
  ProseMirrorNode,
  Transaction,
} from "@lydie/plugin-api/editor";

import { hrefToTarget, isExternalHref, linkKey } from "./targets.ts";
import type { WikiTarget } from "./targets.ts";

// A link in the document: a wikiLink node at `pos`, or a link mark over `from..to`.
export type LinkHit =
  | { kind: "wiki"; pos: number; attrs: WikiTarget }
  | { kind: "href"; from: number; to: number; href: string; text: string };

export type LinkUiState =
  | { mode: "closed" }
  // The target's card, while the pointer rests on the link (read only, no actions).
  | { mode: "hover"; hit: LinkHit; anchor: HTMLElement }
  // The link's actions, while the selection is in it.
  | { mode: "menu"; hit: LinkHit; anchor: HTMLElement | null; focus: boolean }
  // Edit `hit`, or create a link over `from..to` (the selected text).
  | { mode: "edit"; hit: LinkHit | null; from: number; to: number; text: string };

export type LinkHandlers = {
  follow: (hit: LinkHit, gesture: OpenGesture) => void;
};

export type LinkStore = {
  get: () => LinkUiState;
  set: (state: LinkUiState) => void;
  subscribe: (listener: () => void) => () => void;
  // Unresolved targets (link keys) of this document.
  unresolved: Set<string>;
  setUnresolved: (keys: Set<string>) => void;
  // Page icons of resolved targets (link key → icon), drawn before wiki links.
  icons: ReadonlyMap<string, string>;
  setIcons: (icons: ReadonlyMap<string, string>) => void;
  handlers: LinkHandlers | null;
};

export function createLinkStore(onUnresolved: () => void): LinkStore {
  let state: LinkUiState = { mode: "closed" };
  const listeners = new Set<() => void>();
  const store: LinkStore = {
    get: () => state,
    set(next) {
      state = next;
      for (const l of [...listeners]) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    unresolved: new Set(),
    setUnresolved(keys) {
      const same =
        keys.size === store.unresolved.size && [...keys].every((k) => store.unresolved.has(k));
      if (same) return;
      store.unresolved = keys;
      onUnresolved();
    },
    icons: new Map(),
    setIcons(icons) {
      const same =
        icons.size === store.icons.size && [...icons].every(([k, v]) => store.icons.get(k) === v);
      if (same) return;
      store.icons = icons;
      onUnresolved();
    },
    handlers: null,
  };
  return store;
}

export const linksPluginKey = new PluginKey<DecorationSet>("lydieLinks");

// Made on first use: TipTap's `create` event fires after React has mounted the overlays.
export function linkStoreOf(editor: Editor): LinkStore {
  const storage = (editor.storage as unknown as Record<string, { store: LinkStore | null }>)
    .lydieLinks!;
  storage.store ??= createLinkStore(() => {
    if (!editor.isDestroyed)
      editor.view.dispatch(editor.state.tr.setMeta(linksPluginKey, "unresolved"));
  });
  return storage.store;
}

// The link at a DOM element inside the editor, if it is one.
export function hitAt(
  view: EditorView,
  el: Element | null,
): { hit: LinkHit; el: HTMLElement } | null {
  const link = el?.closest?.("a[data-type='wiki-link'], a[href]") as HTMLElement | null;
  if (!link || !view.dom.contains(link)) return null;
  if (link.dataset.type === "wiki-link") {
    let pos: number;
    try {
      pos = view.posAtDOM(link, 0);
    } catch {
      return null;
    }
    for (const p of [pos, pos - 1]) {
      const node = p >= 0 ? view.state.doc.nodeAt(p) : null;
      if (node?.type.name === "wikiLink") {
        return { hit: { kind: "wiki", pos: p, attrs: node.attrs as WikiTarget }, el: link };
      }
    }
    return null;
  }
  return hrefHitAt(view, view.posAtDOM(link, 0), link);
}

function hrefHitAt(view: EditorView, pos: number, el: HTMLElement) {
  const type = view.state.schema.marks.link;
  if (!type) return null;
  const $pos = view.state.doc.resolve(Math.min(pos, view.state.doc.content.size));
  const range =
    getMarkRange($pos, type) ??
    (pos > 0 ? getMarkRange(view.state.doc.resolve(pos + 1), type) : undefined);
  if (!range) return null;
  const mark = view.state.doc
    .resolve(range.from + 1 > range.to ? range.from : range.from + 1)
    .marks()
    .find((m) => m.type === type);
  const href = String(mark?.attrs.href ?? el.getAttribute("href") ?? "");
  return {
    hit: {
      kind: "href" as const,
      from: range.from,
      to: range.to,
      href,
      text: view.state.doc.textBetween(range.from, range.to),
    },
    el,
  };
}

// The link the selection is in: a selected (clicked) wiki link, a caret inside a link's text, or
// a selection within it. A caret at a link's edge does not count, so typing beside one is quiet.
export function hitAtSelection(editor: Editor): LinkHit | null {
  const { state } = editor;
  const sel = state.selection;
  if (sel instanceof NodeSelection && sel.node.type.name === "wikiLink") {
    return { kind: "wiki", pos: sel.from, attrs: sel.node.attrs as WikiTarget };
  }
  const type = state.schema.marks.link;
  if (!type) return null;
  const range = getMarkRange(sel.$from, type);
  if (!range) return null;
  if (
    sel.empty
      ? sel.from <= range.from || sel.from >= range.to
      : sel.from < range.from || sel.to > range.to
  )
    return null;
  const mark =
    sel.$from.marks().find((m) => m.type === type) ??
    state.doc
      .resolve(range.from + 1)
      .marks()
      .find((m) => m.type === type);
  return {
    kind: "href",
    from: range.from,
    to: range.to,
    href: String(mark?.attrs.href ?? ""),
    text: state.doc.textBetween(range.from, range.to),
  };
}

function sameHit(a: LinkHit, b: LinkHit) {
  return a.kind === "wiki"
    ? b.kind === "wiki" && a.pos === b.pos
    : b.kind === "href" && a.from === b.from && a.to === b.to;
}

// Shows the menu of the link the selection is in, or closes it. A hover preview stays until the
// pointer leaves.
function menuForSelection(editor: Editor, store: LinkStore) {
  const state = store.get();
  if (state.mode === "edit") return;
  const hit = hitAtSelection(editor);
  if (!hit) {
    if (state.mode === "menu") store.set({ mode: "closed" });
    return;
  }
  if (state.mode === "menu" && sameHit(state.hit, hit)) return;
  store.set({ mode: "menu", hit, anchor: anchorFor(editor, hit), focus: false });
}

function isModClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey;
}

function iconWidget(icon: string) {
  return () => {
    const span = document.createElement("span");
    span.className = "lydie-link-icon";
    span.style.marginRight = "0.15em";
    span.dataset.pageIcon = icon;
    span.setAttribute("aria-hidden", "true");
    fillPageIcon(span, icon);
    return span;
  };
}

type LinkTargets = { unresolved: ReadonlySet<string>; icons: ReadonlyMap<string, string> };

// The decorations of one textblock's links (wiki links and link marks are always inline).
function decorateTextblock(
  block: ProseMirrorNode,
  blockPos: number,
  { unresolved, icons }: LinkTargets,
  decorations: Decoration[],
) {
  block.descendants((node, offset) => {
    const pos = blockPos + 1 + offset;
    if (node.type.name === "wikiLink") {
      const target = String(node.attrs.target ?? "");
      const icon = target ? icons.get(linkKey(target)) : undefined;
      if (icon) {
        decorations.push(
          Decoration.widget(pos, iconWidget(icon), {
            side: -1,
            key: `icon:${icon}`,
            ignoreSelection: true,
          }),
        );
      }
      if (target && unresolved.has(linkKey(target))) {
        decorations.push(
          Decoration.node(pos, pos + node.nodeSize, {
            "data-unresolved": "true",
            title: "Not created yet",
          }),
        );
      }
      return false;
    }
    if (node.isText) {
      const mark = node.marks.find((m) => m.type.name === "link");
      const href = mark ? String(mark.attrs.href ?? "") : "";
      if (href && !isExternalHref(href) && unresolved.has(linkKey(hrefToTarget(href).target))) {
        decorations.push(
          Decoration.inline(pos, pos + node.nodeSize, { "data-unresolved": "true" }),
        );
      }
    }
    return true;
  });
}

export function linkDecorations(doc: ProseMirrorNode, targets: LinkTargets): DecorationSet {
  if (targets.unresolved.size === 0 && targets.icons.size === 0) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.isTextblock) decorateTextblock(node, pos, targets, decorations);
    return !node.isTextblock;
  });
  return DecorationSet.create(doc, decorations);
}

// An edit only redraws the textblocks it touched; the rest of the set is mapped.
export function updateLinkDecorations(
  tr: Transaction,
  old: DecorationSet,
  targets: LinkTargets,
): DecorationSet {
  if (targets.unresolved.size === 0 && targets.icons.size === 0) return DecorationSet.empty;
  let set = old.map(tr.mapping, tr.doc);
  const removed: Decoration[] = [];
  const added: Decoration[] = [];
  for (const { node, pos } of changedTextblocks(tr)) {
    removed.push(...set.find(pos + 1, pos + node.nodeSize - 1));
    decorateTextblock(node, pos, targets, added);
  }
  if (removed.length) set = set.remove(removed);
  return added.length ? set.add(tr.doc, added) : set;
}

export const LinkInteractions = Extension.create({
  name: "lydieLinks",
  // Before the editor's own Mod-k (which only opens a link editor) and wiki-link click handler.
  priority: 1000,

  addStorage() {
    return { store: null as LinkStore | null };
  },

  // The menu follows the selection: clicking a link or selecting its text opens it, moving out
  // closes it. Typing closes it (and a hover preview) and never reopens it, so it never steals keys.
  onTransaction({ transaction }) {
    const store = (this.storage as { store: LinkStore | null }).store;
    if (!store) return;
    const state = store.get();
    if (state.mode === "edit") return;
    if (transaction.docChanged) {
      if (state.mode !== "closed") store.set({ mode: "closed" });
      return;
    }
    if (transaction.selectionSet) menuForSelection(this.editor, store);
  },

  addKeyboardShortcuts() {
    const store = () => linkStoreOf(this.editor);
    return {
      "Mod-k": () => {
        const editor = this.editor;
        // Read a selection the browser just extended (Shift+Arrow) before ProseMirror's
        // selectionchange handler has run.
        (editor.view as unknown as { domObserver?: { flush(): void } }).domObserver?.flush();
        const { from, to, empty } = editor.state.selection;
        // A bare caret (in a link or not) leaves Mod-k to the command palette; close the menu or
        // preview so it does not sit over the palette.
        if (empty) {
          if (store().get().mode !== "closed") store().set({ mode: "closed" });
          return false;
        }
        const hit = hitAtSelection(editor);
        if (hit) {
          const anchor = anchorFor(editor, hit);
          store().set({ mode: "menu", hit, anchor, focus: true });
          return true;
        }
        if (editor.isEditable) {
          store().set({
            mode: "edit",
            hit: null,
            from,
            to,
            text: editor.state.doc.textBetween(from, to, " "),
          });
          return true;
        }
        return false;
      },
      Escape: () => {
        if (store().get().mode === "closed") return false;
        store().set({ mode: "closed" });
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const store = () => linkStoreOf(editor);
    const follow = (hit: LinkHit, event: MouseEvent) => {
      store().set({ mode: "closed" });
      store().handlers?.follow(hit, {
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        button: event.button,
      });
    };
    return [
      new Plugin({
        key: linksPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, old, _oldState, newState) => {
            if (tr.getMeta(linksPluginKey)) return linkDecorations(newState.doc, store());
            return tr.docChanged ? updateLinkDecorations(tr, old, store()) : old;
          },
        },
        props: {
          decorations: (state) => linksPluginKey.getState(state),
          handleDOMEvents: {
            // Mod-click follows on press, so the caret never moves into the link first.
            mousedown: (view, event) => {
              const found = hitAt(view, event.target as Element);
              if (!found) return false;
              if (event.button === 1) {
                event.preventDefault();
                return true;
              }
              if (event.button !== 0 || !isModClick(event)) return false;
              event.preventDefault();
              follow(found.hit, event);
              return true;
            },
            // The browser's own handling of `<a href>` (Mod-click opens a browser tab).
            click: (view, event) => {
              if (!hitAt(view, event.target as Element)) return false;
              if (isModClick(event) || !view.editable) event.preventDefault();
              // Clicking a link that is already selected sets no new selection; reopen it here.
              else menuForSelection(editor, store());
              return false;
            },
            auxclick: (view, event) => {
              if (event.button !== 1) return false;
              const found = hitAt(view, event.target as Element);
              if (!found) return false;
              event.preventDefault();
              follow(found.hit, event);
              return true;
            },
          },
          // Read-only editors follow on a plain click.
          handleClickOn: (view, _pos, node, nodePos, event) => {
            if (node.type.name !== "wikiLink" || view.editable) return false;
            follow({ kind: "wiki", pos: nodePos, attrs: node.attrs as WikiTarget }, event);
            return true;
          },
          handleClick: (view, _pos, event) => {
            if (view.editable) return false;
            const found = hitAt(view, event.target as Element);
            if (!found || found.hit.kind !== "href") return false;
            follow(found.hit, event);
            return true;
          },
        },
      }),
    ];
  },
});

export function anchorFor(editor: Editor, hit: LinkHit): HTMLElement | null {
  const pos = hit.kind === "wiki" ? hit.pos : hit.from;
  try {
    const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
    if (dom?.nodeType === 1) return dom.matches("a") ? dom : (dom.querySelector("a") ?? dom);
    const { node } = editor.view.domAtPos(pos + 1);
    const el = (node.nodeType === 1 ? node : node.parentElement) as HTMLElement | null;
    return (el?.closest("a") as HTMLElement | null) ?? el;
  } catch {
    return null;
  }
}
