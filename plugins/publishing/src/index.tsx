import { definePlugin, docIdOf } from "@lydie/plugin-api";
import { GlobeRegular } from "@lydie/plugin-api/ui";

import { ConnectionsPage } from "./ConnectionsPage.tsx";
import { watchFolderMarks } from "./folder-marks.ts";
import { PublishPanel } from "./PublishPanel.tsx";

export const publishingPlugin = definePlugin({
  id: "publishing",
  name: "Publishing",
  description: "Publish documents to GitHub, WordPress and webhooks.",
  activate(ctx) {
    const { app } = ctx;
    // The OAuth return address is /settings/connections, so the page id is fixed.
    ctx.settings.register({
      id: "connections",
      group: "Integrations",
      title: "Publishing",
      order: 10,
      description: "Destinations your documents are published to.",
      keywords: ["github", "wordpress", "webhook", "connect", "oauth", "token"],
      component: ConnectionsPage,
    });
    ctx.panels.register({ id: "publishing", title: "Publish", order: 50, component: PublishPanel });
    ctx.commands.register({
      id: "publishing.open",
      title: "Publish this document",
      icon: <GlobeRegular />,
      group: "Document",
      scope: "document",
      when: () =>
        app.services?.account?.scope.kind === "hosted" && docIdOf(app.activeTab()?.path) !== null,
      run: () => app.panels.show("publishing"),
    });
    // Connected folders show their destination's icon in the tree.
    return watchFolderMarks(app);
  },
});

export default publishingPlugin;
