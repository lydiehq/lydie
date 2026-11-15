import { docIdOf, docPath, HOME_PATH } from "@lydie/contract";
import type { Layout, LayoutNode, Tab, TabGroup, TabPath } from "@lydie/contract";
import {
  DRAG_TYPES,
  formatKeybinding,
  TabProvider,
  useContributions,
  useShortcut,
  useStatus,
} from "@lydie/plugin-api";
import type { TabInfo } from "@lydie/plugin-api";
import { groupsOf } from "@lydie/runtime/layout";
import type { Side } from "@lydie/runtime/layout";
import {
  AddRegular,
  Button,
  buttonStyles,
  CloseRegular,
  ContextMenu,
  EmptyState,
  FirstDocumentIllustration,
  focusRingClass,
  SyncIndicator,
  WithTooltip,
} from "@lydie/ui";
import type { ContextMenuItem } from "@lydie/ui";
import clsx from "clsx";
import { memo, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, DragEvent, KeyboardEvent, MouseEvent, ReactNode } from "react";

import { findView } from "../host/views.ts";
import { jsonEqual, useHostInternal, useSelector } from "./context.ts";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { NavigationButtons } from "./NavigationButtons.tsx";
import { ResizeHandle } from "./ResizeHandle.tsx";
import { SidebarIcon } from "./SidebarIcon.tsx";
import { hideDragImage, prepareDragImage, tabDrag } from "./tab-drag.ts";
import type { ActiveTabDrag } from "./tab-drag.ts";
import { dragStyle, noDragStyle, topRowButtonClass, useTitleBarInset } from "./title-bar.ts";

export const TAB_MIME = DRAG_TYPES.tab;
export const DOC_MIME = DRAG_TYPES.doc;

type Shape =
  | { type: "group"; id: string }
  | { type: "split"; id: string; direction: "row" | "column"; sizes: number[]; children: Shape[] };

function shapeOf(node: LayoutNode): Shape {
  if (node.type === "group") return { type: "group", id: node.id };
  return {
    type: "split",
    id: node.id,
    direction: node.direction,
    sizes: node.sizes,
    children: node.children.map(shapeOf),
  };
}

export function windowOf(layout: Layout, windowId: string) {
  return layout.windows.find((w) => w.id === windowId) ?? layout.windows[0]!;
}

// The group at the top left (gets the title-bar inset when the sidebar is closed) and at the top
// right (gets the right-panel toggle).
function corners(shape: Shape): { topLeft: string; topRight: string } {
  const walk = (s: Shape, side: "left" | "right"): string => {
    if (s.type === "group") return s.id;
    const pick =
      s.direction === "row"
        ? side === "left"
          ? s.children[0]!
          : s.children.at(-1)!
        : s.children[0]!;
    return walk(pick, side);
  };
  return { topLeft: walk(shape, "left"), topRight: walk(shape, "right") };
}

// A view stays mounted while its tab moves within a page (to a heading).
export function pageKey(path: TabPath): string {
  return path.split("#")[0]!;
}

export function WindowLayout() {
  const host = useHostInternal();
  const shape = useSelector(
    host.subscribeLayout,
    host.getLayout,
    (s) => shapeOf(windowOf(s, host.windowId).root),
    jsonEqual,
  );
  const ends = corners(shape);
  return <NodeView shape={shape} ends={ends} />;
}

function NodeView({ shape, ends }: { shape: Shape; ends: { topLeft: string; topRight: string } }) {
  if (shape.type === "group") {
    return (
      <GroupView
        groupId={shape.id}
        topLeft={ends.topLeft === shape.id}
        topRight={ends.topRight === shape.id}
      />
    );
  }
  return <SplitView shape={shape} ends={ends} />;
}

function SplitView({
  shape,
  ends,
}: {
  shape: Extract<Shape, { type: "split" }>;
  ends: { topLeft: string; topRight: string };
}) {
  const host = useHostInternal();
  const container = useRef<HTMLDivElement>(null);
  const start = useRef<number[] | null>(null);
  const row = shape.direction === "row";

  const resize = (index: number, deltaPx: number) => {
    const el = container.current;
    const base = start.current ?? shape.sizes;
    if (!el) return;
    const total = row ? el.clientWidth : el.clientHeight;
    if (total <= 0) return;
    const delta = deltaPx / total;
    const sizes = [...base];
    const pair = base[index]! + base[index + 1]!;
    const a = Math.min(pair - 0.05, Math.max(0.05, base[index]! + delta));
    sizes[index] = a;
    sizes[index + 1] = pair - a;
    host.dispatch({ type: "resize", splitId: shape.id, sizes });
  };

  const children: ReactNode[] = [];
  shape.children.forEach((child, i) => {
    if (i > 0) {
      children.push(
        <ResizeHandle
          key={`handle-${child.id}`}
          orientation={row ? "vertical" : "horizontal"}
          label="Resize panes"
          value={Math.round((shape.sizes[i - 1] ?? 0) * 100)}
          onDragStart={() => (start.current = shape.sizes)}
          onDragEnd={() => (start.current = null)}
          onDrag={(delta) => resize(i - 1, delta)}
          onStep={(delta) => {
            start.current = null;
            resize(i - 1, delta * 2);
          }}
          onReset={() =>
            host.dispatch({ type: "resize", splitId: shape.id, sizes: shape.sizes.map(() => 1) })
          }
        />,
      );
    }
    children.push(
      <div
        key={child.id}
        className="flex min-h-0 min-w-0"
        style={{ flex: `${shape.sizes[i] ?? 1} 1 0px` }}
      >
        <NodeView shape={child} ends={ends} />
      </div>,
    );
  });
  return (
    <div
      ref={container}
      className={clsx("flex min-h-0 min-w-0 grow", row ? "flex-row" : "flex-col")}
    >
      {children}
    </div>
  );
}

