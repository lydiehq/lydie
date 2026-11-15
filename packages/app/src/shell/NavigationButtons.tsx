import { useShortcut } from "@lydie/plugin-api";
import { ArrowLeftRegular, ArrowRightRegular, Button } from "@lydie/ui";

import { useHostInternal, useSelector } from "./context.ts";
import { noDragStyle, topRowButtonClass } from "./title-bar.ts";

// Back and forward for the focused tab, at the start of the top-left tab row (as in Linear's and
// Notion's desktop apps), after the sidebar toggle when the sidebar is collapsed. A browser tab
// has the browser's own, so there are none there.
export function NavigationButtons() {
  const host = useHostInternal();
  const history = useSelector(
    (listener) => host.layout.subscribe(listener),
    () => host.layout.getState(),
    () => {
      const id = host.app.activeTab()?.id;
      const tab = id ? host.layout.getTab(id) : null;
      return { back: (tab?.back.length ?? 0) > 0, forward: (tab?.forward.length ?? 0) > 0 };
    },
    (a, b) => a.back === b.back && a.forward === b.forward,
  );
  const backKeys = useShortcut("core.back");
  const forwardKeys = useShortcut("core.forward");
  if (host.platform.capabilities.browserTab) return null;

  return (
    <div className="relative z-20 flex shrink-0 items-center" style={noDragStyle}>
      <Button
        variant="ghost"
        size="icon-sm"
        className={topRowButtonClass}
        aria-label="Go back"
        tooltipOptions={{ hotkeys: backKeys }}
        isDisabled={!history.back}
        onPress={() => void host.app.runCommand("core.back")}
      >
        <ArrowLeftRegular className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className={topRowButtonClass}
        aria-label="Go forward"
        tooltipOptions={{ hotkeys: forwardKeys }}
        isDisabled={!history.forward}
        onPress={() => void host.app.runCommand("core.forward")}
      >
        <ArrowRightRegular className="size-4" />
      </Button>
    </div>
  );
}
