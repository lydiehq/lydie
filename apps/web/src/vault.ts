// Desktop local-folder windows: the folder and its local MCP server, through the file bridge's
// vault service in the main process.
import { vaultService } from "@lydie/bridge-fs/service";
import type { McpStatus, VaultServiceContract } from "@lydie/bridge-fs/service";
import { serviceClient, toPlatformError } from "@lydie/platform";
import type { ServiceChannel, ServiceDefinition } from "@lydie/platform";
import type { Observable } from "@lydie/plugin-api";
import type { FolderSettings, McpServerStatus, VaultApi } from "@lydie/plugin-api/hosted";

const OFF: McpServerStatus = { running: false, url: null, tokenPath: null, error: null };

// The folder's settings in `.lydie/workspace.json`; null when the vault service predates them.
async function folderSettings(
  client: ReturnType<typeof serviceClient<VaultServiceContract>>,
): Promise<VaultApi["settings"]> {
  let current: FolderSettings;
  try {
    current = await client.request("settings", null);
  } catch {
    return null;
  }
  const listeners = new Set<(settings: FolderSettings) => void>();
  const update = (next: FolderSettings) => {
    current = next;
    for (const listener of [...listeners]) listener(next);
  };
  // The stream sends the current settings, then every change (from any window).
  client.subscribe("settings", null, update, () => {});
  return {
    get: async () => {
      update(await client.request("settings", null));
      return current;
    },
    current: () => current,
    // Rejects with the bridge's "<field>: <reason>", without the transport's code prefix.
    set: async (patch) => {
      try {
        update(await client.request("setSettings", patch));
        return current;
      } catch (error) {
        throw new Error(toPlatformError(error).detail);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// Null when this window has no folder (the service does not answer).
export async function createVaultApi(channel: ServiceChannel): Promise<VaultApi | null> {
  const client = serviceClient(
    channel,
    vaultService as unknown as ServiceDefinition<VaultServiceContract>,
  );
  let folder: string;
  try {
    folder = (await client.request("status", null)).folder;
  } catch {
    return null;
  }
  let status: McpServerStatus = OFF;
  const listeners = new Set<() => void>();
  const set = (next: McpStatus) => {
    status = { ...next };
    for (const listener of [...listeners]) listener();
  };
  client
    .request("mcpStatus", null)
    .then(set)
    .catch(() => {});
  client.subscribe("mcp", null, set, () => {});
  const observable: Observable<McpServerStatus> = {
    get: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    folder,
    mcp: {
      status: observable,
      async setEnabled(enabled) {
        const next = await client.request("mcpSetEnabled", { enabled });
        set(next);
        return status;
      },
    },
    settings: await folderSettings(client),
  };
}
