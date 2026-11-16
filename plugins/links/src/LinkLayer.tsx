// One per editor: renders the link cards from the extension's store (the preview on hover, the
// menu on click, the link editor), follows links, and feeds the unresolved-link decoration.
import {
  DOC_CARD_CLASS,
  docPath,
  linkStyleOf,
  PAGE_ICON_KEY,
  pageIconOf,
  prefetchDoc,
  PREVIEW_CLOSE_DELAY,
  PREVIEW_OPEN_DELAY,
  useApp,
  useBackend,
  useQuery,
} from "@lydie/plugin-api";
import type { EditorOverlayProps, OpenOptions } from "@lydie/plugin-api";
import type { Editor } from "@lydie/plugin-api/editor";
import {
  Button,
  Edit2Regular,
  FloatingCard,
  LinkRegular,
  Tooltip,
  TooltipTrigger,
  UnlinkRegular,
} from "@lydie/plugin-api/ui";
import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";

import {
  applyLink,
  canConvert,
  convert,
  copyTextOf,
  currentHit,
  labelOf,
  targetTextOf,
  unlink,
} from "./actions.ts";
import { anchorFor, hitAt, linkStoreOf } from "./extension.ts";
import type { LinkHit, LinkStore, LinkUiState } from "./extension.ts";
import {
  DocPreview,
  ExternalPreview,
  IconAction,
  OpenButtons,
  UnresolvedPreview,
  useResolved,
} from "./LinkCard.tsx";
import { LinkEditor } from "./LinkEditor.tsx";
import { createNoteFor, follow, openExternal } from "./open.ts";
import type { FollowTarget } from "./open.ts";
import { headingMatches, hrefToTarget, isExternalHref, linkKey } from "./targets.ts";

const CLOSED: LinkUiState = { mode: "closed" };

export function followTargetOf(hit: LinkHit): FollowTarget {
  if (hit.kind === "wiki") return hit.attrs;
  if (isExternalHref(hit.href)) return { target: hit.href, heading: null, blockId: null };
  return hrefToTarget(hit.href);
}

// Scrolls an editor to a heading or a `^block` of its own document.
export function scrollToPart(
  editor: Editor,
  part: { heading: string | null; blockId: string | null },
): boolean {
  const children = [...editor.view.dom.children] as HTMLElement[];
  let el: HTMLElement | undefined;
  if (part.blockId) {
    const suffix = `^${part.blockId}`;
    const index = children.findIndex((c) => c.textContent?.trim().endsWith(suffix));
    el = children[index];
    // A lone `^id` line names the block before it.
    if (el && el.textContent?.trim() === suffix && index > 0) el = children[index - 1];
  } else if (part.heading) {
    el = children.find(
      (c) => /^H[1-6]$/.test(c.tagName) && headingMatches(c.textContent ?? "", part.heading!),
    );
  }
  if (!el) return false;
  el.scrollIntoView({ block: "start", behavior: "smooth" });
  el.setAttribute("data-flash", "true");
  setTimeout(() => el?.removeAttribute("data-flash"), 1200);
  return true;
}

function useLinkState(store: LinkStore) {
  return useSyncExternalStore(store.subscribe, store.get, () => CLOSED);
}

export function LinkLayer(props: EditorOverlayProps) {
  return (
    <>
      <LinkIcons {...props} />
      <LinkPopovers {...props} />
    </>
  );
}

// Page icons of the documents this one links to, drawn on its wiki links (LYD-253). The local
// backend's `doc.links` carries each target's icon (`target.icon`): one query for all of them.
function LinkIcons({ editor, docId }: EditorOverlayProps) {
  const store = linkStoreOf(editor);
  const links = useQuery("doc.links", { id: docId });
  useEffect(() => {
    const icons = new Map<string, string>();
    for (const { target, sourceProperty, syntax, targetRef } of links.data) {
      if (!target || sourceProperty != null || syntax !== "wikilink") continue;
      const icon = "icon" in target ? pageIconOf({ [PAGE_ICON_KEY]: target.icon }) : null;
      if (icon) icons.set(linkKey(targetRef), icon);
    }
    store.setIcons(icons);
  }, [links.data, store]);
  return null;
}

