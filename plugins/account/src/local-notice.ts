// What a local window says about Lydie Cloud, so notes are not written in one place while the
// person believes they are in the other: after signing out of a cloud workspace the window shows
// this browser's own notes, and a workspace that was copied to the cloud stays behind as a copy
// that no longer follows it.
import type { AccountState, AppApi } from "@lydie/plugin-api";

type Storage = Pick<AppApi, "storage">;

export type CloudWorkspace = { workspaceId: string; name: string };
// `at`: when a window on this device last opened it (ISO). Null when it is only known from the
// account's list.
export type SeenCloudWorkspace = CloudWorkspace & { at: string | null };

// The cloud workspace opened last on this device.
const CLOUD_KEY = "account.cloud";
// Local workspace id → the cloud workspace it was copied to. One value, not a key per workspace:
// keys with a workspace id in them are carried to the cloud workspace by a hand-off.
const COPIED_KEY = "account.copied";
export const DISMISSED_KEY = "account.localNotice.dismissed";

export function readCloud(app: Storage): SeenCloudWorkspace | null {
  const cloud = app.storage.get<CloudWorkspace & { at?: string | null }>(CLOUD_KEY);
  return cloud ? { ...cloud, at: cloud.at ?? null } : null;
}

export function rememberCloud(app: Storage, cloud: SeenCloudWorkspace): void {
  app.storage.set(CLOUD_KEY, cloud);
}

export function readCopied(app: Storage, localWorkspaceId: string): CloudWorkspace | null {
  return app.storage.get<Record<string, CloudWorkspace>>(COPIED_KEY)?.[localWorkspaceId] ?? null;
}

export function rememberCopied(
  app: Storage,
  localWorkspaceId: string,
  target: { workspaceId: string; workspaceName: string },
): void {
  app.storage.set(COPIED_KEY, {
    ...app.storage.get<Record<string, CloudWorkspace>>(COPIED_KEY),
    [localWorkspaceId]: { workspaceId: target.workspaceId, name: target.workspaceName },
  });
}

export type LocalNotice = {
  // "signed-out": the account's notes are out of reach and this window is not them.
  // "copied": this workspace was copied to `cloud` and has gone its own way since.
  // "separate": signed in, with a cloud workspace this one was never copied to.
  kind: "signed-out" | "copied" | "separate";
  cloud: CloudWorkspace;
};

// Nothing on a device that never opened a cloud workspace: there is no other place to confuse
// this one with.
export function localNotice(input: {
  status: AccountState["status"];
  copied: CloudWorkspace | null;
  cloud: CloudWorkspace | null;
  // The kind the person dismissed last.
  dismissed: string | null;
}): LocalNotice | null {
  const cloud = input.copied ?? input.cloud;
  if (!cloud) return null;
  const kind = input.status !== "signed-in" ? "signed-out" : input.copied ? "copied" : "separate";
  return kind === input.dismissed ? null : { kind, cloud };
}
