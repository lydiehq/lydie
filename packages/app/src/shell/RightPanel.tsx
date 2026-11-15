import { useContributions } from "@lydie/plugin-api";
import type { TabInfo } from "@lydie/plugin-api";
import { buttonStyles, EmptyState } from "@lydie/ui";
import { useSyncExternalStore } from "react";

import { useHostInternal, useSelector } from "./context.ts";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { windowOf } from "./LayoutView.tsx";
import { panelToggleRoom } from "./PanelToggle.tsx";
import { dragStyle, noDragStyle, useTitleBarInset } from "./title-bar.ts";

// The right panel: one plugin panel at a time, chosen by a small tab strip. Panels get the
// focused tab, so they can follow the active document.
export function RightPanel() {
  const host = useHostInternal();
  const inset = useTitleBarInset(host.platform);
  const panels = useContributions("panel");
  const panelId = useSyncExternalStore(host.shell.subscribe, () => host.shell.get().panelId);
  const activeTabId = useSelector(host.subscribeLayout, host.getLayout, (s) => {
    const w = windowOf(s, host.windowId);
    for (const stack = [w.root]; stack.length;) {
      const node = stack.pop()!;
      if (node.type === "group") {
        if (node.id === w.activeGroupId) return node.activeTabId;
      } else stack.push(...node.children);
    }
    return null;
  });
  const path = useSelector(host.subscribeLayout, host.getLayout, () =>
    activeTabId ? (host.layout.getTab(activeTabId)?.path ?? null) : null,
  );
  const activeTab: TabInfo | null = activeTabId && path !== null ? host.tabInfo(activeTabId) : null;
  const current = panels.find((p) => p.id === panelId) ?? panels[0];

  if (panels.length === 0) return <EmptyState title="No panels" />;
  return (
    <aside
      aria-label="Right panel"
      className="flex h-full min-h-0 flex-col"
      data-testid="right-panel"
    >
      {/* Panel tabs on the window background, in line with the tab bars; the panel in a card.
          The panel's toggle sits over the row's end. */}
      <div
        className="flex h-10 shrink-0 items-center"
        style={{ paddingRight: panelToggleRoom(inset), ...(inset.custom ? dragStyle : {}) }}
      >
        <div
          role="tablist"
          aria-label="Panels"
          className="flex min-w-0 gap-0.5"
          style={noDragStyle}
        >
          {/* Plain buttons with the shared look: react-aria's Button does not take role="tab". */}
          {panels.map((panel) => (
            <button
              key={`${panel.pluginId}:${panel.id}`}
              type="button"
              role="tab"
              aria-selected={panel === current}
              data-current={panel === current || undefined}
              onClick={() => host.app.panels.show(panel.id)}
              className={buttonStyles({ variant: "ghost", size: "sm", className: "text-gray-600" })}
            >
              {panel.title}
            </button>
          ))}
        </div>
      </div>
      <div
        role="tabpanel"
        aria-label={current?.title}
        className="surface-depth min-h-0 grow overflow-y-auto rounded-lg bg-surface"
      >
        {current && (
          <ErrorBoundary label={`Panel (${current.pluginId})`} resetKey={current.id}>
            <current.component activeTab={activeTab} />
          </ErrorBoundary>
        )}
      </div>
    </aside>
  );
}
