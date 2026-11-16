// The data layer of local-folder windows: one vault (database + runtime + file bridge) per folder,
// shared by every window on that folder and closed when the last one closes. The database lives in
// `userData/workspaces/`, so nothing is written into the folder except `.lydie/`.
// Electron-free so it is unit-tested directly.
import { basename } from "node:path";

import { backendService, createLocalBackend, serveBackend } from "@lydie/app/backend";
import type { BackendContract, LocalBackend } from "@lydie/app/backend";
import { openVault, serveVault, vaultService } from "@lydie/bridge-fs";
import type {
  McpControl,
  OpenVaultOptions,
  Vault,
  VaultHandlers,
  VaultServiceContract,
} from "@lydie/bridge-fs";
import { operations } from "@lydie/contract";
import { PlatformError } from "@lydie/platform";
import type { ServiceContract, ServiceHandlers, Unsubscribe } from "@lydie/platform";
import type { Exports } from "@lydie/runtime";
import { unpackedAsar } from "@lydie/store/node";
import { z } from "zod";

import type { ServiceCaller, ServiceImplementation, ServiceRegistry } from "./services.ts";

export type VaultHost = {
  readonly folder: string;
  readonly vault: Vault;
  // Resolves when the folder is indexed (`vault.indexed`), also when indexing failed.
  readonly indexed: Promise<void>;
  readonly backend: LocalBackend;
  readonly backendHandlers: ServiceHandlers<BackendContract>;
  readonly vaultHandlers: VaultHandlers & { close(): void };
  readonly mcp: (McpControl & { close(): Promise<void> }) | null;
};

export type McpFactory = (vault: Vault) => McpControl & { close(): Promise<void> };

export type VaultManagerOptions = {
  // userData: databases go to `<dataDir>/workspaces/<hash of the folder path>.sqlite`.
  dataDir: string;
  // The local MCP server for a vault (started on demand by the UI).
  mcp?: McpFactory;
  open?: (options: OpenVaultOptions) => Promise<Vault>;
  // Where workspace.export saves a folder's zip.
  exports?: (folder: string) => Exports;
  onError?: (error: unknown) => void;
};

type Slot = {
  holders: Set<string>;
  // The database is open: windows are served (writes wait for the index).
  ready: Promise<VaultHost>;
  // The folder is indexed too.
  indexed: Promise<VaultHost>;
  close: () => Promise<void>;
};

export class VaultManager {
  private readonly slots = new Map<string, Slot>();
  private readonly holderFolder = new Map<string, string>();
  // Vaults being closed (the last window went away); quitting waits for them.
  private readonly closing = new Set<Promise<void>>();

  constructor(private readonly options: VaultManagerOptions) {}

  // The vault of `folder`, opened on first use and indexed; `holder` (a window id) keeps it open
  // until released.
  async acquire(folder: string, holder: string): Promise<VaultHost> {
    return this.slotFor(folder, holder).indexed;
  }

  // The same once its database is open, which can be long before the folder is indexed (a first
  // open, notes changed while the app was closed): windows are served from the database while
  // indexing runs, and their writes wait for it.
  acquireServing(folder: string, holder: string): Promise<VaultHost> {
    return this.slotFor(folder, holder).ready;
  }

  private slotFor(folder: string, holder: string): Slot {
    const previous = this.holderFolder.get(holder);
    if (previous && previous !== folder) void this.release(holder);
    let slot = this.slots.get(folder);
    if (!slot) {
      slot = this.openSlot(folder);
      this.slots.set(folder, slot);
    }
    slot.holders.add(holder);
    this.holderFolder.set(holder, folder);
    return slot;
  }

  async release(holder: string): Promise<void> {
    const folder = this.holderFolder.get(holder);
    if (!folder) return;
    this.holderFolder.delete(holder);
    const slot = this.slots.get(folder);
    if (!slot) return;
    slot.holders.delete(holder);
    if (slot.holders.size > 0) return;
    this.slots.delete(folder);
    await this.track(slot.close());
  }

  private track(done: Promise<void>): Promise<void> {
    this.closing.add(done);
    return done.finally(() => this.closing.delete(done));
  }

  // Whether vaults are open or still closing.
  busy(): boolean {
    return this.slots.size > 0 || this.closing.size > 0;
  }

  open(): string[] {
    return [...this.slots.keys()];
  }

  async closeAll(): Promise<void> {
    const slots = [...this.slots.values()];
    this.slots.clear();
    this.holderFolder.clear();
    await Promise.all([...slots.map((s) => this.track(s.close())), ...this.closing]);
  }

