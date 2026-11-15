// "Open" on a page of a collection: the page slides in from the right as a panel over half of
// the tab, and the collection beside it stays in use: another "Open" there swaps the page in
// the panel. A page opened from inside the panel (a page of a collection in the open page)
// stacks on it: the panel steps back and the new one slides over it, leaving a sliver. Which
// page is open is tab state, so it comes back with the tab. Escape (in the panel or in the
// collection beside it) or the × closes it; the page can also move to the tab itself or to the side.
import {
  docPath,
  matchesPath,
  Portal,
  TabProvider,
  useApp,
  useContributions,
  useDeviceSetting,
  useQuerySelect,
  useTab,
  useTabState,
} from "@lydie/plugin-api";
import type { TabInfo } from "@lydie/plugin-api";
import {
  Button,
  CloseRegular,
  ElasticHandle,
  FullscreenRegular,
  LayoutRightRegular,
  useElasticPanel,
} from "@lydie/plugin-api/ui";
import { createContext, use, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, ReactNode, RefObject, SyntheticEvent } from "react";

const ENTER_MS = 450;
const EXIT_MS = 200;
const EASE = "cubic-bezier(0.34,0.68,0,1)";
// The panel floats inside the tab's card: this far from its top, right and bottom edges.
const INSET = 4;
// The panel's width: dragged at its edge like the sidebar's, kept per device. Narrower than MIN
// it closes; the collection keeps at least BESIDE of the tab.
// How long two pages cross-fade when another one is opened in the panel.
const SWAP_MS = 180;
// "Open as full page" grows the panel over the whole tab before the tab takes the page.
const EXPAND_MS = 300;
const EXPAND_EASE = "cubic-bezier(0.65,0,0.35,1)";
const MIN_WIDTH = 360;
const BESIDE = 240;
// As the ••• of a page's breadcrumb bar (editor-view's PageMenu).
const CONTROL = "text-gray-950/45 hover:text-gray-700";

export type Peek = {
  // The page open in the panel, or null.
  docId: string | null;
  open: (docId: string) => void;
  // Slides the panel out, as its × does.
  close: () => void;
};

const PeekContext = createContext<Peek | null>(null);
// What a panel covers when it is opened from inside another panel: that panel.
const ContainerContext = createContext<HTMLElement | null>(null);

// The panel of this collection; null where there is no host (pages then open to the side).
export function usePeek(): Peek | null {
  return use(PeekContext);
}

// `stateKey`: where the tab keeps the open page (a collection's own page). Without it, and in a
// panel (which is not a tab of the layout), the open page is only kept while mounted.
export function PageSheetHost({ stateKey, children }: { stateKey?: string; children: ReactNode }) {
  const nested = use(ContainerContext) !== null;
  const [stored, setStored] = useTabState<string | null>(`${stateKey ?? "db"}:peek`, null);
  const [local, setLocal] = useState<string | null>(null);
  const kept = stateKey !== undefined && !nested;
  const docId = kept ? stored : local;
  const setDocId = kept ? setStored : setLocal;
  // The open panel's own close, so a close from the collection animates like its ×.
  const closePanel = useRef<(() => void) | null>(null);
  const peek = useMemo<Peek>(
    () => ({
      docId,
      open: setDocId,
      close: () => (closePanel.current ? closePanel.current() : setDocId(null)),
    }),
    [docId, setDocId],
  );
  return (
    <PeekContext value={peek}>
      {children}
      {docId && <PageSheet docId={docId} closeRef={closePanel} onClose={() => setDocId(null)} />}
    </PeekContext>
  );
}

const reducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// What an Escape could have changed: the selection, the focus and the open menus.
function uiSignature(): string {
  const selection = document.getSelection();
  const active = document.activeElement;
  return [
    selection?.anchorNode?.nodeName,
    selection?.anchorOffset,
    selection?.focusNode?.nodeName,
    selection?.focusOffset,
    selection?.isCollapsed,
    active?.tagName,
    active?.getAttribute("aria-label"),
    document.querySelectorAll("[role=dialog], [role=listbox], [role=menu]").length,
  ].join("|");
}

// The panel is a child of the collection in React's tree: keep its events from reaching the
// editor and the collection it lies over.
const stop = (event: SyntheticEvent) => event.stopPropagation();

