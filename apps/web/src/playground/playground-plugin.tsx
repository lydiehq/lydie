// Development only: an in-app playground for design explorations (little worlds, the Mac icon),
// linked at the bottom of the sidebar. The /playground page is the design-system check outside
// the app.
import { definePlugin, useActiveTab, useApp } from "@lydie/plugin-api";
import { BulbRegular, sidebarItemStyles } from "@lydie/plugin-api/ui";

import { Explorations } from "./Explorations.tsx";

// Not "/playground": that URL is the standalone playground page (App.tsx).
const path = "/explorations";

function PlaygroundLink() {
  const app = useApp();
  const current = useActiveTab()?.path === path;
  return (
    <button
      type="button"
      aria-current={current ? "page" : undefined}
      onClick={(event) => app.open(path, { mode: app.modeFor(event) })}
      className={sidebarItemStyles({ isCurrent: current, className: "mx-2 gap-1.5 px-1.5" })}
    >
      <BulbRegular aria-hidden className="size-4 text-gray-500" />
      Playground
    </button>
  );
}

export const playgroundPlugin = definePlugin({
  id: "playground",
  name: "Playground",
  description: "Design explorations, in development builds only.",
  activate(ctx) {
    ctx.views.register({
      path,
      component: Explorations,
      title: "Playground",
      icon: <BulbRegular />,
    });
    // Below the trash (900).
    ctx.sidebar.register({ id: "playground", order: 1000, component: PlaygroundLink });
    ctx.commands.register({
      id: "playground.open",
      title: "Open playground",
      icon: <BulbRegular />,
      group: "Navigation",
      run: ({ app }) => app.open(path, { mode: "tab" }),
    });
  },
});