  private openSlot(folder: string): Slot {
    const onError = this.options.onError ?? ((error: unknown) => console.error("[vault]", error));
    const ready = (async (): Promise<VaultHost> => {
      const vault = await (this.options.open ?? openVault)({
        folder,
        dataDir: this.options.dataDir,
        // In a packaged app PowerSync's worker runs from app.asar.unpacked (its SQLite extension
        // must be a real file); elsewhere this changes nothing.
        store: { workerUrl: unpackedAsar },
        onError,
        gettingStarted: true,
        indexInBackground: true,
        ...(this.options.exports ? { exports: this.options.exports(folder) } : {}),
      });
      const indexed = vault.indexed.then(
        () => {},
        () => {},
      );
      const backend = createLocalBackend({
        store: vault.store,
        runtime: vault.runtime,
        blob: vault.blob,
        info: {
          workspaceId: vault.workspaceId,
          workspaceName: basename(folder),
          persistent: true,
          welcomeDocId: vault.gettingStartedId ?? null,
        },
        events: { port: { publish() {} }, subscribe: (listener) => vault.subscribe(listener) },
      });
      const mcp = this.options.mcp?.(vault) ?? null;
      return {
        folder,
        vault,
        indexed,
        backend,
        backendHandlers: afterIndex(serveBackend(backend), indexed),
        vaultHandlers: serveVault(vault, mcp ? { mcp } : {}),
        mcp,
      };
    })();
    return {
      holders: new Set(),
      ready,
      indexed: ready.then(async (host) => {
        await host.indexed;
        return host;
      }),
      close: async () => {
        try {
          const host = await ready;
          host.vaultHandlers.close();
          await host.mcp?.close();
          await host.backend.close();
          await host.vault.close();
        } catch (error) {
          onError(error);
        }
      },
    };
  }
}

// ---- Serving to windows

// Writes from windows wait for the folder's index: indexing compares the database with the folder,
// and a change committed meanwhile could read as out of date and be undone. Reads (queries, live
// queries, read-only operations) are answered from the database at once.
function afterIndex(
  handlers: ServiceHandlers<BackendContract>,
  indexed: Promise<void>,
): ServiceHandlers<BackendContract> {
  const r = handlers.requests;
  const writes =
    <I, O>(handle: (input: I) => O, when: (input: I) => boolean = () => true) =>
    async (input: I): Promise<Awaited<O>> => {
      if (when(input)) await indexed;
      return await handle(input);
    };
  const kinds = operations as Record<string, { kind: string } | undefined>;
  return {
    ...handlers,
    requests: {
      ...r,
      execute: writes(r.execute, ({ id }) => kinds[id]?.kind !== "query"),
      txBegin: writes(r.txBegin),
      undo: writes(r.undo),
      redo: writes(r.redo),
      attachmentAdd: writes(r.attachmentAdd),
    },
  };
}

type AnyHandlers = {
  requests: Record<string, (input: unknown) => unknown>;
  streams: Record<string, (params: unknown, emit: (event: unknown) => void) => Unsubscribe>;
};

// Routes a service's requests and streams to the handlers of the calling window's vault.
function routed<C extends ServiceContract>(
  schemas: Schemas<C>,
  handlersFor: (caller: ServiceCaller) => Promise<AnyHandlers>,
): ServiceImplementation<C> {
  const requests: Record<string, unknown> = {};
  for (const [method, input] of Object.entries(schemas.requests)) {
    requests[method] = {
      input,
      handle: async (value: unknown, caller: ServiceCaller) =>
        (await handlersFor(caller)).requests[method]!(value),
    };
  }
  const streams: Record<string, unknown> = {};
  for (const [stream, params] of Object.entries(schemas.streams)) {
    streams[stream] = {
      params,
      subscribe(value: unknown, emit: (event: unknown) => void, caller: ServiceCaller) {
        let off: Unsubscribe | null = null;
        let closed = false;
        handlersFor(caller).then(
          (handlers) => {
            if (!closed) off = handlers.streams[stream]!(value, emit);
          },
          (error: unknown) => console.error(`[vault] ${stream}:`, error),
        );
        return () => {
          closed = true;
          off?.();
        };
      },
    };
  }
  return { requests, streams } as unknown as ServiceImplementation<C>;
}

// One input schema per request and stream: `satisfies` makes a method added to a contract fail the
// type check until it has one.
type Schemas<C extends ServiceContract> = {
  requests: { [M in keyof C["requests"]]: z.ZodType };
  streams: { [S in keyof C["streams"]]: z.ZodType };
};