type GroupShape = { tabIds: string[]; activeTabId: string | null };

function useGroup(groupId: string): GroupShape {
  const host = useHostInternal();
  return useSelector(
    (l) => host.layout.subscribeGroup(groupId, l),
    () => host.layout.getGroup(groupId),
    (g: TabGroup | null) => ({
      tabIds: g?.tabs.map((t) => t.id) ?? [],
      activeTabId: g?.activeTabId ?? null,
    }),
    jsonEqual,
  );
}

function useFocusedGroup(): string {
  const host = useHostInternal();
  return useSelector(
    host.subscribeLayout,
    host.getLayout,
    (s) => windowOf(s, host.windowId).activeGroupId,
  );
}

function usePool(): number {
  const host = useHostInternal();
  return useSyncExternalStore(host.pool.subscribe, host.pool.version, host.pool.version);
}

type DropZone = Side | "center" | null;

function zoneAt(event: DragEvent<HTMLElement>): DropZone {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  const edge = 0.22;
  if (x < edge) return "left";
  if (x > 1 - edge) return "right";
  if (y < edge) return "up";
  if (y > 1 - edge) return "down";
  return "center";
}

// The preview is a card of its own inside the group's card, inset by a gap. Only top/right/
// bottom/left change between zones, so it glides from one to the next instead of jumping.
const GAP = 6;
const HALF = `calc(50% + ${GAP / 2}px)`;
const ZONE_RECT: Record<Exclude<DropZone, null>, CSSProperties> = {
  center: { top: GAP, right: GAP, bottom: GAP, left: GAP },
  left: { top: GAP, right: HALF, bottom: GAP, left: GAP },
  right: { top: GAP, right: GAP, bottom: GAP, left: HALF },
  up: { top: GAP, right: GAP, bottom: HALF, left: GAP },
  down: { top: HALF, right: GAP, bottom: GAP, left: GAP },
};
const ZONE_LABEL: Record<Exclude<DropZone, null>, string> = {
  center: "Open here",
  left: "Split left",
  right: "Split right",
  up: "Split up",
  down: "Split down",
};
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

