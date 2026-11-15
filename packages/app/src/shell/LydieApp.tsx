import { PlatformProvider } from "@lydie/platform/react";
import { BackendProvider, HostProvider, isBrowserShortcut } from "@lydie/plugin-api";
import { ElasticHandle, useElasticPanel } from "@lydie/ui";
import clsx from "clsx";
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import type { Host } from "../host/host.ts";
import { HostInternalContext } from "./context.ts";
import { WindowLayout } from "./LayoutView.tsx";
import { Confirms, Overlays } from "./Overlays.tsx";
import { PeekHint } from "./PeekHint.tsx";
import { RightPanel } from "./RightPanel.tsx";
import { useSidebarPeek } from "./sidebar-peek.ts";
import { Sidebar } from "./Sidebar.tsx";
import { SwipeNavigation } from "./SwipeNavigation.tsx";
import { Toasts } from "./Toasts.tsx";

type Props = {
  host: Host;
  // Bottom of the sidebar, e.g. the account entry point ("Sign in to Lydie Cloud" or the sync
  // state).
  sidebarFooter?: ReactNode;
  // Under the content cards, for states that need the person (a session that ended, lost access).
  banner?: ReactNode;
};

// Expanded widths; both collapse to 0.
const SIDEBAR = { min: 200, max: 420, default: 260 };
const PANEL = { min: 260, max: 560, default: 300 };