const opOptions = z
  .object({
    scope: z.string().optional(),
    coalesce: z.string().optional(),
    history: z.boolean().optional(),
    sessionId: z.string().optional(),
    label: z.string().optional(),
    // The token of a `progress` subscription (`onProgress` does not cross the wire).
    progress: z.string().optional(),
  })
  .optional();
const scopeInput = z.object({ scope: z.string().optional() });

const backendSchemas = {
  requests: {
    info: z.null(),
    status: z.null(),
    execute: z.object({ id: z.string().min(1), input: z.unknown(), options: opOptions }),
    txBegin: z.object({ label: z.string(), options: opOptions }),
    txExec: z.object({ tx: z.string(), id: z.string().min(1), input: z.unknown() }),
    txEnd: z.object({ tx: z.string(), ok: z.boolean() }),
    undo: scopeInput,
    redo: scopeInput,
    historyState: z.object({ scope: z.string() }),
    query: z.object({ name: z.string(), params: z.unknown() }),
    attachmentAdd: z.object({
      input: z.object({
        workspaceId: z.string(),
        documentId: z.string().nullable().optional(),
        filename: z.string().min(1),
        contentType: z.string().min(1),
        data: z.instanceof(Uint8Array),
      }),
      options: opOptions,
    }),
    attachmentRead: z.object({ id: z.string() }),
    attachmentRemoteUrl: z.object({ id: z.string() }),
    dismissRejected: z.object({ operationIds: z.array(z.string()).optional() }),
    layoutLoad: z.object({ id: z.string() }),
    layoutSave: z.object({ id: z.string(), layout: z.unknown() }),
  },
  streams: {
    live: z.object({ name: z.string(), params: z.unknown() }),
    history: z.null(),
    status: z.null(),
    progress: z.object({ token: z.string() }),
  },
} satisfies Schemas<BackendContract>;

const session = z.object({ session: z.string() });
const documentUpdate = z.object({
  session: z.string(),
  doc: z.unknown(),
  seq: z.number().int().min(0).optional(),
  version: z.number().int().min(0).optional(),
});
// Folder settings (LYD-265): shapes here; the bridge checks paths and values (`checkPatch`).
const folderPath = z.string().max(500).nullable().optional();
const settingsPatch = z
  .object({
    attachmentsFolder: folderPath,
    exclude: z.array(z.string().max(500)).max(200).nullable().optional(),
    newNoteLocation: z.enum(["root", "current", "folder"]).nullable().optional(),
    newNoteFolder: folderPath,
    linkFormat: z.enum(["wiki", "markdown"]).nullable().optional(),
    linkPath: z.enum(["shortest", "relative", "absolute"]).nullable().optional(),
  })
  .strict();

const vaultSchemas = {
  requests: {
    status: z.null(),
    rescan: z.object({ paths: z.array(z.string()).optional() }),
    pathOf: z.object({ id: z.string() }),
    openDocument: z.object({ id: z.string() }),
    // seq/version order updates against external-change steps (LYD-254).
    updateDocument: documentUpdate,
    saveDocument: documentUpdate,
    closeDocument: session,
    conflicts: z.null(),
    resolveConflict: z.object({ id: z.string() }),
    settings: z.null(),
    setSettings: settingsPatch,
    mcpStatus: z.null(),
    mcpSetEnabled: z.object({ enabled: z.boolean() }),
  },
  streams: {
    status: z.null(),
    externalChanges: z.null(),
    conflicts: z.null(),
    document: session,
    mcp: z.null(),
    settings: z.null(),
  },
} satisfies Schemas<VaultServiceContract>;

// Registers the backend (`@lydie/app/backend`) and vault (`@lydie/bridge-fs`) services. Each
// call is served by the vault of the calling window's folder.
export function registerVaultServices(
  services: ServiceRegistry,
  hostFor: (caller: ServiceCaller) => Promise<VaultHost>,
  // A window on a hosted workspace gets its backend from here (null: the folder's vault).
  hostedBackendFor?: (caller: ServiceCaller) => Promise<ServiceHandlers<BackendContract> | null>,
): void {
  services.register(
    backendService,
    routed<BackendContract>(
      backendSchemas,
      async (caller) =>
        ((await hostedBackendFor?.(caller)) ??
          (await hostFor(caller)).backendHandlers) as unknown as AnyHandlers,
    ),
  );
  services.register(
    vaultService as { name: string; contract?: VaultServiceContract },
    routed<VaultServiceContract>(
      vaultSchemas,
      async (caller) => (await hostFor(caller)).vaultHandlers as unknown as AnyHandlers,
    ),
  );
}

export function noFolder(): never {
  throw new PlatformError("not-found", "This window has no local folder");
}
