// Where a local window goes once the person has signed in. Signing in is mostly "take me to my
// notes": someone whose notes are in Lydie Cloud lands there, not in a dialog about copying this
// device's workspace. Only a local workspace with something the cloud may lack keeps the window.
import type { AccountApi, AppApi, HostedWorkspaceSummary } from "@lydie/plugin-api";

import { readCloud, readCopied, rememberCloud } from "./local-notice.ts";
import type { SeenCloudWorkspace } from "./local-notice.ts";

export type AfterSignIn =
  // Reopen the window on this cloud workspace.
  | { kind: "open"; workspaceId: string }
  // Offer to put this workspace in the cloud.
  | { kind: "handoff" }
  // Stay here; `cloud` is the workspace the local notice then points to.
  | { kind: "stay"; cloud: HostedWorkspaceSummary | null };

export function afterSignIn(input: {
  // The caller asked for this workspace to go to the cloud (inviting people needs it there).
  then: "handoff" | null;
  // This window can put its workspace in the cloud (a local window, signed in).
  canHandoff: boolean;
  // The account's workspaces; null when they could not be listed.
  workspaces: readonly HostedWorkspaceSummary[] | null;
  // The cloud workspace this device opened last, or this workspace was copied to.
  remembered: string | null;
  // Whether this workspace holds something the cloud may lack; null when unknown.
  hasNews: boolean | null;
}): AfterSignIn {
  const { workspaces } = input;
  if (!input.canHandoff) return { kind: "stay", cloud: null };
  if (!workspaces)
    return input.then === "handoff" ? { kind: "handoff" } : { kind: "stay", cloud: null };
  // A new account: the first thing to put in the cloud is what is here.
  if (workspaces.length === 0) return { kind: "handoff" };
  const cloud =
    workspaces.find((w) => w.id === input.remembered) ??
    workspaces.find((w) => w.role !== "guest") ??
    workspaces[0]!;
  if (input.hasNews === false) return { kind: "open", workspaceId: cloud.id };
  if (input.then === "handoff") return { kind: "handoff" };
  return { kind: "stay", cloud };
}

// What the device knows for `afterSignIn`, then doing what it says.
export async function continueAfterSignIn(
  app: AppApi,
  api: AccountApi,
  options: { then: "handoff" | null; how: "sign-in" | "sign-up" },
): Promise<void> {
  const local = api.localWorkspaces().find((w) => w.current);
  const canHandoff = api.scope.kind === "local" && api.handoff !== null;
  const seen: SeenCloudWorkspace | null = readCloud(app);
  const copied = local ? readCopied(app, local.id) : null;
  const [workspaces, hasNews] = canHandoff
    ? await Promise.all([
        api.workspaces().catch(() => null),
        // Since a cloud workspace was last open here; before that, anything besides the
        // Getting started page.
        api.handoff?.hasNews?.(seen?.at ?? null).catch(() => null) ?? null,
      ])
    : [null, null];
  const next = afterSignIn({
    then: options.then,
    canHandoff,
    workspaces,
    remembered: copied?.workspaceId ?? seen?.workspaceId ?? null,
    hasNews,
  });
  if (next.kind === "open") {
    await api.openScope({ kind: "hosted", workspaceId: next.workspaceId });
    return;
  }
  if (next.kind === "handoff") {
    app.overlays.open("account.handoff");
    return;
  }
  // For the local notice: which cloud workspace there is to go to.
  if (next.cloud && !seen) {
    rememberCloud(app, { workspaceId: next.cloud.id, name: next.cloud.name, at: null });
  }
  app.notify({ title: options.how === "sign-up" ? "Account created" : "Signed in" });
}