function PageSheet({
  docId,
  closeRef,
  onClose,
}: {
  docId: string;
  closeRef: RefObject<(() => void) | null>;
  onClose: () => void;
}) {
  const app = useApp();
  const tab = useTab();
  const parent = use(ContainerContext);
  const container = parent ?? (tab ? document.getElementById(`tabpanel-${tab.id}`) : null);
  const view = useContributions("view").find((v) => matchesPath(v.path, docPath(docId)));
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [state, setState] = useState<"entering" | "open" | "closing">(() =>
    reducedMotion() ? "open" : "entering",
  );
  const wrapper = useRef<HTMLDivElement>(null);
  const room = container?.clientWidth ?? 1200;
  const minWidth = Math.min(MIN_WIDTH, room);
  const maxWidth = Math.max(minWidth, room - BESIDE - INSET);
  // The corners next to the card's own follow them: the card's radius less the gap between.
  const nestedRadius = useMemo(() => {
    const card = container?.parentElement;
    if (!card) return 0;
    const style = getComputedStyle(card);
    // Measured from the card's outer edge: its border is part of the gap.
    const radius =
      Number.parseFloat(style.borderTopRightRadius) - Number.parseFloat(style.borderRightWidth);
    return Math.max(0, (Number.isFinite(radius) ? radius : 0) - INSET);
  }, [container]);
  const half = Math.min(Math.max(Math.round(room / 2), minWidth), maxWidth);
  const [savedWidth, setSavedWidth] = useDeviceSetting<number | null>("databases.peekWidth", null);
  const elastic = useElasticPanel({
    side: "right",
    collapsed: false,
    width: Math.min(Math.max(savedWidth ?? half, minWidth), maxWidth),
    collapsedWidth: 0,
    minWidth,
    maxWidth,
    defaultWidth: half,
    // Dragged shut, the panel is closed (its width is kept for the next page).
    onCommit: (next) => (next.collapsed ? onClose() : setSavedWidth(next.width)),
  });
  // Over another panel it covers that panel instead of having a width of its own.
  useLayoutEffect(() => {
    if (parent !== null) return;
    elastic.attachPanel(wrapper.current);
    elastic.attachContent(panel);
    return () => {
      elastic.attachPanel(null);
      elastic.attachContent(null);
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- the hook's attach functions are new each render and write to one engine
  }, [parent, panel]);
  const beforeEscape = useRef("");
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Another "Open" swaps the page in place: the page before stays for a moment and the two
  // cross-fade (opacity only, so the compositor does it).
  const [shown, setShown] = useState(docId);
  const [leaving, setLeaving] = useState<string | null>(null);
  if (shown !== docId) {
    setShown(docId);
    setLeaving(shown);
  }
  useEffect(() => {
    if (leaving === null) return;
    const timer = setTimeout(() => setLeaving(null), SWAP_MS);
    return () => clearTimeout(timer);
  }, [leaving, docId]);

  // Two frames, so the starting position paints before the slide.
  useEffect(() => {
    let inner = 0;
    const frame = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setState((s) => (s === "entering" ? "open" : s)));
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(inner);
    };
  }, []);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  // Over another panel: that one steps back and cannot be reached until this one closes, and
  // focus returns to where it was. Over the collection itself see below: it stays in use, and its
  // table measures in real pixels, so it is not scaled.
  const closing = state === "closing";
  const stacked = parent !== null;
  useEffect(() => {
    const self = wrapper.current;
    if (!stacked || !container || !self || closing) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const behind = [...container.children].filter(
      (el): el is HTMLElement => el !== self && el instanceof HTMLElement && !el.inert,
    );
    const animated = !reducedMotion();
    const animations = behind.flatMap((el) => {
      el.inert = true;
      if (!animated || typeof el.animate !== "function") return [];
      return [
        el.animate(
          [
            { translate: "0 0", scale: 1 },
            { translate: "-8px 0", scale: 0.98 },
          ],
          {
            duration: ENTER_MS,
            easing: EASE,
            fill: "forwards",
          },
        ),
      ];
    });
    // Unless its page already took focus (a new page's title).
    if (!self.contains(document.activeElement)) self.focus({ preventScroll: true });
    return () => {
      for (const el of behind) el.inert = false;
      for (const animation of animations) {
        animation.updatePlaybackRate(-ENTER_MS / EXIT_MS);
        animation.onfinish = () => animation.cancel();
      }
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, [stacked, container, closing]);

  const [expanding, setExpanding] = useState(false);
  const controls = useRef<HTMLDivElement>(null);

  const close = () => {
    if (state === "closing" || expanding) return;
    if (reducedMotion()) return onClose();
    setState("closing");
    closeTimer.current = setTimeout(onClose, EXIT_MS);
  };
  useEffect(() => {
    closeRef.current = close;
    return () => {
      closeRef.current = null;
    };
  });
  // Escape in the collection beside the panel (or with nothing focused in this tab) closes it
  // too, unless something there used it (a menu, a field). The panel's own Escapes stop at the
  // panel. A stacked panel takes focus and covers the one behind, so this is the first panel's.
  const closeLatest = useRef(close);
  useLayoutEffect(() => {
    closeLatest.current = close;
  });
  useEffect(() => {
    if (stacked || !container || !tab) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target instanceof Node ? event.target : null;
      if (target && wrapper.current?.contains(target)) return;
      const inTab =
        target === document.body
          ? app.activeTab()?.id === tab.id
          : target !== null && container.contains(target);
      if (!inTab) return;
      event.preventDefault();
      closeLatest.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [stacked, container, tab, app]);

  if (!container || !view || !tab) return null;
  const pages = leaving !== null && leaving !== docId ? [leaving, docId] : [docId];

  const move = (mode: "replace" | "split") => {
    onClose();
    app.openDoc(docId, { mode });
  };

  // The panel grows to fill the tab as the full page lies in it (the card's corners, no edge of
  // its own), so the hand-over does not show. A stacked panel is clipped by the one under it, so
  // it moves at once.
  const openFull = () => {
    const self = wrapper.current;
    if (expanding || closing) return;
    if (stacked || !self || !panel || reducedMotion() || typeof self.animate !== "function") {
      return move("replace");
    }
    setExpanding(true);
    const from = getComputedStyle(panel);
    const width = `${container.clientWidth}px`;
    const timing = { duration: EXPAND_MS, easing: EXPAND_EASE, fill: "forwards" } as const;
    self.animate(
      [
        {
          top: `${INSET}px`,
          right: `${INSET}px`,
          bottom: `${INSET}px`,
          width: `${self.offsetWidth}px`,
          maxWidth: "none",
        },
        { top: "0px", right: "0px", bottom: "0px", width, maxWidth: "none" },
      ],
      timing,
    );
    const grow = panel.animate(
      [
        {
          width: `${panel.offsetWidth}px`,
          borderRadius: from.borderRadius,
          boxShadow: from.boxShadow,
        },
        {
          width,
          borderRadius: `${nestedRadius + INSET}px`,
          boxShadow: "none",
        },
      ],
      timing,
    );
    controls.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: EXPAND_MS / 2,
      easing: "ease-out",
      fill: "forwards",
    });
    grow.finished.then(
      () => {
        if (self.isConnected) move("replace");
      },
      () => {},
    );
  };

  return (
    <Portal container={container}>
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- keeps events in the panel; Escape closes it */}
      <div
        ref={wrapper}
        id={`page-sheet-${tab.id}`}
        tabIndex={-1}
        data-testid="page-sheet"
        data-state={state}
        // Half of the tab by default, floating a little inside the tab's card (which does not
        // change); over another panel all of it but a sliver. Only the
        // panel takes the pointer: what shows beside it stays in use.
        className={`absolute z-[45] outline-none ${stacked ? "inset-y-0 right-0 left-3" : ""}`}
        // The width is the elastic hook's (written to the element, not through React).
        {...(stacked
          ? {}
          : {
              style: {
                top: INSET,
                right: INSET,
                bottom: INSET,
                maxWidth: `calc(100% - ${INSET * 2}px)`,
              },
            })}
        onKeyDownCapture={(event) => {
          if (event.key === "Escape") beforeEscape.current = uiSignature();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key !== "Escape") return;
          // An Escape something inside used (a menu closed, the editor selected the block) is not
          // ours; the editor also takes Escapes that do nothing, and those close the panel.
          if (event.defaultPrevented && beforeEscape.current !== uiSignature()) return;
          event.preventDefault();
          close();
        }}
        onKeyUp={stop}
        onPointerDown={stop}
        onMouseDown={stop}
        onClick={stop}
        onDoubleClick={stop}
        onContextMenu={stop}
        onCopy={stop}
        onCut={stop}
        onPaste={stop}
        onDragStart={stop}
        onDragOver={stop}
        onDrop={stop}
      >
        {/* The edge every popover has (`shadow-popover`: its hairline and drop) and their radius. */}
        {!stacked && !expanding && (
          <ElasticHandle
            panel={elastic}
            controls={`page-sheet-${tab.id}`}
            label="Resize page"
            className="!absolute inset-y-0 left-0 !mx-0 -translate-x-1/2"
          />
        )}
        <section
          ref={setPanel}
          aria-label="Page"
          className={`absolute inset-0 flex origin-center flex-col overflow-hidden rounded-lg bg-surface shadow-popover motion-reduce:transition-none ${
            state === "entering"
              ? "translate-x-full opacity-0"
              : state === "open"
                ? "translate-x-0 opacity-100"
                : "translate-x-6 opacity-0"
          }`}
          style={{
            ...(stacked
              ? {}
              : { borderTopRightRadius: nestedRadius, borderBottomRightRadius: nestedRadius }),
            transition:
              state === "closing"
                ? `translate ${EXIT_MS}ms cubic-bezier(0.32,0.72,0,1), opacity ${EXIT_MS}ms cubic-bezier(0.32,0.72,0,1)`
                : `translate ${ENTER_MS}ms ${EASE}, opacity 120ms ease-out`,
          }}
        >
          {/* In the page's bar, which shows nothing else here (`bare`), where a page has its •••
              (24px buttons in the 36px bar, 8px from the right). */}
          <div
            ref={controls}
            inert={expanding}
            className="absolute top-1.5 right-2 z-[5] flex items-center gap-0.5"
          >
            <Button
              variant="ghost"
              size="icon-xs"
              className={CONTROL}
              aria-label="Close page"
              onPress={close}
            >
              <CloseRegular aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              className={CONTROL}
              aria-label="Open as full page"
              onPress={openFull}
            >
              <FullscreenRegular aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              className={CONTROL}
              aria-label="Open to the side"
              onPress={() => move("split")}
            >
              <LayoutRightRegular aria-hidden />
            </Button>
          </div>
          <ContainerContext value={panel}>
            {pages.map((id) => (
              <SheetPage
                key={id}
                tab={tab}
                docId={id}
                View={view.component}
                leaving={id !== docId}
                swapped={pages.length > 1}
              />
            ))}
          </ContainerContext>
        </section>
      </div>
    </Portal>
  );
}

