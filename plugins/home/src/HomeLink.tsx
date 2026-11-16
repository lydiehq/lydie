import { HOME_PATH, PageLink, useActiveTab, useShortcut } from "@lydie/plugin-api";
import { Home2Regular, sidebarItemStyles, WithTooltip } from "@lydie/plugin-api/ui";

// The sidebar's "Home" entry, current while the focused tab shows the home page.
export function HomeLink() {
  const current = useActiveTab()?.path === HOME_PATH;
  const hotkeys = useShortcut("home.open");
  const button = (
    <PageLink
      path={HOME_PATH}
      aria-current={current ? "page" : undefined}
      className={sidebarItemStyles({ isCurrent: current, className: "mx-2 gap-1.5 px-1.5" })}
    >
      <Home2Regular aria-hidden className="size-4 text-gray-500" />
      Home
    </PageLink>
  );
  return hotkeys ? (
    <WithTooltip label="Go to home" hotkeys={hotkeys} placement="right">
      {button}
    </WithTooltip>
  ) : (
    button
  );
}
