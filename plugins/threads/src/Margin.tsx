/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- a card over a narrow page is a non-modal FloatingCard, not a <dialog>; a click anywhere on a margin card opens it, and focus inside it does the same from the keyboard */
// The comments beside the text: a card per thread, level with its passage, in a column right of
// the text column (Google Docs' margin). Comments on the page as a whole, and ones whose passage
// is gone, sit at the top. Where the page is too narrow for cards beside the text, each thread is
// a small avatar marker that opens its card over the page.
import { Portal } from "@lydie/plugin-api";
import type { Thread } from "@lydie/plugin-api";
import type { Editor } from "@lydie/plugin-api/editor";
import { FloatingCard, WithTooltip } from "@lydie/plugin-api/ui";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { threadsState } from "./extension.ts";
import { CARD_WIDTH, marginGeometry, stack } from "./margin.ts";
import type { MarginGeometry } from "./margin.ts";
import { authorOf } from "./people.ts";
import type { Range } from "./text.ts";
import { AuthorAvatar, ThreadCard, useAuthors } from "./ThreadCard.tsx";

const GAP = 8;
const MARKER_HEIGHT = 24;
// A card's first line sits about level with its passage's.
const LIFT = 10;
// The room on the page's right, set on the doc view's scroll container (`--doc-margin`).
const RESERVE_VAR = "--doc-margin";

export type MarginItem = {
  thread: Thread;
  // Its passage in the editor now; null for the page, or when the passage is gone.
  range: Range | null;
};

type Props = {
  editor: Editor;
  items: readonly MarginItem[];
  // The open card.
  active: string | null;
  // A comment being written (on the page, or on the passage the editor holds as the draft's),
  // and its field.
  draft: { onPage: boolean; key: number; content: ReactNode } | null;
  open: (id: string | null) => void;
};

// The text column's widest, from the editor's CSS: null when the page is full width.
function columnOf(editor: Editor): number | null {
  const value = getComputedStyle(editor.view.dom).getPropertyValue("--editor-block-max-width");
  if (value.trim().endsWith("%")) return null;
  return Number.parseFloat(value) || 680;
}

function rectOf(editor: Editor, range: Range): DOMRect | null {
  if (editor.isDestroyed) return null;
  const size = editor.state.doc.content.size;
  if (range.from > size || range.to > size) return null;
  const start = editor.view.coordsAtPos(range.from);
  const end = editor.view.coordsAtPos(range.to, -1);
  return new DOMRect(start.left, start.top, 1, Math.max(1, end.bottom - start.top));
}