// One page in the panel, with a tab of its own to read (its route) that is not one in the
// layout: what a tab would remember (scroll, selection) is not kept for a panel.
function SheetPage({
  tab,
  docId,
  View,
  leaving,
  swapped,
}: {
  tab: TabInfo;
  docId: string;
  View: ComponentType<{ tab: TabInfo }>;
  leaving: boolean;
  // Mounted in place of another page (not with the panel itself): it fades in.
  swapped: boolean;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const sheetTab = useMemo<TabInfo>(
    () => ({ ...tab, id: `${tab.id}:sheet:${docId}`, path: docPath(docId) }),
    [tab, docId],
  );
  // A page without a name opens with its title focused, so a new page can be named at once.
  // The doc view reads it as it reads a tab's (`focusTitle`, also set by "New document").
  const untitled = useQuerySelect("doc.get", { id: docId }, (s) => {
    const title = s.data[0]?.document.title;
    return title !== undefined && (title.trim() === "" || title === "Untitled");
  });
  // `bare`: the page's bar keeps no breadcrumbs or actions, only the panel's controls.
  const state = useMemo(
    () => (untitled && !leaving ? { bare: true, focusTitle: true } : { bare: true }),
    [untitled, leaving],
  );
  const fadeIn = useRef(swapped);
  useLayoutEffect(() => {
    const el = layer.current;
    if (!el || typeof el.animate !== "function" || reducedMotion()) return;
    if (leaving) {
      el.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: SWAP_MS,
        easing: "ease-out",
        fill: "forwards",
      });
    } else if (fadeIn.current) {
      fadeIn.current = false;
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: SWAP_MS, easing: "ease-out" });
    }
  }, [leaving]);
  return (
    <div
      ref={layer}
      inert={leaving}
      className={`absolute inset-0 flex flex-col bg-surface ${leaving ? "pointer-events-none" : "z-[1]"}`}
    >
      <TabProvider tab={sheetTab} state={state}>
        <View tab={sheetTab} />
      </TabProvider>
    </div>
  );
}
