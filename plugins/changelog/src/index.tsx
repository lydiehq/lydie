import { definePlugin } from "@lydie/plugin-api";
import { QuestionRegular } from "@lydie/plugin-api/ui";

import { ChangelogButton } from "./ChangelogButton.tsx";
import { ChangelogView } from "./ChangelogView.tsx";

export const changelogPlugin = definePlugin({
  id: "changelog",
  name: "Changelog",
  description: "What's new in Lydie, from the sidebar's footer.",
  activate(ctx) {
    for (const path of ["/changelog", "/changelog/:id"]) {
      ctx.views.register({
        path,
        component: ChangelogView,
        title: "What's new",
        icon: <QuestionRegular />,
      });
    }
    // Before the account plugin's item (order 0), which is the sync state in a cloud workspace.
    ctx.statusBar.register({ id: "changelog", order: -10, component: ChangelogButton });
    ctx.commands.register({
      id: "changelog.open",
      title: "What's new",
      icon: <QuestionRegular />,
      group: "Navigation",
      bindable: false,
      run: ({ app }) => app.open("/changelog", { mode: "tab" }),
    });
  },
});

export default changelogPlugin;