// The store is the extension's, shared with the editor: set its handlers outside render.
function setHandlers(store: LinkStore, handlers: LinkStore["handlers"]) {
  store.handlers = handlers;
}

function LinkPopovers({ editor, docId }: EditorOverlayProps) {
  const app = useApp();
  const store = linkStoreOf(editor);
  const state = useLinkState(store);
  const hover = useLinkHover(editor, store);

  // Unresolved targets of this document, for the decoration: its own links, live (creating or
  // renaming a target resolves them), not the workspace's unresolved list.
  const links = useQuery("doc.links", { id: docId });
  useEffect(() => {
    const keys = new Set<string>();
    for (const link of links.data) {
      if (link.target === null && link.sourceProperty == null) keys.add(linkKey(link.targetRef));
    }
    store.setUnresolved(keys);
  }, [links.data, store]);

  const followHit = useCallback(
    (hit: LinkHit, mode: OpenOptions["mode"]) => {
      void follow(app, followTargetOf(hit), docId, mode, (part) =>
        scrollToPart(editor, part),
      ).catch((error: unknown) =>
        app.notify({ title: "Could not open link", description: String(error), kind: "error" }),
      );
    },
    [app, docId, editor],
  );

  useEffect(() => {
    setHandlers(store, {
      follow: (hit, gesture) => followHit(hit, app.modeFor(gesture, "edit")),
    });
    return () => setHandlers(store, null);
  }, [store, app, followHit]);

  const close = (refocus: boolean) => {
    store.set(CLOSED);
    if (refocus && !editor.isDestroyed) editor.view.focus();
  };

  if (state.mode === "closed" || editor.isDestroyed) return null;

  if (state.mode === "edit") {
    const hit = state.hit;
    const anchor = () => {
      if (hit) {
        const el = anchorFor(editor, hit);
        if (el?.isConnected) return el.getBoundingClientRect();
      }
      try {
        const a = editor.view.coordsAtPos(state.from);
        const b = editor.view.coordsAtPos(state.to);
        return new DOMRect(a.left, a.top, Math.max(1, b.right - a.left), b.bottom - a.top);
      } catch {
        return null;
      }
    };
    return (
      <FloatingCard anchor={anchor} data-testid="link-editor" data-link-card="">
        <LinkEditor
          editor={editor}
          docId={docId}
          isNew={!hit}
          initialText={
            hit ? (hit.kind === "wiki" ? (hit.attrs.alias ?? "") : hit.text) : state.text
          }
          initialTarget={hit ? targetTextOf(hit) : ""}
          onCancel={() => close(true)}
          onApply={(value) => {
            applyLink(
              editor,
              { hit, from: state.from, to: state.to },
              value,
              linkStyleOf(app)?.format ?? "wiki",
            );
            close(true);
          }}
        />
      </FloatingCard>
    );
  }

  const key = state.hit.kind === "wiki" ? `w${state.hit.pos}` : `h${state.hit.from}`;
  if (state.mode === "hover")
    return <HoverPreview key={key} editor={editor} docId={docId} state={state} hover={hover} />;
  return (
    <LinkMenu
      key={key}
      editor={editor}
      docId={docId}
      state={state}
      store={store}
      onFollow={followHit}
      onClose={close}
    />
  );
}

type Hover = { keep: () => void; leave: () => void };

