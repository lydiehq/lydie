import { afterEach, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { backendService } from "@lydie/app/backend";
import { openVault, vaultService } from "@lydie/bridge-fs";
import type { Vault, VaultStatus } from "@lydie/bridge-fs";

import { ServiceRegistry } from "./services.ts";
import { registerVaultServices, VaultManager } from "./vaults.ts";

const dirs: string[] = [];
let manager: VaultManager | null = null;

afterEach(async () => {
  await manager?.closeAll();
  manager = null;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function setup() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "lydie-vaults-")));
  dirs.push(base);
  const folder = join(base, "vault");
  mkdirSync(folder);
  writeFileSync(join(folder, "Note.md"), "hello\n");
  const dataDir = join(base, "user-data");
  manager = new VaultManager({ dataDir });
  return { folder, dataDir, manager };
}

test("one vault per folder, shared by windows, closed with the last one", async () => {
  const { folder, dataDir, manager } = setup();
  const a = await manager.acquire(folder, "window-a");
  const b = await manager.acquire(folder, "window-b");
  expect(a).toBe(b);
  // The database is in userData, not in the folder.
  expect(readdirSync(join(dataDir, "workspaces")).some((n) => n.endsWith(".sqlite"))).toBe(true);
  expect(readdirSync(folder).sort()).toEqual([".lydie", "Note.md"]);
  await manager.release("window-a");
  expect(manager.open()).toEqual([folder]);
  await manager.release("window-b");
  expect(manager.open()).toEqual([]);
  expect(a.vault.status().state).toBe("closed");
});

test("services are routed to the calling window's vault", async () => {
  const { folder, manager } = setup();
  const services = new ServiceRegistry();
  registerVaultServices(services, async (caller) => manager.acquire(folder, caller.windowId));
  const caller = { windowId: "w1" };
  const info = (await services.request(backendService.name, "info", null, caller)) as {
    workspaceId: string;
  };
  const created = (await services.request(
    backendService.name,
    "execute",
    {
      id: "doc.create",
      input: { workspaceId: info.workspaceId, title: "From IPC", markdown: "x\n" },
    },
    caller,
  )) as { ok: boolean };
  expect(created.ok).toBe(true);
  expect(readFileSync(join(folder, "From IPC.md"), "utf8")).toContain("x\n");

  const statuses: VaultStatus[] = [];
  const off = services.subscribe(
    vaultService.name,
    "status",
    null,
    (s) => statuses.push(s as VaultStatus),
    caller,
  );
  await new Promise((r) => setTimeout(r, 10));
  off();
  expect(statuses[0]).toMatchObject({ state: "ready", folder });
  expect(existsSync(join(folder, ".lydie/workspace.json"))).toBe(true);
});

test("document sessions keep their ordering fields through validation (LYD-254)", async () => {
  const { folder, manager } = setup();
  writeFileSync(join(folder, "Note.md"), "Alpha.\n");
  const services = new ServiceRegistry();
  registerVaultServices(services, async (caller) => manager.acquire(folder, caller.windowId));
  const caller = { windowId: "w1" };
  const { vault } = await manager.acquire(folder, "w1");
  const id = (await vault.store.listTree(vault.workspaceId))[0]!.id;
  const request = (method: string, input: unknown) =>
    services.request(vaultService.name, method, input, caller) as Promise<Record<string, unknown>>;
  const { session } = (await request("openDocument", { id })) as { session: string };
  writeFileSync(join(folder, "Note.md"), "Alpha, changed.\n");
  await request("rescan", { paths: ["Note.md"] });
  // version 0 is older than the steps just sent: the save is refused, not applied.
  const doc = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Alpha." }] }],
  };
  expect(await request("saveDocument", { session, doc, seq: 1, version: 0 })).toMatchObject({
    stale: true,
  });
  await request("closeDocument", { session });
});

test("quitting waits for a vault whose last window just closed", async () => {
  const { folder, manager } = setup();
  const host = await manager.acquire(folder, "only-window");
  void manager.release("only-window");
  // The slot is gone at once, the close is still running: still busy.
  expect(manager.open()).toEqual([]);
  expect(manager.busy()).toBe(true);
  await manager.closeAll();
  expect(manager.busy()).toBe(false);
  expect(host.vault.status().state).toBe("closed");
});

test("folder settings: read, change and stream through the vault service (LYD-265)", async () => {
  const { folder, manager } = setup();
  const services = new ServiceRegistry();
  registerVaultServices(services, async (caller) => manager.acquire(folder, caller.windowId));
  const caller = { windowId: "w1" };
  const request = (method: string, input: unknown) =>
    services.request(vaultService.name, method, input, caller) as Promise<Record<string, unknown>>;
  const seen: unknown[] = [];
  const off = services.subscribe(vaultService.name, "settings", null, (s) => seen.push(s), caller);
  expect(await request("settings", null)).toMatchObject({ attachmentsFolder: "attachments" });
  expect(await request("setSettings", { newNoteFolder: "Inbox" })).toMatchObject({
    newNoteFolder: "Inbox",
  });
  expect(readFileSync(join(folder, ".lydie/workspace.json"), "utf8")).toContain("Inbox");
  // Unknown fields and wrong shapes stop at the validator; bad paths at the bridge.
  await expect(request("setSettings", { theme: "dark" })).rejects.toThrow();
  await expect(request("setSettings", { linkFormat: "wikilink" })).rejects.toThrow();
  expect(await request("setSettings", { linkFormat: "markdown" })).toMatchObject({
    linkFormat: "markdown",
  });
  await expect(request("setSettings", { newNoteFolder: "../out" })).rejects.toThrow(
    /newNoteFolder/,
  );
  await new Promise((r) => setTimeout(r, 10));
  off();
  expect(seen.length).toBeGreaterThanOrEqual(2);
});

test("a window is served once the database is open; its writes wait for the index", async () => {
  const { folder, dataDir } = setup();
  // Indexing that only finishes when the test says so.
  let finishIndex = () => {};
  const indexing = new Promise<void>((resolve) => (finishIndex = resolve));
  manager = new VaultManager({
    dataDir,
    open: async (options) => {
      const vault = await openVault(options);
      const indexed = vault.indexed.then(() => indexing);
      return new Proxy(vault, {
        get: (target, key) => {
          if (key === "indexed") return indexed;
          const value = Reflect.get(target, key, target) as unknown;
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as Vault;
    },
  });
  const services = new ServiceRegistry();
  registerVaultServices(services, async (caller) =>
    manager!.acquireServing(folder, caller.windowId),
  );
  const caller = { windowId: "w1" };
  const info = (await services.request(backendService.name, "info", null, caller)) as {
    workspaceId: string;
  };
  let created = false;
  const creating = services
    .request(
      backendService.name,
      "execute",
      { id: "doc.create", input: { workspaceId: info.workspaceId, title: "Later" } },
      caller,
    )
    .then(() => (created = true));
  await Bun.sleep(50);
  expect(created).toBe(false);
  // Reads are answered meanwhile.
  expect(await services.request(backendService.name, "info", null, caller)).toMatchObject({
    workspaceId: info.workspaceId,
  });
  finishIndex();
  await creating;
  expect(created).toBe(true);
});