// Where a drop lands, after Dia: a soft card fills that part of the pane, the rest dims a little,
// and a pill names the result. It stays mounted while fading out, so it leaves where it was.
function DropPreview({ zone }: { zone: DropZone }) {
  const [shown, setShown] = useState<Exclude<DropZone, null>>(zone ?? "center");
  if (zone && zone !== shown) setShown(zone);
  const visible = zone !== null;
  const split = shown !== "center";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20">
      <div
        className={clsx(
          "absolute inset-0 bg-gray-950/4 transition-opacity duration-200 motion-reduce:transition-none",
          visible && split ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        data-testid={visible ? `drop-zone-${shown}` : undefined}
        className={clsx(
          "absolute flex items-center justify-center rounded-[10px] bg-elevated/70 shadow-lg ring-1 ring-gray-950/10 backdrop-blur-md",
          "motion-reduce:transition-none",
          visible ? "scale-100 opacity-100" : "scale-[0.97] opacity-0",
        )}
        style={{
          ...ZONE_RECT[shown],
          transition: `top 280ms ${EASE}, right 280ms ${EASE}, bottom 280ms ${EASE}, left 280ms ${EASE}, opacity 160ms ease-out, scale 220ms ${EASE}`,
        }}
      >
        <span className="flex items-center gap-2 rounded-full bg-gray-950/5 py-1 pr-3 pl-2 text-xs font-medium text-gray-600">
          <ZoneGlyph zone={shown} />
          {ZONE_LABEL[shown]}
        </span>
      </div>
    </div>
  );
}

// A tiny pane with the part the drop takes filled in.
function ZoneGlyph({ zone }: { zone: Exclude<DropZone, null> }) {
  const fill: Record<Exclude<DropZone, null>, string> = {
    center: "inset-0.5",
    left: "inset-y-0.5 left-0.5 w-[calc(50%-2px)]",
    right: "inset-y-0.5 right-0.5 w-[calc(50%-2px)]",
    up: "inset-x-0.5 top-0.5 h-[calc(50%-2px)]",
    down: "inset-x-0.5 bottom-0.5 h-[calc(50%-2px)]",
  };
  return (
    <span className="relative h-3 w-4 rounded-[3px] ring-1 ring-gray-950/30">
      <span className={clsx("absolute rounded-[1.5px] bg-gray-950/45", fill[zone])} />
    </span>
  );
}

// Where a document dragged in from elsewhere will open in the tab row: a gap that opens to a
// ghost pill. A dragged tab needs none: it is in the row itself (tab-drag.ts).
function TabDropGap() {
  return (
    <div
      aria-hidden
      className="h-7.5 w-10 shrink-0 rounded-lg bg-gray-950/5 ring-1 ring-gray-950/10 ring-inset transition-[width,opacity] duration-200 ease-out starting:w-0 starting:opacity-0 motion-reduce:transition-none"
    />
  );
}

function hasDragData(event: DragEvent) {
  const types = event.dataTransfer.types;
  return types.includes(TAB_MIME) || types.includes(DOC_MIME);
}

const GroupView = memo(function GroupView({
  groupId,
  topLeft,
  topRight,
}: {
  groupId: string;
  topLeft: boolean;
  topRight: boolean;
}) {
  const host = useHostInternal();
  const { tabIds, activeTabId } = useGroup(groupId);
  const focusedGroupId = useFocusedGroup();
  usePool();
  const [zone, setZone] = useState<DropZone>(null);
  const focused = focusedGroupId === groupId;
  const mounted = tabIds.filter((id) => id === activeTabId || host.pool.has(id));
  // The first tab sits on the card's left edge unless the sidebar toggle comes before it (the
  // top-left group). Then the active first tab runs straight down into the card, whose corner
  // gives way to it.
  const tabsAtEdge = !topLeft;

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    const target = zoneAt(event);
    setZone(null);
    const tabId = event.dataTransfer.getData(TAB_MIME);
    const docId = event.dataTransfer.getData(DOC_MIME);
    if (!tabId && !docId) return;
    event.preventDefault();
    tabDrag.end();
    if (tabId) {
      if (target === "center" || target === null) host.dispatch({ type: "move", tabId, groupId });
      else host.dispatch({ type: "moveToSplit", tabId, groupId, side: target });
    } else if (docId) {
      const path = docPath(docId);
      if (target === "center" || target === null)
        host.dispatch({ type: "open", path, groupId, mode: "tab" });
      else host.dispatch({ type: "split", groupId, side: target, path });
    }
  };

  const onMouseUp = (event: MouseEvent) => {
    // In a browser tab the mouse's back and forward buttons are the browser's.
    if (!activeTabId || host.platform.capabilities.browserTab) return;
    if (event.button === 3) host.dispatch({ type: "back", tabId: activeTabId });
    else if (event.button === 4) host.dispatch({ type: "forward", tabId: activeTabId });
    else return;
    event.preventDefault();
  };

  return (
    // Focus and pointer handlers only track which group is active; the tabs and views inside are
    // the interactive elements.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      aria-label="Tab group"
      data-testid="tab-group"
      data-group-id={groupId}
      data-focused={focused || undefined}
      className="flex min-h-0 min-w-0 grow flex-col"
      onFocusCapture={() => {
        if (!focused) host.dispatch({ type: "focusGroup", groupId });
      }}
      onPointerDownCapture={() => {
        if (!focused) host.dispatch({ type: "focusGroup", groupId });
      }}
      onMouseUp={onMouseUp}
    >
      <TabBar
        groupId={groupId}
        tabIds={tabIds}
        activeTabId={activeTabId}
        focused={focused}
        topLeft={topLeft}
        topRight={topRight}
      />
      <div
        data-testid="tab-group-card"
        className={clsx(
          "surface-depth relative min-h-0 grow overflow-hidden rounded-lg bg-surface",
          tabsAtEdge && activeTabId !== null && tabIds[0] === activeTabId && "rounded-tl-none",
        )}
        onDragOver={(event) => {
          if (!hasDragData(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          const next = zoneAt(event);
          if (next !== zone) setZone(next);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setZone(null);
        }}
        onDrop={onDrop}
      >
        {tabIds.length === 0 && <EmptyGroup />}
        {mounted.map((id) => (
          <TabSlot
            key={id}
            tabId={id}
            groupId={groupId}
            active={id === activeTabId}
            focused={focused && id === activeTabId}
          />
        ))}
        <DropPreview zone={zone} />
      </div>
    </section>
  );
});

function EmptyGroup() {
  const host = useHostInternal();
  const binding = (id: string) => {
    const command = host.app.commands().find((c) => c.id === id);
    const key = command?.keybindings[0];
    return key ? formatKeybinding(key, host.mac) : null;
  };
  const hasSwitcher = host.app.commands().some((c) => c.id === "quick-switcher.open");
  return (
    <EmptyState
      className="h-full"
      title="No open documents"
      illustration={<FirstDocumentIllustration />}
      description="Create a document or open one from the sidebar."
      action={
        <div className="flex gap-2">
          <Button size="sm" onPress={() => void host.app.runCommand("core.newDocument")}>
            New document{" "}
            {binding("core.newDocument") && (
              <span className="opacity-60">{binding("core.newDocument")}</span>
            )}
          </Button>
          {hasSwitcher && (
            <Button
              size="sm"
              variant="secondary"
              onPress={() => void host.app.runCommand("quick-switcher.open")}
            >
              Open…{" "}
              {binding("quick-switcher.open") && (
                <span className="opacity-60">{binding("quick-switcher.open")}</span>
              )}
            </Button>
          )}
        </div>
      }
    />
  );
}

function useTabPath(tabId: string): TabPath | null {
  const host = useHostInternal();
  return useSelector(
    (l) => host.layout.subscribeTab(tabId, l),
    () => host.layout.getTab(tabId),
    (t: Tab | null) => t?.path ?? null,
  );
}

function useTabPinned(tabId: string): boolean {
  const host = useHostInternal();
  return useSelector(
    (l) => host.layout.subscribeTab(tabId, l),
    () => host.layout.getTab(tabId),
    (t: Tab | null) => t?.pinned ?? false,
  );
}

// One tab's view. Mounted while visible or pooled; hidden ones keep their DOM, state and scroll
// position but are skipped by layout and paint (content-visibility) and by focus and the a11y tree.
const TabSlot = memo(function TabSlot({
  tabId,
  groupId,
  active,
  focused,
}: {
  tabId: string;
  groupId: string;
  active: boolean;
  focused: boolean;
}) {
  const path = useTabPath(tabId);
  const views = useContributions("view");
  const tab: TabInfo | null = useMemo(
    () => (path ? { id: tabId, groupId, path, isActive: active, isFocused: focused } : null),
    [tabId, groupId, path, active, focused],
  );
  if (!path || !tab) return null;
  const view = findView(views, path);
  const key = pageKey(path);
  return (
    <div
      role="tabpanel"
      id={`tabpanel-${tabId}`}
      aria-labelledby={`tab-${tabId}`}
      data-testid="tab-view"
      data-tab-id={tabId}
      data-active={active || undefined}
      data-focused={focused || undefined}
      inert={!active}
      // isolate: a view's own z-indexes (sticky table headers, popovers) stay below the drop preview.
      className="isolate absolute inset-0 flex flex-col overflow-hidden"
      style={active ? undefined : { visibility: "hidden", contentVisibility: "hidden" }}
    >
      <TabProvider tab={tab}>
        <ErrorBoundary label={view ? `View (${view.pluginId})` : "View"} resetKey={key}>
          {view ? (
            <view.component key={key} tab={tab} />
          ) : (
            <EmptyState className="h-full" title="Nothing can show this page" description={key} />
          )}
        </ErrorBoundary>
      </TabProvider>
    </div>
  );
});

// The tab row's plus and close glyphs are drawn at different sizes; a stroke fixed in screen
// pixels keeps them the same weight (MingCute's 2-unit stroke would scale with each).
const tabRowIconStroke =
  "[&_path]:[vector-effect:non-scaling-stroke] [&_path]:[stroke-width:1.3px]";

function TabBar({
  groupId,
  tabIds,
  activeTabId,
  focused,
  topLeft,
  topRight,
}: {
  groupId: string;
  tabIds: string[];
  activeTabId: string | null;
  // Whether this group has focus (with splits, its active tab is drawn stronger).
  focused: boolean;
  topLeft: boolean;
  topRight: boolean;
}) {
  const host = useHostInternal();
  const inset = useTitleBarInset(host.platform);
  const sidebarOpen = useSyncExternalStore(
    host.shell.subscribe,
    () => host.shell.get().sidebarOpen,
  );
  const panelOpen = useSyncExternalStore(host.shell.subscribe, () => host.shell.get().panelOpen);
  const sidebarKeys = useShortcut("core.toggleSidebar");
  const newTabKeys = useShortcut("core.newTab");
  const panelKeys = useShortcut("core.togglePanel");
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const drag = useSyncExternalStore(tabDrag.subscribe, tabDrag.strip, tabDrag.strip);
  // The slot the dragged tab holds in this row, among the row's other tabs.
  const openSlot = drag && drag.overGroupId === groupId ? drag.index : null;
  const others = drag ? tabIds.filter((id) => id !== drag.tabId) : tabIds;
  const [menu, setMenu] = useState<{ tabId: string; x: number; y: number } | null>(null);
  // Tabs that joined the row since the last render open with an animation (`TabButton`). Not
  // the row's first tabs (a restored layout, a new split), nor a tab dropped here by a drag.
  const [seen, setSeen] = useState(tabIds);
  const [opening, setOpening] = useState<string[]>([]);
  if (seen.join() !== tabIds.join()) {
    setSeen(tabIds);
    const added = tabIds.filter((id) => !seen.includes(id) && !tabDrag.landed(id));
    if (added.length > 0) setOpening([...opening.filter((id) => tabIds.includes(id)), ...added]);
  }
  // With the sidebar collapsed, the window buttons sit in this row.
  const insetLeft = topLeft && !sidebarOpen ? inset.left : 0;
  const openNewTab = () => host.dispatch({ type: "open", path: HOME_PATH, groupId, mode: "tab" });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabIds.indexOf(activeTabId ?? "");
    let next = -1;
    if (event.key === "ArrowRight") next = Math.min(index + 1, tabIds.length - 1);
    else if (event.key === "ArrowLeft") next = Math.max(index - 1, 0);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabIds.length - 1;
    else return;
    event.preventDefault();
    const id = tabIds[next];
    if (!id) return;
    host.dispatch({ type: "activate", tabId: id });
    requestAnimationFrame(() => document.getElementById(`tab-${id}`)?.focus());
  };

  const indexAt = (event: DragEvent<HTMLElement>) => {
    const items = [...(list.current?.querySelectorAll<HTMLElement>("[role=tab]") ?? [])];
    for (let i = 0; i < items.length; i++) {
      const rect = items[i]!.getBoundingClientRect();
      if (event.clientX < rect.left + rect.width / 2) return i;
    }
    return items.length;
  };

  // Where the dragged tab sits in this row for the pointer's position: it follows the pointer
  // between the first slot and the one after the last tab, and takes the slot it is mostly over.
  // The other tabs are measured where the layout puts them (offsetLeft), not where their shift
  // draws them.
  const placeTab = (event: DragEvent<HTMLElement>, dragged: ActiveTabDrag) => {
    const el = list.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const px = (value: string) => Number.parseFloat(value) || 0;
    const gap = px(style.columnGap);
    const tabs = [...el.querySelectorAll<HTMLElement>("[role=tab]")].filter(
      (tab) => tab.dataset.tabId !== dragged.tabId,
    );
    const origin = rect.left + el.clientLeft - el.scrollLeft;
    const first = tabs[0];
    const last = tabs.at(-1);
    const start = first ? origin + first.offsetLeft : rect.left + px(style.paddingLeft);
    const end = last ? origin + last.offsetLeft + last.offsetWidth + gap : start;
    const left = Math.min(Math.max(event.clientX - dragged.grabX, start), end);
    const inner = el.clientHeight - px(style.paddingTop) - px(style.paddingBottom);
    return {
      index: tabs.filter((tab) => left > origin + tab.offsetLeft + (dragged.width + gap) / 2)
        .length,
      left,
      top: rect.top + el.clientTop + px(style.paddingTop) + (inner - dragged.height) / 2,
    };
  };

  const menuItems = (tabId: string): ContextMenuItem[] => {
    const pinned = host.layout.getTab(tabId)?.pinned ?? false;
    return [
      { id: "close", label: "Close" },
      { id: "closeOthers", label: "Close others" },
      { id: "pin", label: pinned ? "Unpin" : "Pin" },
      { type: "separator", id: "s1" },
      { id: "splitRight", label: "Split right" },
      { id: "splitDown", label: "Split down" },
    ];
  };

  const onMenuAction = (tabId: string, action: string) => {
    const tab = host.layout.getTab(tabId);
    if (!tab) return;
    if (action === "close") host.dispatch({ type: "close", tabId });
    else if (action === "closeOthers") host.dispatch({ type: "closeOthers", tabId });
    else if (action === "pin") host.dispatch({ type: "pin", tabId, pinned: !tab.pinned });
    else if (action === "splitRight" || action === "splitDown") {
      host.dispatch({
        type: "moveToSplit",
        tabId,
        groupId,
        side: action === "splitRight" ? "right" : "down",
      });
    }
  };

  return (
    // The tab row sits on the window background above the group's card (as in v1). Double-clicking
    // its empty part opens a new tab.
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="flex h-10 min-w-0 shrink-0 items-center gap-1"
      style={{ paddingLeft: insetLeft, ...(inset.custom ? dragStyle : {}) }}
      data-testid="tab-bar"
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).dataset.tabBarSpace !== undefined) openNewTab();
      }}
      // The whole row takes the drag, so a tab stays docked past the ends of the list.
      onDragOver={(event) => {
        if (!hasDragData(event)) return;
        event.preventDefault();
        const dragged = tabDrag.active();
        if (!dragged) {
          setDropIndex(indexAt(event));
          return;
        }
        event.dataTransfer.dropEffect = "move";
        const place = placeTab(event, dragged);
        if (place) tabDrag.dock(groupId, place);
      }}
      onDragLeave={(event) => {
        // By position: a dragleave between the row's own children does not always say where
        // the pointer went (relatedTarget), and undocking for one would close the tab's slot.
        const rect = event.currentTarget.getBoundingClientRect();
        const inside =
          event.clientX >= rect.left &&
          event.clientX < rect.right &&
          event.clientY >= rect.top &&
          event.clientY < rect.bottom;
        if (inside) return;
        setDropIndex(null);
        tabDrag.undock(groupId);
      }}
      onDrop={(event) => {
        if (!hasDragData(event)) return;
        event.preventDefault();
        setDropIndex(null);
        const dragged = tabDrag.active();
        const tabId = event.dataTransfer.getData(TAB_MIME);
        const docId = event.dataTransfer.getData(DOC_MIME);
        if (dragged) {
          // The slot counts the row's other tabs, as the move does.
          const index = placeTab(event, dragged)?.index;
          tabDrag.end();
          host.dispatch({ type: "move", tabId: dragged.tabId, groupId, index });
        } else if (tabId) {
          // A tab from another window. Moving right within the same group: the tab's own slot
          // disappears first.
          const index = indexAt(event);
          const from = tabIds.indexOf(tabId);
          host.dispatch({
            type: "move",
            tabId,
            groupId,
            index: from !== -1 && from < index ? index - 1 : index,
          });
        } else if (docId) {
          host.dispatch({ type: "open", path: docPath(docId), groupId, mode: "tab" });
        }
      }}
    >
      {/* The sidebar's toggle starts the row, open or collapsed (as in Dia). */}
      {topLeft && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          tooltipOptions={{ hotkeys: sidebarKeys }}
          // As far in from the card's edge as the first tab is from it.
          className={clsx("relative z-20 ml-1 shrink-0 text-gray-500", topRowButtonClass)}
          style={noDragStyle}
          onPress={() => host.app.panels.toggle("left")}
        >
          <SidebarIcon collapsed={!sidebarOpen} />
        </Button>
      )}
      {topLeft && <NavigationButtons />}
      {/* Sets the buttons off from an inactive first tab; an active one is set off by its shape. */}
      {topLeft && tabIds[0] !== activeTabId && (
        <span aria-hidden className="relative z-20 mx-0.5 h-4 w-px shrink-0 bg-gray-950/10" />
      )}
      {/* Roving tabindex: the selected tab is the tab stop, not the list. The padding (taken back
          by the margin) keeps the focus ring inside the scrolling list, and is as wide as a foot of
          the active tab, which the list would clip otherwise. It runs under the buttons either
          side (z-20), where a foot is all but flat, so the tabs sit close to them. The list runs
          2px into the card, above it, so the active tab covers the card's top hairline and the
          inset highlight under it (dark mode), and joins it. The gap keeps a neighbour's hover
          pill clear of the active tab's foot. */}
      {/* oxlint-disable-next-line jsx-a11y/interactive-supports-focus */}
      <div
        ref={list}
        role="tablist"
        aria-label="Open tabs"
        className={clsx(
          "relative -mr-3 -mb-[2px] flex min-w-0 items-center gap-1.5 self-stretch overflow-x-auto pr-4 pb-[2px] [scrollbar-width:none]",
          topLeft ? "-ml-4 pl-4" : "-ml-1 pl-1",
          // The dragged tab is drawn from its own row, above the other rows and the buttons.
          drag?.sourceGroupId === groupId ? "z-30" : "z-10",
        )}
        style={noDragStyle}
        onKeyDown={onKeyDown}
      >
        {tabIds.map((id, i) => {
          const dragging = drag?.tabId === id;
          return (
            <TabButton
              key={id}
              tabId={id}
              groupId={groupId}
              active={id === activeTabId}
              groupFocused={focused}
              atEdge={i === 0 && !topLeft}
              dropBefore={dropIndex === i}
              dragging={dragging}
              opening={opening.includes(id)}
              onOpened={() => setOpening((ids) => ids.filter((other) => other !== id))}
              // Tabs from the dragged one's slot on stand one tab further along.
              shift={
                drag && !dragging && openSlot !== null && others.indexOf(id) >= openSlot
                  ? drag.width + TAB_GAP
                  : 0
              }
              animate={drag?.settled ?? false}
              onContextMenu={(x, y) => setMenu({ tabId: id, x, y })}
            />
          );
        })}
        {dropIndex === tabIds.length && <TabDropGap />}
        {/* The dragged tab is out of the flow: this keeps its room in the row it is docked in,
            so what follows the list stays put. */}
        {drag && (
          <span
            aria-hidden
            className={clsx(
              "shrink-0",
              drag.settled &&
                "transition-[width,margin] duration-200 ease-out motion-reduce:transition-none",
            )}
            style={openSlot !== null ? { width: drag.width } : { width: 0, marginLeft: -TAB_GAP }}
          />
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="New tab"
        tooltipOptions={{ hotkeys: newTabKeys }}
        className={clsx("relative z-20 shrink-0 text-gray-500", topRowButtonClass)}
        style={noDragStyle}
        onPress={openNewTab}
      >
        <AddRegular className={clsx("size-4", tabRowIconStroke)} />
      </Button>
      <div data-tab-bar-space="" className="h-full min-w-4 grow" />
      {topRight && !sidebarOpen && <OfflineStatus />}
      {topRight && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={panelOpen ? "Hide right panel" : "Show right panel"}
          aria-pressed={panelOpen}
          tooltipOptions={{ hotkeys: panelKeys }}
          className={clsx("shrink-0 text-gray-500", topRowButtonClass)}
          style={noDragStyle}
          onPress={() => host.app.panels.toggle("right")}
        >
          <SidebarIcon right collapsed={!panelOpen} />
        </Button>
      )}
      {/* With the right panel open, its header is the rightmost element of the row. */}
      {topRight && !panelOpen && inset.right > 0 && (
        <div className="shrink-0" style={{ width: inset.right }} />
      )}
      <ContextMenu
        label="Tab actions"
        position={menu ? { x: menu.x, y: menu.y } : null}
        items={menu ? menuItems(menu.tabId) : []}
        onAction={(action) => menu && onMenuAction(menu.tabId, action)}
        onClose={() => setMenu(null)}
      />
    </div>
  );
}