// Resting the pointer on a link shows its preview; it stays while the pointer is on the link or
// the card, and swaps at once to another link. A press closes it (the click opens the menu), and
// it never opens over the menu or the link editor.
function useLinkHover(editor: Editor, store: LinkStore): Hover {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<HTMLElement | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
  }, []);
  const leave = useCallback(() => {
    clear();
    timer.current = setTimeout(() => {
      if (store.get().mode === "hover") store.set(CLOSED);
    }, PREVIEW_CLOSE_DELAY);
  }, [clear, store]);

  useEffect(() => {
    const dom = editor.view.dom;
    const show = (el: HTMLElement) => {
      const found = el.isConnected && !editor.isDestroyed ? hitAt(editor.view, el) : null;
      if (found) store.set({ mode: "hover", hit: found.hit, anchor: found.el });
    };
    const onOver = (event: PointerEvent) => {
      if (event.pointerType === "touch" || event.buttons !== 0) return;
      const found = hitAt(editor.view, event.target as Element);
      if (!found) return;
      const state = store.get();
      if (state.mode === "menu" || state.mode === "edit") return;
      if (state.mode === "hover") {
        clear();
        if (state.anchor !== found.el) show(found.el);
        return;
      }
      // Moving between the link's own children does not restart the rest.
      if (pending.current === found.el) return;
      clear();
      pending.current = found.el;
      timer.current = setTimeout(() => {
        pending.current = null;
        if (store.get().mode === "closed") show(found.el);
      }, PREVIEW_OPEN_DELAY);
    };
    const onOut = (event: PointerEvent) => {
      const link = (event.target as Element | null)?.closest?.("a");
      if (!link || link.contains(event.relatedTarget as Node | null)) return;
      if (store.get().mode === "hover") leave();
      else clear();
    };
    const onDown = () => {
      clear();
      if (store.get().mode === "hover") store.set(CLOSED);
    };
    // Keys close it too (Mod+K's palette must not get a card on top), but not a bare modifier,
    // which may be the start of a Mod-click.
    const onKey = (event: KeyboardEvent) => {
      if (!["Meta", "Control", "Shift", "Alt"].includes(event.key)) onDown();
    };
    dom.addEventListener("pointerover", onOver);
    dom.addEventListener("pointerout", onOut);
    dom.addEventListener("pointerdown", onDown, true);
    dom.addEventListener("keydown", onKey, true);
    return () => {
      dom.removeEventListener("pointerover", onOver);
      dom.removeEventListener("pointerout", onOut);
      dom.removeEventListener("pointerdown", onDown, true);
      dom.removeEventListener("keydown", onKey, true);
      clear();
    };
  }, [editor, store, clear, leave]);

  return { keep: clear, leave };
}

// The target as the tree's hover card shows it; read only, the actions are in the click menu.
function HoverPreview({
  editor,
  docId,
  state,
  hover,
}: {
  editor: Editor;
  docId: string;
  state: Extract<LinkUiState, { mode: "hover" }>;
  hover: Hover;
}) {
  const { hit } = state;
  const link = followTargetOf(hit);
  const external = hit.kind === "href" && isExternalHref(hit.href);
  const resolved = useResolved(external ? null : link.target, docId);
  const backend = useBackend();
  const targetId = resolved.state === "found" ? resolved.id : null;
  // The card shows where the link goes; a click often follows.
  useEffect(() => {
    if (targetId) void prefetchDoc(backend, targetId);
  }, [backend, targetId]);
  const anchor = useCallback(() => {
    const el = state.anchor.isConnected ? state.anchor : anchorFor(editor, hit);
    return el ? el.getBoundingClientRect() : null;
  }, [state.anchor, editor, hit]);

  return (
    <FloatingCard
      anchor={anchor}
      role="dialog"
      aria-label="Link preview"
      data-testid="link-preview"
      data-link-card=""
      className={DOC_CARD_CLASS}
      onPointerEnter={hover.keep}
      onPointerLeave={hover.leave}
    >
      {external ? (
        <ExternalPreview
          href={(hit as { href: string }).href}
          text={(hit as { text: string }).text}
        />
      ) : resolved.state === "found" ? (
        <DocPreview id={resolved.id} heading={link.heading} blockId={link.blockId} />
      ) : resolved.state === "missing" ? (
        <UnresolvedPreview target={link.target} />
      ) : (
        <div className="h-16" aria-busy="true" />
      )}
    </FloatingCard>
  );
}

