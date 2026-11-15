import { definePlugin, useAccount, useApp, useObservable } from "@lydie/plugin-api";
import type { HostedWorkspaceSummary } from "@lydie/plugin-api";
import {
  AddRegular,
  Button,
  CloudRegular,
  ExitRegular,
  StatusBanner,
  User3Regular,
} from "@lydie/plugin-api/ui";
import { useEffect, useState } from "react";

import { AccountPage } from "./AccountPage.tsx";
import { continueAfterSignIn } from "./after-sign-in.ts";
import { CreateWorkspaceDialog } from "./CreateWorkspaceDialog.tsx";
import { HandoffDialog } from "./HandoffDialog.tsx";
import {
  DISMISSED_KEY,
  localNotice,
  readCloud,
  readCopied,
  rememberCloud,
} from "./local-notice.ts";
import { toCloud } from "./sign-up.ts";
import { SignInDialog } from "./SignInDialog.tsx";
import type { SignInProps } from "./SignInDialog.tsx";
import { AccountStatusItem } from "./SyncStatus.tsx";
import { WaitlistDialog } from "./WaitlistDialog.tsx";
import { AccountSection, WorkspaceSection } from "./WorkspaceSection.tsx";

export type { SignInProps } from "./SignInDialog.tsx";

// The account's other workspaces when this hosted one is no longer among them (the person was
// removed from it), else null. Checked on open, on focus, every minute and when the server refuses
// a change; unknown (null) while offline.
function useLostAccess(): HostedWorkspaceSummary[] | null {
  const { api, state } = useAccount();
  const details = useObservable(api?.sync?.details);
  const refused = details?.rejected.length ?? 0;
  const [others, setOthers] = useState<HostedWorkspaceSummary[] | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const again = () => setTick((n) => n + 1);
    window.addEventListener("focus", again);
    const timer = setInterval(again, 60_000);
    return () => {
      window.removeEventListener("focus", again);
      clearInterval(timer);
    };
  }, []);
  const workspaceId = api?.scope.kind === "hosted" ? api.scope.workspaceId : null;
  const signedIn = state.status === "signed-in";
  useEffect(() => {
    if (!api || !workspaceId || !signedIn) return;
    let live = true;
    api
      .workspaces()
      .then((list) => {
        if (!live) return;
        setOthers(list.some((w) => w.id === workspaceId) ? null : list);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, workspaceId, signedIn, refused, tick]);
  return others;
}

// In this browser's own workspace, on a device that has opened a cloud workspace: says that these
// notes are not that workspace, and offers the way there (`local-notice.ts`).
function LocalNotice() {
  const app = useApp();
  const { api, state } = useAccount();
  const [dismissed, setDismissed] = useState(() => app.storage.get<string>(DISMISSED_KEY));
  const local = api?.localWorkspaces().find((w) => w.current);
  // A folder is the person's own files, and plainly not the cloud.
  if (!api || local?.kind !== "browser") return null;
  const notice = localNotice({
    status: state.status,
    copied: readCopied(app, local.id),
    cloud: readCloud(app),
    dismissed,
  });
  if (!notice) return null;
  const dismiss = (
    <Button
      size="xs"
      variant="ghost"
      onPress={() => {
        app.storage.set(DISMISSED_KEY, notice.kind);
        setDismissed(notice.kind);
      }}
    >
      Dismiss
    </Button>
  );
  if (notice.kind === "signed-out") {
    return (
      <StatusBanner
        kind="warning"
        action={
          <>
            <Button
              size="xs"
              variant="secondary"
              onPress={() => app.overlays.open("account.signIn")}
            >
              Sign in
            </Button>
            {dismiss}
          </>
        }
      >
        You are signed out of Lydie Cloud. This is “{local.name}”, kept in this browser only: what
        you write here is not added to “{notice.cloud.name}”.
      </StatusBanner>
    );
  }
  return (
    <StatusBanner
      kind="info"
      action={
        <>
          <Button
            size="xs"
            variant="secondary"
            onPress={() =>
              void api.openScope({ kind: "hosted", workspaceId: notice.cloud.workspaceId })
            }
          >
            Open “{notice.cloud.name}”
          </Button>
          {api.handoff && (
            <Button size="xs" variant="ghost" onPress={() => app.overlays.open("account.handoff")}>
              {toCloud(api)}…
            </Button>
          )}
          {dismiss}
        </>
      }
    >
      {notice.kind === "copied"
        ? `This is “${local.name}” in this browser. It was copied to “${notice.cloud.name}” in Lydie Cloud, and what you change here is not added there.`
        : `This is “${local.name}”, kept in this browser only. “${notice.cloud.name}” is in Lydie Cloud.`}
    </StatusBanner>
  );
}

// Under the content of a hosted window, only for what needs the person: signed out, a refused
// session, or no longer a member of the workspace. Being offline is not here: nothing is at risk,
// and the sync item says so (in the tab row while the sidebar is collapsed). A local window gets
// `LocalNotice`.
export function HostedBanner() {
  const app = useApp();
  const { api } = useAccount();
  const details = useObservable(api?.sync?.details);
  const lost = useLostAccess();
  if (api?.scope.kind === "local") return <LocalNotice />;
  if (!details) return null;
  if (lost && api) {
    const next = lost[0];
    return (
      <StatusBanner
        kind="error"
        action={
          <Button
            size="xs"
            variant="secondary"
            onPress={() =>
              void api.openScope(
                next
                  ? { kind: "hosted", workspaceId: next.id }
                  : { kind: "local", workspaceId: null },
              )
            }
          >
            {next ? `Open ${next.name}` : "Open this device's notes"}
          </Button>
        }
      >
        You no longer have access to {app.workspace.workspaceName}. Changes made here are not saved
        to it. Pick another workspace from the workspace menu.
      </StatusBanner>
    );
  }
  if (details.state === "auth-expired" || details.state === "signed-out") {
    return (
      <StatusBanner
        kind="warning"
        action={
          <Button size="xs" variant="secondary" onPress={() => app.overlays.open("account.signIn")}>
            Sign in
          </Button>
        }
      >
        Your session ended. Changes are kept on this device until you sign in again.
      </StatusBanner>
    );
  }
  return null;
}

export const accountPlugin = definePlugin({
  id: "account",
  name: "Account and sync",
  description: "Sign in, switch workspaces and copy this device's notes to Lydie Cloud.",
  activate(ctx) {
    const { app } = ctx;
    const api = app.services?.account;
    if (!api) return;
    ctx.overlays.register({ id: "account.signIn", component: SignInDialog });
    ctx.overlays.register({ id: "account.waitlist", component: WaitlistDialog });
    ctx.overlays.register({ id: "account.handoff", component: HandoffDialog });
    ctx.overlays.register({ id: "account.createWorkspace", component: CreateWorkspaceDialog });
    ctx.workspaceMenu.register({ id: "workspaces", order: 10, component: WorkspaceSection });
    // After the settings plugin's row (order 90), so signing out is the menu's last row.
    ctx.workspaceMenu.register({ id: "account", order: 95, component: AccountSection });
    // For a local window on this device later: which cloud workspace there is to go back to.
    const hostedId = api.scope.kind === "hosted" ? api.scope.workspaceId : null;
    if (hostedId && api.state.get().status === "signed-in") {
      void api
        .workspaces()
        .then((list) => {
          const here = list.find((w) => w.id === hostedId && w.role !== "guest");
          if (here) {
            rememberCloud(app, {
              workspaceId: here.id,
              name: here.name,
              at: new Date().toISOString(),
            });
          }
        })
        .catch(() => {});
    }
    ctx.statusBar.register({
      id: "account",
      align: "left",
      order: 0,
      // In a hosted window this item is the sync indicator (with its details).
      replacesSyncIndicator: api.scope.kind === "hosted",
      component: AccountStatusItem,
    });
    ctx.settings.register({
      id: "account",
      group: "Account",
      title: "Account",
      order: 10,
      description: "Your account, sync and this device.",
      keywords: [
        "sign in",
        "sign out",
        "sync",
        "email",
        "password",
        "waitlist",
        "cloud",
        "two-step verification",
        "2fa",
        "authenticator",
        "devices",
        "sessions",
        "security",
      ],
      component: AccountPage,
    });
    ctx.commands.register({
      id: "account.signIn",
      title: "Sign in",
      icon: <User3Regular />,
      group: "Account",
      when: () => api.state.get().status !== "signed-in",
      run: () => app.overlays.open("account.signIn", {} satisfies SignInProps),
    });
    ctx.commands.register({
      id: "account.joinWaitlist",
      title: "Join the cloud waitlist",
      icon: <User3Regular />,
      group: "Account",
      when: () => api.state.get().status === "signed-out",
      run: () => app.overlays.open("account.waitlist"),
    });
    ctx.commands.register({
      id: "account.signOut",
      title: "Sign out",
      icon: <ExitRegular />,
      group: "Account",
      when: () => api.state.get().status !== "signed-out",
      run: () => api.signOut(),
    });
    ctx.commands.register({
      id: "account.handoff",
      title: api.handoff?.discard
        ? "Move this workspace to the cloud"
        : "Copy this workspace to the cloud",
      icon: <CloudRegular />,
      group: "Account",
      when: () => api.scope.kind === "local" && api.handoff !== null,
      run: () => app.overlays.open("account.handoff"),
    });
    ctx.commands.register({
      id: "account.newWorkspace",
      title: "New cloud workspace",
      icon: <AddRegular />,
      group: "Account",
      when: () => api.state.get().status === "signed-in",
      run: () => app.overlays.open("account.createWorkspace"),
    });
    // Back from signing in with Google (web): finish what the sign-in was for, or say why not.
    const returned = api.takeProviderReturn();
    if (returned) {
      queueMicrotask(() => {
        if (returned.error) {
          app.overlays.open("account.signIn", {
            error: returned.error,
            then: returned.then,
          } satisfies SignInProps);
        } else void continueAfterSignIn(app, api, { then: returned.then, how: "sign-in" });
      });
    }
    // The window was meant to open a hosted workspace: ask for the sign-in it needs.
    if (api.wanted && !returned) {
      queueMicrotask(() =>
        app.overlays.open("account.signIn", {
          reason:
            "Sign in to open your cloud workspace. Until then this window shows this browser's notes.",
        } satisfies SignInProps),
      );
    }
  },
});

export default accountPlugin;