export function Margin({ editor, items, active, draft, open }: Props) {
  const members = useAuthors();
  const root = editor.view.dom.closest<HTMLElement>("[data-lydie-editor]");
  const page = editor.view.dom.closest<HTMLElement>("[data-scroll-root]");
  const [geometry, setGeometry] = useState<MarginGeometry | null>(null);
  const layer = useRef<HTMLElement>(null);
  const boxes = useRef(new Map<string, HTMLElement>());
  const empty = items.length === 0 && !draft;

  // The page's width decides between cards and markers, and where they go.
  useEffect(() => {
    if (!page) return;
    const measure = () => {
      if (editor.isDestroyed) return;
      const next = marginGeometry(page.clientWidth, columnOf(editor));
      setGeometry((previous) =>
        previous &&
        previous.mode === next.mode &&
        previous.left === next.left &&
        previous.reserve === next.reserve
          ? previous
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(page);
    observer.observe(editor.view.dom);
    return () => observer.disconnect();
  }, [editor, page]);

  // Room for the margin, only while it has something in it.
  const reserve = !empty && geometry ? geometry.reserve : 0;
  useLayoutEffect(() => {
    if (!page) return;
    if (reserve) page.style.setProperty(RESERVE_VAR, `${reserve}px`);
    else page.style.removeProperty(RESERVE_VAR);
  }, [page, reserve]);
  useEffect(
    () => () => {
      page?.style.removeProperty(RESERVE_VAR);
    },
    [page],
  );

  const latest = useRef({ items, active, draft, mode: geometry?.mode });
  useLayoutEffect(() => {
    latest.current = { items, active, draft, mode: geometry?.mode };
  });

  // Each card level with its passage, none overlapping; the open one exactly so. Written to the
  // DOM directly: it runs on every edit and resize, and only moves boxes.
  const layout = useCallback(() => {
    const el = layer.current;
    if (!el || editor.isDestroyed) return;
    const { items, active, draft, mode } = latest.current;
    const base = el.getBoundingClientRect().top;
    // Cards may move up beside the title, not off the top of the page.
    const floor = page ? page.getBoundingClientRect().top - page.scrollTop - base + GAP : 0;
    const topOf = (range: Range | null | undefined) => {
      const rect = range && rectOf(editor, range);
      return rect ? Math.max(0, rect.top - base - (mode === "cards" ? LIFT : 0)) : 0;
    };
    // Passages as the editor has them now: React's copy can be a step behind a new draft.
    const state = threadsState(editor.state);
    const wanted = [
      ...(draft && mode === "cards"
        ? [{ id: "draft", range: draft.onPage ? null : state.draft }]
        : []),
      ...items.map((item) => ({ id: item.thread.id, range: state.ranges.get(item.thread.id) })),
    ]
      .map((entry, index) => ({ ...entry, index, top: topOf(entry.range) }))
      .sort((a, b) => a.top - b.top || a.index - b.index)
      .map((entry) => ({
        id: entry.id,
        top: entry.top,
        height: boxes.current.get(entry.id)?.offsetHeight ?? MARKER_HEIGHT,
      }));
    const focus = draft && mode === "cards" ? "draft" : active;
    for (const [id, top] of stack(wanted, focus, mode === "cards" ? GAP : 4, Math.min(0, floor))) {
      const box = boxes.current.get(id);
      if (!box) continue;
      box.style.transform = `translateY(${Math.round(top)}px)`;
      if (box.dataset.placed !== undefined) continue;
      box.style.visibility = "visible";
      // Transitions switch on only once the first position has been painted, so a new card
      // does not glide in from the top.
      box.dataset.placed = "pending";
      requestAnimationFrame(() => requestAnimationFrame(() => (box.dataset.placed = "")));
    }
  }, [editor, page]);

  useLayoutEffect(layout);

  // Again after edits (passages move), and when the text or a card changes size. Cards that come
  // later are observed as they register.
  const resized = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    };
    const observer = new ResizeObserver(schedule);
    resized.current = observer;
    observer.observe(editor.view.dom);
    for (const box of boxes.current.values()) observer.observe(box);
    editor.on("transaction", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resized.current = null;
      editor.off("transaction", schedule);
    };
  }, [editor, layout]);

  const register = (id: string) => (el: HTMLElement | null) => {
    const previous = boxes.current.get(id);
    if (previous && previous !== el) resized.current?.unobserve(previous);
    if (el) {
      boxes.current.set(id, el);
      resized.current?.observe(el);
    } else boxes.current.delete(id);
  };

  // Narrow pages: the open card and a new one float under their passage (a thread on the page
  // under its marker, a new one at the top of the text). Read as they are now, after any edits.
  const activeItem = items.find((item) => item.thread.id === active);
  const activeAnchor = useCallback(() => {
    if (!active || editor.isDestroyed) return null;
    const range = threadsState(editor.state).ranges.get(active);
    if (range) return rectOf(editor, range);
    return boxes.current.get(active)?.getBoundingClientRect() ?? null;
  }, [editor, active]);
  const draftKey = draft?.key;
  const draftAnchor = useCallback(() => {
    if (draftKey === undefined || editor.isDestroyed) return null;
    const range = threadsState(editor.state).draft;
    if (range) return rectOf(editor, range);
    const top = root?.getBoundingClientRect();
    return top ? new DOMRect(top.left + top.width / 2 - 150, top.top, 1, 1) : null;
  }, [editor, root, draftKey]);

  if (!root || !geometry || empty) return null;

  const close = () => {
    open(null);
    editor.view.focus();
  };
  const box =
    "invisible absolute top-0 left-0 w-full data-[placed='']:transition-transform data-[placed='']:duration-150 data-[placed='']:ease-out";

  if (geometry.mode === "markers") {
    return (
      <>
        <Portal container={root}>
          <aside
            ref={layer}
            aria-label="Comments"
            data-testid="threads"
            className="absolute top-0 z-10"
            style={{ left: geometry.left, width: MARKER_HEIGHT }}
          >
            {items.map(({ thread }) => {
              const author = authorOf(thread.createdBy, members);
              return (
                <div key={thread.id} ref={register(thread.id)} className={box}>
                  <WithTooltip label={`Comment by ${author.name}`} placement="left">
                    <button
                      type="button"
                      aria-label={`Comment by ${author.name}`}
                      aria-expanded={thread.id === active}
                      onClick={() => open(thread.id === active ? null : thread.id)}
                      className={`flex size-6 items-center justify-center rounded-full hover:bg-gray-950/5 aria-expanded:bg-yellow-200 ${thread.resolvedAt ? "opacity-50" : ""}`}
                    >
                      <AuthorAvatar author={author} size={18} />
                    </button>
                  </WithTooltip>
                </div>
              );
            })}
          </aside>
        </Portal>
        {activeItem && (
          <FloatingCard
            key={activeItem.thread.id}
            anchor={activeAnchor}
            role="dialog"
            aria-label="Comment"
            className="w-[300px] overflow-y-auto p-3"
            onKeyDown={(event) => {
              if (event.key === "Escape") close();
            }}
          >
            <ThreadCard
              thread={activeItem.thread}
              open
              detached={!!activeItem.thread.anchor && !activeItem.range}
              onClose={close}
            />
          </FloatingCard>
        )}
        {draft && (
          <FloatingCard
            key={draft.key}
            anchor={draftAnchor}
            role="dialog"
            aria-label="New comment"
            className="w-[300px] p-3"
          >
            {draft.content}
          </FloatingCard>
        )}
      </>
    );
  }

  return (
    <Portal container={root}>
      <aside
        ref={layer}
        aria-label="Comments"
        data-testid="threads"
        className="absolute top-0 z-10"
        style={{ left: geometry.left, width: CARD_WIDTH }}
      >
        {draft && (
          <section
            key={`draft-${draft.key}`}
            ref={register("draft")}
            aria-label="New comment"
            className={`${box} rounded-xl bg-elevated p-3 shadow-popover`}
          >
            {draft.content}
          </section>
        )}
        {items.map(({ thread, range }) => {
          const isOpen = thread.id === active;
          return (
            <div
              key={thread.id}
              ref={register(thread.id)}
              onClick={() => {
                if (!isOpen) open(thread.id);
              }}
              onFocus={() => {
                if (!isOpen) open(thread.id);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape" && isOpen) {
                  event.preventDefault();
                  close();
                }
              }}
              className={`${box} rounded-xl p-3 ${
                isOpen
                  ? "-translate-x-2 bg-elevated shadow-popover"
                  : "cursor-pointer bg-surface ring-1 ring-gray-950/8 hover:ring-gray-950/15"
              } ${thread.resolvedAt && !isOpen ? "opacity-60" : ""}`}
            >
              <ThreadCard
                thread={thread}
                open={isOpen}
                detached={!!thread.anchor && !range}
                onClose={close}
              />
            </div>
          );
        })}
      </aside>
    </Portal>
  );
}
