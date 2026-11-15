import { definePlugin, teamspacesShown } from "@lydie/plugin-api";
import { ArrowRightUpRegular, UserAddRegular } from "@lydie/plugin-api/ui";

import { MembersPage } from "./MembersPage.tsx";
import { MoveToSpaceDialog } from "./MoveToSpaceDialog.tsx";
import { SpacesTree } from "./SpacesTree.tsx";
import { TeamspacesPage } from "./TeamspacesPage.tsx";

export const teamPlugin = definePlugin({
  id: "team",
  name: "Team",
  description: "Members and invitations of a cloud workspace, and its sections in the sidebar.",
  activate(ctx) {
    const { app } = ctx;
    const hosted = () => app.services?.account?.scope.kind === "hosted";
    // Whether teamspaces show (`teamspacesShown`), for the menus and the settings navigation, which
    // ask synchronously: the workspace's teamspaces, kept loaded while the plugin is active.
    const teamspaces = app.backend.live("workspace.teamspaces", {
      workspaceId: app.workspace.workspaceId,
    });
    const unwatch = teamspaces.subscribe(() => {});
    const shown = () => teamspacesShown(teamspaces.getSnapshot().data);
    ctx.settings.register({
      id: "members",
      group: "Team",
      title: "Members",
      order: 10,
      description: "Who is in this workspace, their roles, and invitations.",
      keywords: ["people", "invite", "roles", "admin", "guest", "owner", "transfer"],
      component: MembersPage,
    });
    ctx.settings.register({
      id: "teamspaces",
      group: "Team",
      title: "Teamspaces",
      order: 20,
      description: "Groups of pages and the people who work on them.",
      keywords: ["teams", "spaces", "visibility", "open", "closed", "private"],
      when: shown,
      component: TeamspacesPage,
    });
    ctx.overlays.register({ id: "team.moveToSpace", component: MoveToSpaceDialog });
    if (hosted()) {
      // The hosted workspace's pages grouped by space, in place of the flat tree.
      ctx.sidebar.register({
        id: "spaces",
        order: 10,
        fill: true,
        replaces: ["documents"],
        component: SpacesTree,
      });
    }
    // One dialog; the label says where a page can go.
    ctx.documentMenu.register({
      id: "team.moveToSpace",
      label: "Move to teamspace…",
      icon: <ArrowRightUpRegular />,
      group: "move",
      order: 50,
      when: (doc) => hosted() && doc.parentId === null && shown(),
      run: (doc) => app.overlays.open("team.moveToSpace", doc),
    });
    ctx.documentMenu.register({
      id: "team.moveToSection",
      label: "Move to Workspace or Private…",
      icon: <ArrowRightUpRegular />,
      group: "move",
      order: 50,
      when: (doc) => hosted() && doc.parentId === null && !shown(),
      run: (doc) => app.overlays.open("team.moveToSpace", doc),
    });
    ctx.commands.register({
      id: "team.invite",
      title: "Invite people",
      icon: <UserAddRegular />,
      group: "Team",
      when: () => hosted(),
      run: () => app.overlays.open("settings", { page: "members" }),
    });
    return unwatch;
  },
});

export default teamPlugin;