// The whole window: sidebar flush on the window background, then per tab group a tab bar on the
// background over a content card, and the right panel as a card of its own. Sidebar and right
// panel resize and collapse elastically (use-elastic-panel.ts). Owns window-wide keyboard handling
// (commands, global undo).
export function LydieApp({ host, sidebarFooter, banner }: Props) {
  const shell = useSyncExternalStore(host.shell.subscribe, host.shell.get);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const {
    attachPanel: attachSidebar,
    attachContent: attachSidebarContent,
    ...sidebar
  } = useElasticPanel({
    side: "left",
    collapsed: !shell.sidebarOpen,
    width: shell.sidebarWidth,
    collapsedWidth: 0,
    minWidth: SIDEBAR.min,
    maxWidth: SIDEBAR.max,
    defaultWidth: SIDEBAR.default,
    // Closed, its edge is the window's: the toggle in the tab row opens it.
    resizableWhenCollapsed: false,
    onCommit: (next) =>
      host.shell.set((s) => ({ ...s, sidebarOpen: !next.collapsed, sidebarWidth: next.width })),
  });
  const {
    attachPanel: attachRightPanel,
    attachContent: attachRightPanelContent,
    ...panel
  } = useElasticPanel({
    side: "right",
    collapsed: !shell.panelOpen,
    width: shell.panelWidth,
    collapsedWidth: 0,
    minWidth: PANEL.min,
    maxWidth: PANEL.max,
    defaultWidth: PANEL.default,
    // Closed, its edge is the editor's scrollbar: the toggle opens it.
    resizableWhenCollapsed: false,
    onCommit: (next) =>
      host.shell.set((s) => ({ ...s, panelOpen: !next.collapsed, panelWidth: next.width })),
  });
  const sidebarHidden = sidebar.collapsed && !sidebar.switching;
  const panelHidden = panel.collapsed && !panel.switching;
  const shellRef = useRef<HTMLDivElement>(null);
  const peek = useSidebarPeek({ enabled: sidebarHidden, shell: shellRef, card: sidebarRef });
  const peeking = peek !== "closed";

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      host.handleKey(event);
    };
    // In a browser tab the browser's own shortcuts reach nothing in the page (editor, tables,
    // plugins), so none of them can take one over.
    const leaveToBrowser = (event: KeyboardEvent) => {
      if (isBrowserShortcut(event, host.mac)) event.stopImmediatePropagation();
    };
    const browserTab = Boolean(host.platform.capabilities.browserTab);
    if (browserTab) window.addEventListener("keydown", leaveToBrowser, true);
    const onMouseUp = (event: MouseEvent) => {
      // Mouse back/forward buttons navigate tabs, never the page.
      if (event.button === 3 || event.button === 4) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mouseup", onMouseUp);
    const offMenu = host.platform.menus.onAction((id) => {
      if (host.app.commands().some((c) => c.id === id)) void host.app.runCommand(id);
    });
    const flush = () => void host.layout.flush();
    window.addEventListener("pagehide", flush);
    return () => {
      if (browserTab) window.removeEventListener("keydown", leaveToBrowser, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("pagehide", flush);
      offMenu();
    };
  }, [host]);

  // Focus follows a toggled sidebar: into it when it opens, out of it when it closes.
  const previousOpen = useRef(shell.sidebarOpen);
  useEffect(() => {
    if (previousOpen.current === shell.sidebarOpen) return;
    previousOpen.current = shell.sidebarOpen;
    const active = document.activeElement;
    if (shell.sidebarOpen) {
      if (active === document.body || !active) {
        sidebarRef.current?.querySelector<HTMLElement>("button, [tabindex='0']")?.focus();
      }
    } else if (!active || active === document.body || sidebarRef.current?.contains(active)) {
      mainRef.current?.querySelector<HTMLElement>("[role=tab][aria-selected=true]")?.focus();
    }
  }, [shell.sidebarOpen]);

  // And out of the peek as it goes, before it turns inert.
  useEffect(() => {
    if (peek !== "leaving" || !sidebarRef.current?.contains(document.activeElement)) return;
    mainRef.current?.querySelector<HTMLElement>("[role=tab][aria-selected=true]")?.focus();
  }, [peek]);

  useEffect(() => {
    if (!shell.panelOpen) return;
    const active = document.activeElement;
    if (!active || active === document.body)
      panelRef.current?.querySelector<HTMLElement>("[role=tab]")?.focus();
  }, [shell.panelOpen]);

  return (
    <PlatformProvider platform={host.platform}>
      <BackendProvider backend={host.backend}>
        <HostProvider host={host.bridge}>
          <HostInternalContext value={host}>
            <div
              ref={shellRef}
              className="flex h-dvh w-full overflow-hidden bg-canvas text-gray-900"
              data-testid="app-shell"
            >
              <div
                ref={attachSidebar}
                id="app-sidebar"
                className="relative h-full shrink-0 overflow-clip"
                data-collapsed={sidebar.collapsed || undefined}
              >
                {/* The full sidebar stays mounted while collapsed (hidden and inert), so it comes
                    back instantly with its tree state. It fades while the width animates. */}
                <div
                  ref={attachSidebarContent}
                  inert={sidebar.collapsed && !peeking}
                  className={clsx(
                    "h-full transition-opacity duration-150 motion-reduce:transition-none",
                    peeking && "transition-none",
                    sidebar.collapsed && !peeking ? "opacity-0" : "opacity-100 delay-75",
                  )}
                  style={
                    sidebarHidden && !peeking
                      ? { visibility: "hidden", contentVisibility: "hidden" }
                      : undefined
                  }
                >
                  {/* Peeking, the same sidebar floats over the content (fixed, so the collapsed
                      panel does not clip it), 4 px inside the content card as the collections'
                      page sheet does: the card's top and left hairlines, then the gap. Its corners
                      by the card's follow them (8 px less the hairline and the gap). */}
                  <div
                    ref={sidebarRef}
                    data-peek={peeking ? peek : undefined}
                    data-testid={peeking ? "sidebar-peek" : undefined}
                    className={clsx(
                      peeking
                        ? "fixed top-[45px] bottom-[11px] left-[11px] z-40 overflow-hidden rounded-lg rounded-l-[3px] bg-elevated shadow-popover"
                        : "h-full",
                      peek === "leaving" && "pointer-events-none",
                    )}
                    style={peeking ? { width: shell.sidebarWidth } : undefined}
                  >
                    <Sidebar footer={sidebarFooter} />
                  </div>
                </div>
              </div>
              {/* Collapsed, the window's left edge opens the peek (`useSidebarPeek`). */}
              {sidebarHidden && (
                <div
                  aria-hidden
                  data-sidebar-peek-trigger=""
                  className="fixed top-10 bottom-0 left-0 z-40 w-2"
                />
              )}
              <PeekHint open={shell.sidebarOpen} peeking={peeking} />
              <ElasticHandle panel={sidebar} controls="app-sidebar" label="Resize sidebar" />
              <main
                ref={mainRef}
                className={clsx(
                  "flex min-w-0 grow flex-col pr-1.5 pb-1.5",
                  // Open, the card meets the sidebar's edge, so its items' 8 px padding is the gap
                  // on both sides (window edge on the left, card on the right).
                  sidebar.collapsed && "pl-1.5",
                )}
              >
                <div className="flex min-h-0 grow">
                  <div className="flex min-w-0 grow">
                    <WindowLayout />
                  </div>
                  <ElasticHandle
                    panel={panel}
                    controls="app-right-panel"
                    label="Resize right panel"
                  />
                  <div
                    ref={attachRightPanel}
                    id="app-right-panel"
                    className="h-full shrink-0 overflow-clip"
                  >
                    {/* Keeps its own width while the panel slides, so it moves out of view
                        instead of reflowing; skipped entirely while closed. */}
                    <div
                      ref={attachRightPanelContent}
                      inert={panel.collapsed}
                      className={clsx(
                        "h-full pl-1.5 transition-opacity duration-150 motion-reduce:transition-none",
                        panel.collapsed && "opacity-0",
                      )}
                      style={{
                        minWidth: PANEL.min,
                        ...(panelHidden ? { contentVisibility: "hidden" as const } : {}),
                      }}
                    >
                      <div ref={panelRef} className="h-full">
                        {(!panelHidden || shell.panelOpen) && <RightPanel />}
                      </div>
                    </div>
                  </div>
                </div>
                {/* Persistent status that needs action sits under the cards, away from the
                    title-bar row. */}
                {banner && (
                  <div className="surface-depth mt-1.5 shrink-0 overflow-hidden rounded-lg empty:hidden">
                    {banner}
                  </div>
                )}
              </main>
              <Overlays />
              <Confirms />
              <Toasts />
              <SwipeNavigation />
            </div>
          </HostInternalContext>
        </HostProvider>
      </BackendProvider>
    </PlatformProvider>
  );
}
