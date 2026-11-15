import { HOME_PATH, useActiveTab, useApp, useShortcut } from "@lydie/plugin-api";
import { Home2Regular, sidebarItemStyles, WithTooltip } from "@lydie/plugin-api/ui";

// The sidebar's "Home" entry, current while the focused tab shows the home page.
export function HomeLink() {
  const app = useApp();
  const current = useActiveTab()?.path === HOME_PATH;
  const hotkeys = useShortcut("home.open");
  const button = (
    <button
      type="button"
      aria-current={current ? "page" : undefined}
      onClick={(event) => app.open(HOME_PATH, { mode: app.modeFor(event) })}
      className={sidebarItemStyles({ isCurrent: current, className: "mx-2 gap-1.5 px-1.5" })}
    >
      <Home2Regular aria-hidden className="size-4 text-gray-500" />
      Home
    </button>
  );
  return hotkeys ? (
    <WithTooltip label="Go to home" hotkeys={hotkeys} placement="right">
      {button}
    </WithTooltip>
  ) : (
    button
  );
}
