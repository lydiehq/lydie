import { useShortcut } from "@lydie/plugin-api";
import { Button } from "@lydie/ui";
import clsx from "clsx";
import { useSyncExternalStore } from "react";

import { useHostInternal } from "./context.ts";
import { SidebarIcon } from "./SidebarIcon.tsx";
import { noDragStyle, topRowButtonClass, useTitleBarInset } from "./title-bar.ts";
import type { TitleBarInset } from "./title-bar.ts";

// Button `icon-sm`, and the gap the top row keeps between the toggle and the window buttons.
const TOGGLE_WIDTH = 30;
const GAP = 4;

// From the right edge of the column (the top-right tab row, or the open right panel) to the
// toggle's right edge: the room the window buttons take, if any.
export function panelToggleOffset(inset: TitleBarInset): number {
  return inset.right > 0 ? inset.right + GAP : 0;
}

// What the rightmost row of the top row leaves free for the toggle.
export function panelToggleRoom(inset: TitleBarInset): number {
  return TOGGLE_WIDTH + panelToggleOffset(inset);
}

// The right panel's toggle stays at the window's top right while the panel opens and closes, over
// whichever row is rightmost (the top-right tab row, or the panel's tabs); both leave it room.
// Placed in `main`, inside its right padding (`right-1.5`), where both rows end.
export function PanelToggle() {
  const host = useHostInternal();
  const inset = useTitleBarInset(host.platform);
  const panelOpen = useSyncExternalStore(host.shell.subscribe, () => host.shell.get().panelOpen);
  const keys = useShortcut("core.togglePanel");
  return (
    <div
      className="absolute top-0 right-1.5 z-20 flex h-10 items-center"
      style={{ ...noDragStyle, marginRight: panelToggleOffset(inset) }}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={panelOpen ? "Hide right panel" : "Show right panel"}
        aria-pressed={panelOpen}
        tooltipOptions={{ hotkeys: keys }}
        className={clsx("shrink-0 text-gray-500", topRowButtonClass)}
        onPress={() => host.app.panels.toggle("right")}
      >
        <SidebarIcon right collapsed={!panelOpen} />
      </Button>
    </div>
  );
}
