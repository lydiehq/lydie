// The headings of the active document, live from its editor (not from the last save), with the
// section in view highlighted; clicking one scrolls there. An editor overlay publishes each
// editor's headings per tab; the panel shows the focused tab's.
import { definePlugin, docIdOf } from "@lydie/plugin-api";
import type { EditorOverlayProps, TabInfo } from "@lydie/plugin-api";
import type { Editor } from "@lydie/plugin-api/editor";
import {
  EmptyState,
  focusRingInsetClass,
  ListExpansionRegular,
  NoDocumentIllustration,
  NoHeadingsIllustration,
  sidebarItemStyles,
} from "@lydie/plugin-api/ui";
import { useEffect, useSyncExternalStore } from "react";

export type OutlineHeading = { pos: number; level: number; text: string };
type Entry = { editor: Editor; headings: OutlineHeading[]; current: number };

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
// The trackers' update functions: the section in view is only worked out while the panel shows it.
const trackers = new Set<() => void>();
const emit = () => {
  for (const l of [...listeners]) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  if (listeners.size === 1) for (const update of [...trackers]) update();
  return () => listeners.delete(l);
};

export function headingsOf(editor: Editor): OutlineHeading[] {
  const out: OutlineHeading[] = [];
  editor.state.doc.forEach((node, offset) => {
    if (node.type.name === "heading") {
      out.push({
        pos: offset,
        level: Number(node.attrs.level ?? 1),
        text: node.textContent.replace(/\s\^[A-Za-z0-9-]+$/, ""),
      });
    }
  });
  return out;
}

function sameHeadings(a: OutlineHeading[], b: OutlineHeading[]) {
  return (
    a.length === b.length &&
    a.every((h, i) => h.pos === b[i]!.pos && h.text === b[i]!.text && h.level === b[i]!.level)
  );
}

// The doc view marks its scroll container; other hosts fall back to the computed style.
function scrollerOf(el: HTMLElement): HTMLElement | null {
  const marked = el.closest<HTMLElement>("[data-scroll-root]");
  if (marked) return marked;
  for (let p = el.parentElement; p; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowY;
    if (overflow === "auto" || overflow === "scroll") return p;
  }
  return null;
}

// The last heading whose top is above the upper third of the view.
function currentIndex(editor: Editor, headings: OutlineHeading[], scroller: HTMLElement | null) {
  const top = (scroller?.getBoundingClientRect().top ?? 0) + 80;
  let current = -1;
  for (let i = 0; i < headings.length; i++) {
    const dom = editor.view.nodeDOM(headings[i]!.pos) as HTMLElement | null;
    if (!dom || dom.nodeType !== 1) continue;
    if (dom.getBoundingClientRect().top <= top) current = i;
    else break;
  }
  return current === -1 && headings.length ? 0 : current;
}

function OutlineTracker({ editor, tabId }: EditorOverlayProps) {
  useEffect(() => {
    if (!tabId) return;
    const scroller = scrollerOf(editor.view.dom);
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // After the next frame is painted, when layout is clean: reading heading positions then does
    // not force a layout of the whole document in the middle of opening or typing.
    const update = () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      frame = requestAnimationFrame(() => {
        timer = setTimeout(measure, 0);
      });
    };
    const measure = () => {
      if (editor.isDestroyed) return;
      const previous = entries.get(tabId);
      const headings = headingsOf(editor);
      const next =
        previous && sameHeadings(previous.headings, headings) ? previous.headings : headings;
      const current =
        listeners.size > 0 ? currentIndex(editor, next, scroller) : (previous?.current ?? -1);
      if (
        previous &&
        previous.headings === next &&
        previous.current === current &&
        previous.editor === editor
      )
        return;
      entries.set(tabId, { editor, headings: next, current });
      emit();
    };
    update();
    trackers.add(update);
    editor.on("update", update);
    // Scrolling changes only the section in view: nothing to do while the panel is closed.
    const onScroll = () => {
      if (listeners.size > 0) update();
    };
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      trackers.delete(update);
      editor.off("update", update);
      scroller?.removeEventListener("scroll", onScroll);
      if (entries.get(tabId)?.editor === editor) {
        entries.delete(tabId);
        emit();
      }
    };
  }, [editor, tabId]);
  return null;
}

function OutlinePanel({ activeTab }: { activeTab: TabInfo | null }) {
  const tabId = activeTab && docIdOf(activeTab.path) ? activeTab.id : null;
  const entry = useSyncExternalStore(subscribe, () => (tabId ? entries.get(tabId) : undefined));
  if (!tabId)
    return (
      <EmptyState
        illustration={<NoDocumentIllustration size="sm" />}
        title="No document open"
        description="The open document's headings show here."
      />
    );
  if (!entry || entry.headings.length === 0)
    return (
      <EmptyState
        illustration={<NoHeadingsIllustration size="sm" />}
        title="No headings"
        description="Headings in the open document show here."
      />
    );
  const min = Math.min(...entry.headings.map((h) => h.level));
  return (
    <nav aria-label="Outline" className="px-2 py-2" data-testid="outline">
      <ul>
        {entry.headings.map((h, i) => (
          <li key={`${h.pos}:${i}`}>
            <button
              type="button"
              aria-current={i === entry.current ? "location" : undefined}
              onClick={() => {
                const dom = entry.editor.view.nodeDOM(h.pos) as HTMLElement | null;
                dom?.scrollIntoView({ block: "start", behavior: "smooth" });
                entry.editor.commands.setTextSelection(h.pos + 1);
              }}
              className={sidebarItemStyles({
                isCurrent: i === entry.current,
                className: `w-full pr-2 text-left aria-[current]:text-gray-900 ${focusRingInsetClass}`,
              })}
              style={{ paddingLeft: 8 + (h.level - min) * 12 }}
            >
              <span className="min-w-0 truncate">{h.text || "Untitled heading"}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export const outlinePlugin = definePlugin({
  id: "outline",
  name: "Outline",
  description: "Headings of the open document, live, with the section in view highlighted.",
  activate(ctx) {
    ctx.editor.register({ overlay: OutlineTracker });
    ctx.panels.register({ id: "outline", title: "Outline", order: 20, component: OutlinePanel });
    ctx.commands.register({
      id: "outline.show",
      title: "Show outline",
      icon: <ListExpansionRegular />,
      group: "View",
      run: ({ app }) => app.panels.show("outline"),
    });
  },
});

export default outlinePlugin;
