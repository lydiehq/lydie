import { definePlugin, docIdOf } from "@lydie/plugin-api";
import { GlobeRegular } from "@lydie/plugin-api/ui";

import { watchAdmin } from "./admin.ts";
import { ConnectionsPage } from "./ConnectionsPage.tsx";
import { watchFolderMarks } from "./folder-marks.ts";
import { PublishPanel } from "./PublishPanel.tsx";

export const publishingPlugin = definePlugin({
  id: "publishing",
  name: "Publishing",
  description: "Publish documents to GitHub, WordPress and webhooks.",
  permissions: ["account"],
  activate(ctx) {
    const { app } = ctx;
    const hosted = () => app.services?.account?.scope.kind === "hosted";
    const admin = watchAdmin(app);
    // The OAuth return address is /settings/connections, so the page id is fixed.
    ctx.settings.register({
      id: "connections",
      group: "Integrations",
      title: "Publishing",
      order: 10,
      description: "Destinations your documents are published to.",
      keywords: ["github", "wordpress", "webhook", "connect", "oauth", "token"],
      // Local windows keep the page, which explains that publishing needs a cloud workspace.
      when: () => !hosted() || admin.isAdmin(),
      component: ConnectionsPage,
    });
    ctx.panels.register({ id: "publishing", title: "Publish", order: 50, component: PublishPanel });
    ctx.commands.register({
      id: "publishing.open",
      title: "Publish this document",
      icon: <GlobeRegular />,
      group: "Document",
      scope: "document",
      when: () => hosted() && admin.isAdmin() && docIdOf(app.activeTab()?.path) !== null,
      run: () => app.panels.show("publishing"),
    });
    // Connected folders show their destination's icon in the tree.
    const unwatch = watchFolderMarks(app);
    return () => {
      unwatch();
      admin.stop();
    };
  },
});

export default publishingPlugin;