// The sidebar footer says when the window is offline; with the sidebar collapsed this says it in
// the tab row instead: the status item that shows the sync state (with its details), else the
// host's indicator. Its own component, so a status change re-renders only this.
function OfflineStatus() {
  const status = useStatus();
  const items = useContributions("statusBar").filter((item) => item.replacesSyncIndicator);
  if (status.sync !== "offline") return null;
  return (
    <div className="flex shrink-0 items-center" style={noDragStyle} data-testid="tab-bar-offline">
      {items.length > 0 ? (
        items.map((item) => (
          <ErrorBoundary
            key={`${item.pluginId}:${item.id}`}
            label={`Status (${item.pluginId})`}
            compact
          >
            <item.component />
          </ErrorBoundary>
        ))
      ) : (
        <SyncIndicator
          state="offline"
          pending={status.pendingOperations + status.pendingUploads}
          className="px-2"
        />
      )}
    </div>
  );
}

const TabButton = memo(function TabButton({
  tabId,
  groupId,
  active,
  groupFocused,
  atEdge,
  dropBefore,
  dragging,
  opening,
  onOpened,
  shift,
  animate,
  onContextMenu,
}: {
  tabId: string;
  groupId: string;
  active: boolean;
  groupFocused: boolean;
  // First in the row, on the card's left edge: no foot curving out to the left.
  atEdge: boolean;
  dropBefore: boolean;
  // This tab is the one being dragged: drawn where the drag has it, out of the row's flow.
  dragging: boolean;
  // Newly opened: the tab grows into the row and fades in, and what follows it slides along
  // from where it stood (the starting margin takes back the row's gap).
  opening: boolean;
  onOpened: () => void;
  // How far along the row the tab stands aside for the dragged one, and whether it glides there.
  shift: number;
  animate: boolean;
  onContextMenu: (x: number, y: number) => void;
}) {
  const host = useHostInternal();
  const getPosition = () => (dragging ? tabDrag.position() : null);
  const position = useSyncExternalStore(tabDrag.subscribe, getPosition, getPosition);
  // Docked in a row the tab is part of the card as ever; between rows it is a card of its own.
  const floating = position !== null && !position.docked;
  const path = useTabPath(tabId);
  const pinned = useTabPinned(tabId);
  const closeKeys = useShortcut("core.closeTab");
  const views = useContributions("view");
  if (!path) return null;
  const view = findView(views, path);
  const Title = view?.tabTitle;
  const title = typeof view?.title === "function" ? view.title(path) : (view?.title ?? "Untitled");
  const docId = docIdOf(path);

  return (
    <>
      {dropBefore && <TabDropGap />}
      <div
        id={`tab-${tabId}`}
        role="tab"
        aria-selected={active}
        aria-controls={`tabpanel-${tabId}`}
        tabIndex={active ? 0 : -1}
        draggable
        data-testid="tab"
        data-tab-id={tabId}
        data-group-id={groupId}
        data-pinned={pinned || undefined}
        onDragStart={(event) => {
          event.dataTransfer.setData(TAB_MIME, tabId);
          if (docId) event.dataTransfer.setData(DOC_MIME, docId);
          event.dataTransfer.effectAllowed = "move";
          hideDragImage(event.dataTransfer);
          const el = event.currentTarget;
          const row = [...(el.parentElement?.querySelectorAll("[role=tab]") ?? [])];
          tabDrag.start({
            tabId,
            groupId,
            index: Math.max(0, row.indexOf(el)),
            rect: el.getBoundingClientRect(),
            x: event.clientX,
            y: event.clientY,
          });
        }}
        onMouseDown={(event) => {
          prepareDragImage();
          if (event.button === 1) event.preventDefault();
          // As in a browser, pressing a tab selects it, so the tab being dragged is the active
          // one. Not from its close button, which would change what closing it leaves selected.
          else if (event.button === 0 && !active && !(event.target as Element).closest("button"))
            host.dispatch({ type: "activate", tabId });
        }}
        onAuxClick={(event) => {
          if (event.button === 1) host.dispatch({ type: "close", tabId });
        }}
        onClick={() => host.dispatch({ type: "activate", tabId })}
        onTransitionEnd={(event) => {
          if (opening && event.target === event.currentTarget && event.propertyName === "width")
            onOpened();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          onContextMenu(event.clientX, event.clientY);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            host.dispatch({ type: "activate", tabId });
          } else if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            host.dispatch({ type: "close", tabId });
          } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            onContextMenu(rect.left, rect.bottom);
          }
        }}
        // Fixed-width pills as in v1; many tabs shrink to 80px before the row scrolls.
        className={clsx(
          "group/tab relative flex h-7.5 min-w-20 cursor-default items-center rounded-lg px-3 text-sm font-medium select-none",
          focusRingClass,
          pinned ? "max-w-[190px] shrink-0" : "w-[190px] shrink",
          active
            ? clsx("z-10", groupFocused ? "text-gray-900" : "text-gray-700")
            : "text-gray-600 hover:bg-gray-950/3",
          floating && "surface-depth bg-surface opacity-90",
          opening &&
            !dragging &&
            "transition-[width,min-width,padding,margin,opacity] duration-350 ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none starting:-ml-1.5 starting:w-0 starting:min-w-0 starting:px-0 starting:opacity-0",
          animate &&
            !dragging &&
            !opening &&
            "transition-transform duration-200 ease-out motion-reduce:transition-none",
        )}
        style={
          position
            ? {
                position: "fixed",
                left: position.left,
                top: position.top,
                width: position.width,
                zIndex: 50,
                // The rows and cards under the tab take the drag, not the tab.
                pointerEvents: "none",
              }
            : shift
              ? { transform: `translateX(${shift}px)` }
              : undefined
        }
      >
        {active && !floating && <ActiveTabShape atEdge={atEdge && !dragging} />}
        <span className={clsx("flex min-w-0 flex-1 items-center gap-1.5", !pinned && "pr-6")}>
          {Title ? (
            <Title path={path} />
          ) : (
            <>
              {/* The view's icon, as its row in the sidebar shows it. */}
              {view?.icon && (
                <span
                  aria-hidden
                  className="inline-flex size-4 shrink-0 items-center justify-center text-gray-500 [&_svg]:size-4"
                >
                  {view.icon}
                </span>
              )}
              <span className="truncate">{title}</span>
            </>
          )}
        </span>
        {pinned ? (
          <span aria-label="Pinned" className="ml-1.5 size-1.5 shrink-0 rounded-full bg-gray-400" />
        ) : (
          <WithTooltip label="Close tab" hotkeys={active ? closeKeys : null}>
            {/* A plain button with the ghost look: react-aria's press handling cancels the
                pointer-down, which would stop a drag of the tab starting on it. `active:` stands
                in for `pressed:`, which only react-aria sets. */}
            <button
              type="button"
              tabIndex={-1}
              aria-label="Close tab"
              onClick={(event) => {
                event.stopPropagation();
                host.dispatch({ type: "close", tabId });
              }}
              className={buttonStyles({
                variant: "ghost",
                size: "icon-2xs",
                className: clsx(
                  "absolute right-2 text-gray-500 hover:text-gray-800 active:bg-gray-950/8",
                  active ? "opacity-100" : "opacity-0 group-hover/tab:opacity-100",
                ),
              })}
            >
              <CloseRegular className={clsx("size-3.5", tabRowIconStroke)} />
            </button>
          </WithTooltip>
        )}
      </div>
    </>
  );
});