function LinkMenu({
  editor,
  docId,
  state,
  store,
  onFollow,
  onClose,
}: {
  editor: Editor;
  docId: string;
  state: Extract<LinkUiState, { mode: "menu" }>;
  store: LinkStore;
  onFollow: (hit: LinkHit, mode: OpenOptions["mode"]) => void;
  onClose: (refocus: boolean) => void;
}) {
  const app = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const { hit } = state;
  const link = followTargetOf(hit);
  const external = hit.kind === "href" && isExternalHref(hit.href);
  // A person mention: nothing to open.
  const person = hit.kind === "href" && hit.href.startsWith("lydie:");
  const resolved = useResolved(external ? null : link.target, docId);
  const editable = editor.isEditable;

  const anchor = useCallback(() => {
    const el = state.anchor?.isConnected ? state.anchor : anchorFor(editor, hit);
    return el ? el.getBoundingClientRect() : null;
  }, [state.anchor, editor, hit]);

  // Opened from the keyboard: move focus into the card (Escape returns it to the editor).
  useLayoutEffect(() => {
    if (state.focus) ref.current?.querySelector<HTMLElement>("a, button")?.focus();
  }, [state.focus]);

  // A press outside the editor closes it; inside the editor the selection decides.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || ref.current?.contains(target) || editor.view.dom.contains(target)) return;
      onClose(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [editor, onClose]);

  const run = (fn: () => void) => () => {
    const live = currentHit(editor, hit);
    onClose(true);
    if (live) fn();
  };

  return (
    <FloatingCard
      ref={ref}
      anchor={anchor}
      role="toolbar"
      aria-label="Link actions"
      data-testid="link-menu"
      data-link-card=""
      className="w-auto flex-row items-center gap-0.5 rounded-xl p-1"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose(true);
        }
      }}
    >
      {person ? null : external ? (
        <Button
          size="sm"
          variant="ghost"
          onPress={() => openExternal((hit as { href: string }).href)}
        >
          Open in browser
        </Button>
      ) : resolved.state === "missing" ? (
        <Button
          size="sm"
          variant="ghost"
          onPress={() => {
            onClose(false);
            void createNoteFor(app, link.target, docId).then((id) =>
              app.openDoc(id, { mode: "replace", state: { focusTitle: false } }),
            );
          }}
        >
          Create note
        </Button>
      ) : (
        <OpenButtons
          path={
            resolved.state === "found"
              ? docPath(resolved.id, {
                  heading: link.heading ?? undefined,
                  blockId: link.blockId ?? undefined,
                })
              : null
          }
          onOpen={(mode) => {
            onClose(false);
            onFollow(hit, mode);
          }}
        />
      )}
      {!person && <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-gray-950/10" />}
      {editable && (
        <IconAction
          label="Edit link"
          onPress={() => {
            const live = currentHit(editor, hit);
            if (!live) return onClose(true);
            const range = live.kind === "wiki" ? { from: live.pos, to: live.pos + 1 } : live;
            store.set({
              mode: "edit",
              hit: live,
              from: range.from,
              to: range.to,
              text: labelOf(live),
            });
          }}
        >
          <Edit2Regular aria-hidden className="size-3.5" />
        </IconAction>
      )}
      <IconAction
        label="Copy link"
        onPress={() => {
          void navigator.clipboard?.writeText(copyTextOf(hit)).catch(() => {});
          app.notify({ title: "Link copied" });
          onClose(true);
        }}
      >
        <LinkRegular aria-hidden className="size-3.5" />
      </IconAction>
      {editable && canConvert(hit) && (
        // The brackets are a glyph, not a label: it gets a tooltip like the icon buttons.
        <TooltipTrigger>
          <Button
            size="sm"
            variant="ghost"
            aria-label={hit.kind === "wiki" ? "Convert to Markdown link" : "Convert to wiki link"}
            onPress={run(() => convert(editor, hit))}
          >
            {hit.kind === "wiki" ? "[ ]( )" : "[[ ]]"}
          </Button>
          <Tooltip placement="top" offset={8}>
            {hit.kind === "wiki" ? "Convert to Markdown link" : "Convert to wiki link"}
          </Tooltip>
        </TooltipTrigger>
      )}
      {editable && (
        <IconAction label="Remove link" onPress={run(() => unlink(editor, hit))}>
          <UnlinkRegular aria-hidden className="size-3.5" />
        </IconAction>
      )}
    </FloatingCard>
  );
}
