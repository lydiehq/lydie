// Where a local window goes once the person has signed in. Signing in is mostly "take me to my
// notes": someone whose notes are in Lydie Cloud lands there. When pages were written or changed
// here meanwhile, they are asked, in those words, whether to move them along.
import type { AccountApi, AppApi, HostedWorkspaceSummary } from "@lydie/plugin-api";

import type { HandoffProps } from "./HandoffDialog.tsx";
import { readCloud, readCopied } from "./local-notice.ts";

// "Don't ask again" on the question below (per device).
export const NEVER_ASK_KEY = "account.bring.never";

export type AfterSignIn =
  // Reopen the window on this cloud workspace.
  | { kind: "open"; workspaceId: string }
  // Ask whether to move the `count` pages changed here to `cloud`; either answer ends there.
  | { kind: "ask"; cloud: HostedWorkspaceSummary; count: number }
  // Offer to put this workspace in the cloud, choosing where.
  | { kind: "handoff" }
  | { kind: "stay" };

export function afterSignIn(input: {
  // The caller asked for this workspace to go to the cloud (inviting people needs it there).
  then: "handoff" | null;
  // This window can put its workspace in the cloud (a local window, signed in).
  canHandoff: boolean;
  // The account's workspaces; null when they could not be listed.
  workspaces: readonly HostedWorkspaceSummary[] | null;
  // The cloud workspace this device opened last, or this workspace was copied to.
  remembered: string | null;
  // Pages here the cloud may lack; null when unknown (a folder).
  changed: number | null;
  // The person said not to ask about moving them.
  neverAsk: boolean;
}): AfterSignIn {
  const { workspaces } = input;
  if (!input.canHandoff) return { kind: "stay" };
  if (!workspaces) return input.then === "handoff" ? { kind: "handoff" } : { kind: "stay" };
  // A new account: the first thing to put in the cloud is what is here.
  if (workspaces.length === 0) return { kind: "handoff" };
  const cloud =
    workspaces.find((w) => w.id === input.remembered) ??
    workspaces.find((w) => w.role !== "guest") ??
    workspaces[0]!;
  // A folder: its files are the notes, and it has its own "Copy to cloud…".
  if (input.changed === null)
    return input.then === "handoff" ? { kind: "handoff" } : { kind: "stay" };
  if (input.changed === 0 || input.neverAsk) return { kind: "open", workspaceId: cloud.id };
  // Only someone who may write there can move pages into it.
  if (cloud.role === "guest") return { kind: "open", workspaceId: cloud.id };
  return { kind: "ask", cloud, count: input.changed };
}

// What the device knows for `afterSignIn`, then doing what it says.
export async function continueAfterSignIn(
  app: AppApi,
  api: AccountApi,
  options: { then: "handoff" | null; how: "sign-in" | "sign-up" },
): Promise<void> {
  const local = api.localWorkspaces().find((w) => w.current);
  const canHandoff = api.scope.kind === "local" && api.handoff !== null;
  const seen = readCloud(app);
  const copied = local ? readCopied(app, local.id) : null;
  const [workspaces, changed] = canHandoff
    ? await Promise.all([
        api.workspaces().catch(() => null),
        // Since a cloud workspace was last open on this device.
        api.handoff?.changedSince?.(seen?.at ?? null).catch(() => null) ?? null,
      ])
    : [null, null];
  const next = afterSignIn({
    then: options.then,
    canHandoff,
    workspaces,
    remembered: copied?.workspaceId ?? seen?.workspaceId ?? null,
    changed,
    neverAsk: app.storage.get<boolean>(NEVER_ASK_KEY) === true,
  });
  if (next.kind === "open") {
    await api.openScope({ kind: "hosted", workspaceId: next.workspaceId });
  } else if (next.kind === "ask") {
    app.overlays.open("account.handoff", {
      ask: { workspaceId: next.cloud.id, workspaceName: next.cloud.name, count: next.count },
    } satisfies HandoffProps);
  } else if (next.kind === "handoff") {
    app.overlays.open("account.handoff");
  } else {
    app.notify({ title: options.how === "sign-up" ? "Account created" : "Signed in" });
  }
}
