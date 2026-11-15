// The home page, shown as the new-tab page. It records which documents you open here, per
// workspace, for "Jump back in".
import { definePlugin, docIdOf, HOME_PATH } from "@lydie/plugin-api";
import { Home2Regular } from "@lydie/plugin-api/ui";

import { HomeLink } from "./HomeLink.tsx";
import { HomeView } from "./HomeView.tsx";
import { recentKey, recordOpen } from "./recents.ts";
import type { Opened } from "./recents.ts";

export const homePlugin = definePlugin({
  id: "home",
  name: "Home",
  description: "A home page for new tabs: find or create a document, and jump back to recent ones.",
  activate(ctx) {
    const { app } = ctx;
    ctx.views.register({
      path: HOME_PATH,
      component: HomeView,
      title: "Home",
      icon: <Home2Regular />,
    });
    // Above the documents (10).
    ctx.sidebar.register({ id: "home", order: 2, component: HomeLink });
    ctx.commands.register({
      id: "home.open",
      title: "Go to home",
      icon: <Home2Regular />,
      group: "Navigation",
      keybinding: "G H",
      run: () => app.open(HOME_PATH),
    });
    const key = recentKey(app.workspace.workspaceId);
    let last: string | null = null;
    return app.subscribeActiveTab(() => {
      const id = docIdOf(app.activeTab()?.path);
      if (!id || id === last) return;
      last = id;
      app.storage.set(key, recordOpen(app.storage.get<Opened[]>(key) ?? [], id, Date.now()));
    });
  },
});

export default homePlugin;
