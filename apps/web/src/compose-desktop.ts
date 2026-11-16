// An Electron window: the main process holds the database (a folder's vault, or a hosted
// workspace's synced copy) and decides the window's scope once (apps/desktop/src/main/hosted.ts).
import { createRemoteBackend, createVaultDocuments } from "@lydie/app/backend";
import type { Platform, ServiceChannel } from "@lydie/platform";

import { ABOUT } from "./compose.ts";
import type { Composition } from "./compose.ts";
import { accountClient, desktopAccount, desktopCollab, NoWorkspaceError } from "./desktop.ts";
import { collabApi } from "./hosted.ts";
import { createVaultApi } from "./vault.ts";
import { takeWelcome } from "./welcome.ts";

export async function composeDesktop(
  injected: Platform,
  services: ServiceChannel,
): Promise<Composition> {
  const about = { ...ABOUT, version: injected.app.version, shell: "desktop" };
  const client = accountClient(services);
  const info = await client.request("scope", null).catch(() => null);
  if (info?.scope?.kind === "hosted") {
    const [backend, account, { colourFor }] = await Promise.all([
      createRemoteBackend(services),
      desktopAccount(client, info, injected),
      import("./hosted-lazy.ts"),
    ]);
    const state = account.state.get();
    const user = state.status === "signed-out" ? null : state.user;
    const collab = user
      ? await desktopCollab(client, backend, { id: user.id, name: user.name || user.email })
      : null;
    if (collab) void collab.pushPending().catch(() => {});
    return {
      platform: injected,
      backend,
      welcomeDocId: takeWelcome(info.scope.workspaceId),
      local: null,
      services: {
        account,
        about,
        ...(collab && user
          ? {
              collab: collabApi(collab, {
                name: user.name || user.email,
                color: colourFor(user.id),
              }),
            }
          : {}),
      },
    };
  }
  if (injected.scope.kind !== "local") {
    if (info) throw new NoWorkspaceError(injected, client, info);
    throw new Error("This window has no folder");
  }
  const [vault, backend, account] = await Promise.all([
    createVaultApi(services),
    createRemoteBackend(services, { documents: createVaultDocuments(services) }),
    info ? desktopAccount(client, info, injected) : null,
  ]);
  return {
    platform: injected,
    backend,
    // The main process wrote it into a new, empty folder.
    welcomeDocId: backend.info.welcomeDocId ?? null,
    local: null,
    services: {
      about,
      ...(vault ? { vault } : {}),
      ...(account ? { account } : {}),
    },
  };
}
