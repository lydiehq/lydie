import { useApp, useQuery } from "@lydie/plugin-api";
import { useAccount, useHostedQuery } from "@lydie/plugin-api/hosted";
import type { HostedApiError, Member, WorkspaceRole } from "@lydie/plugin-api/hosted";
import { Button, EmptyState, SyncIllustration } from "@lydie/plugin-api/ui";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";

import { membersSignature, onReturn } from "./refresh.ts";

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  guest: "Guest",
};

const ROLE_HELP: Record<WorkspaceRole, string> = {
  owner: "Everything, including billing and deleting the workspace",
  admin: "Manages members, invitations and teamspaces",
  member: "Sees open teamspaces and what is shared with them",
  guest: "Sees only the pages shared with them",
};

// While teamspaces are hidden (`teamspacesShown`).
const ROLE_HELP_WORKSPACE: Partial<Record<WorkspaceRole, string>> = {
  admin: "Manages members and invitations",
  member: "Sees the workspace's shared pages and what is shared with them",
};

export function roleHelp(role: WorkspaceRole, teamspaces: boolean): string {
  return (teamspaces ? undefined : ROLE_HELP_WORKSPACE[role]) ?? ROLE_HELP[role];
}

export function errorText(error: unknown): string {
  const e = error as HostedApiError | null;
  if (e?.kind === "network") return "Lydie cannot reach the server. Try again when you are online.";
  if (e?.code === "forbidden") return "You do not have permission to do that.";
  return e instanceof Error ? e.message : String(error);
}

// Runs a hosted change and reports a failure as a toast; resolves whether it worked.
export function useRun() {
  const app = useApp();
  return async (label: string, fn: () => Promise<unknown>): Promise<boolean> => {
    try {
      await fn();
      return true;
    } catch (error) {
      app.notify({ title: `Could not ${label}`, description: errorText(error), kind: "error" });
      return false;
    }
  };
}

// Fetches a hosted list again when the synced member rows change (someone accepted an invitation
// in another browser, left, or was changed) and when the person comes back to the window (what
// does not sync, such as invitations from another admin). The API lists are one call each and
// would otherwise stay as they were when the page opened.
export function useRefreshOnMemberChange(reload: () => Promise<void>, active = true) {
  const app = useApp();
  const rows = useQuery("workspace.members", { workspaceId: app.workspace.workspaceId });
  const signature = rows.isLoading ? null : membersSignature(rows.data);
  const seen = useRef<string | null>(null);
  const latest = useRef(reload);
  useLayoutEffect(() => {
    latest.current = reload;
  });
  useEffect(() => {
    if (!active || signature === null) return;
    if (seen.current !== null && seen.current !== signature) void latest.current();
    seen.current = signature;
  }, [active, signature]);
  useEffect(() => {
    if (!active) return;
    return onReturn(() => void latest.current(), { window, document });
  }, [active]);
}

// The workspace's members and the signed-in user's own membership.
export function useMembers() {
  const app = useApp();
  const { state } = useAccount();
  const query = useHostedQuery("member.list", { workspaceId: app.workspace.workspaceId });
  useRefreshOnMemberChange(query.reload);
  const members: Member[] = query.data?.members ?? [];
  const meId = state.status === "signed-out" ? null : state.user.id;
  const me = members.find((m) => m.userId === meId) ?? null;
  return { ...query, members, me, meId, canManage: me?.role === "owner" || me?.role === "admin" };
}

// Team settings exist only in a cloud workspace; elsewhere say how to get one.
export function HostedOnly({ children, what }: { children: ReactNode; what: string }) {
  const app = useApp();
  const { api, state } = useAccount();
  const signedOut = state.status === "signed-out";
  if (api && api.scope.kind === "hosted") return <>{children}</>;
  return (
    <EmptyState
      title={`${what} need a cloud workspace`}
      illustration={<SyncIllustration />}
      description="This workspace lives on this device only. Put it in Lydie Cloud to invite people and share pages."
      action={
        api ? (
          <Button
            size="sm"
            onPress={() =>
              signedOut
                ? app.overlays.open("account.signIn", { then: "handoff" })
                : app.overlays.open("account.handoff")
            }
          >
            {signedOut
              ? "Sign in to Lydie Cloud"
              : api.handoff?.discard
                ? "Move to cloud…"
                : "Copy to cloud…"}
          </Button>
        ) : undefined
      }
    />
  );
}

// People are drawn the same everywhere: their picture, or their cut of the mark.
export { Avatar } from "@lydie/plugin-api/ui";
