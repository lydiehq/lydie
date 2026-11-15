// For now publishing is for workspace owners and admins only (the server refuses everyone else).
// The role comes from the synced `workspace.members` rows.
import { useAccount, useApp, useQuerySelect } from "@lydie/plugin-api";
import type { AccountState, AppApi } from "@lydie/plugin-api";

type Members = { data: readonly { userId: string; role: string }[]; isLoading: boolean };

// null while the members are still loading.
export function adminIn(members: Members, account: AccountState): boolean | null {
  const me = account.status === "signed-out" ? null : account.user.id;
  const role = members.data.find((m) => m.userId === me)?.role;
  if (!role && members.isLoading) return null;
  return role === "owner" || role === "admin";
}

export function useIsAdmin(): boolean | null {
  const app = useApp();
  const { state } = useAccount();
  return useQuerySelect("workspace.members", { workspaceId: app.workspace.workspaceId }, (m) =>
    adminIn(m, state),
  );
}

// For the synchronous checks (the settings navigation, the command): the members, kept loaded
// while the plugin is active. Returns the check and the cleanup.
export function watchAdmin(app: AppApi): { isAdmin: () => boolean; stop: () => void } {
  const account = app.services?.account;
  if (!account || account.scope.kind !== "hosted") return { isAdmin: () => false, stop: () => {} };
  const members = app.backend.live("workspace.members", { workspaceId: app.workspace.workspaceId });
  const stop = members.subscribe(() => {});
  return {
    isAdmin: () => adminIn(members.getSnapshot(), account.state.get()) === true,
    stop,
  };
}
