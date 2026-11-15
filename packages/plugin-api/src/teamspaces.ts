import type { TeamspaceRow } from "@lydie/contract";

import { useApp, useQuerySelect } from "./react.tsx";

// Teamspaces are hidden for the alpha: a hosted workspace's sidebar is one tree, as a folder's is,
// and new top-level pages go to its default teamspace, where every member is (the core's default;
// pages already private stay so, in the same tree). The data, the access
// rules and the teamspace operations (REST, MCP) are unchanged; this decides only what the client
// shows. true brings the teamspace UI back: a sidebar group per teamspace, Settings → Teamspaces,
// "Move to teamspace…", and teamspaces in the invitation and share dialogs.
export const TEAMSPACES_UI = false;

// The default teamspace's name while teamspaces are hidden.
export const WORKSPACE_SECTION = "Workspace";

type Space = Pick<TeamspaceRow, "name" | "isDefault">;

// Whether a workspace with these teamspaces (the `workspace.teamspaces` query) shows them: the
// switch, or a workspace that has more than its one default teamspace (made before they were
// hidden, or through the API), whose pages would otherwise have no place in the sidebar.
export function teamspacesShown(teamspaces: readonly Space[]): boolean {
  return TEAMSPACES_UI || teamspaces.length > 1 || teamspaces.some((t) => !t.isDefault);
}

// A teamspace's name in the UI: "Workspace" for the default one while teamspaces are hidden.
export function spaceName(teamspace: Space, shown: boolean): string {
  return !shown && teamspace.isDefault ? WORKSPACE_SECTION : teamspace.name;
}

// `teamspacesShown` for this window's workspace, live.
export function useTeamspacesShown(): boolean {
  const app = useApp();
  return useQuerySelect(
    "workspace.teamspaces",
    { workspaceId: app.workspace.workspaceId },
    (state) => teamspacesShown(state.data),
  );
}