// The active tab is part of its group's card, as in Dia: the card's colour and hairline run up
// around it and its feet flare out into the card's top edge. It reaches 7px below the tab, to the
// bottom of the tab list (2px into the card), and 3px above it so the label sits near its middle.
function ActiveTabShape({ atEdge }: { atEdge: boolean }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 -top-[3px] -bottom-[7px] -z-10"
    >
      <TabSide foot={!atEdge} />
      <span
        className="absolute inset-y-0 border-t border-(--depth-border) bg-surface"
        style={{ left: TAB_CORNER, right: TAB_CORNER }}
      />
      <TabSide foot right />
    </span>
  );
}

// Measured from Dia's tabs: round top corners, and feet that are wider than tall, leaving the
// side quickly and running a long way along the card's edge.
const TAB_GAP = 6; // the tab list's gap-1.5
const TAB_HEIGHT = 40; // ActiveTabShape: the tab's 30px, 3 above, 7 below
const TAB_CORNER = 10;
const TAB_FOOT_WIDTH = 16; // also the tab list's side padding
const TAB_FOOT_HEIGHT = 14;
const CORNER_HANDLE = 0.5523; // a circle's
const FOOT_SIDE_HANDLE = 0.35;
const FOOT_BASE_HANDLE = 0.7;

// One side of the active tab as a single path, so the hairline runs unbroken from the card's top
// edge, round the foot, up the side and round the top corner. Coordinates are hairline centres;
// the right side is the left one mirrored.
function TabSide({ foot, right }: { foot: boolean; right?: boolean }) {
  const f = foot ? TAB_FOOT_WIDTH : 0;
  const width = f + TAB_CORNER;
  const h = TAB_HEIGHT;
  const x = f + 0.5; // the side
  const base = h - 1.5; // the card's top hairline, with the highlight row under it
  const top = base - TAB_FOOT_HEIGHT; // where the foot leaves the side
  const r = TAB_CORNER;
  const outline = [
    foot
      ? `M0.5 ${base}C${0.5 + FOOT_BASE_HANDLE * f} ${base} ${x} ${top + FOOT_SIDE_HANDLE * TAB_FOOT_HEIGHT} ${x} ${top}`
      : `M${x} ${h}`,
    `L${x} ${r + 0.5}`,
    `C${x} ${r + 0.5 - CORNER_HANDLE * r} ${x + r - CORNER_HANDLE * r} 0.5 ${x + r} 0.5`,
    `L${width} 0.5`,
  ].join("");
  return (
    <svg
      viewBox={`0 0 ${width} ${h}`}
      width={width}
      height={h}
      className={clsx("absolute top-0", right && "-scale-x-100")}
      style={right ? { right: -f } : { left: -f }}
    >
      <path d={`${outline}L${width} ${h}L0.5 ${h}Z`} className="fill-surface" />
      <path d={outline} fill="none" className="stroke-(--depth-border)" />
    </svg>
  );
}

export function allTabIds(layout: Layout, windowId: string): string[] {
  return [...groupsOf(windowOf(layout, windowId).root)].flatMap((g) => g.tabs.map((t) => t.id));
}
