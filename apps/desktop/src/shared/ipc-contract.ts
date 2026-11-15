import { isAccelerator } from "@lydie/platform";
import type {
  AppLockState,
  DownloadProgress,
  DownloadResult,
  FileChange,
  FileEntry,
  FileStat,
  FolderRef,
  MenuItem,
  PickedFile,
  RecentFolder,
  ScreenCaptureState,
  TrackpadScroll,
  UpdateState,
  WindowState,
} from "@lydie/platform";
// The one IPC contract between the main process and the preload. Each invoke channel has a zod
// schema for its input (the main process parses every payload with it) and a phantom output type.
// The preload imports this file with `import type` only, so zod stays out of the sandboxed bundle.
import { z } from "zod";

type Channel<I extends z.ZodType, O> = { input: I; output: O };

function channel<O = void>() {
  return <I extends z.ZodType>(input: I): Channel<I, O> => ({ input, output: undefined as O });
}

const path = z.string().max(4096);
const none = z.object({}).strict();
// Typed arrays survive structured clone as Uint8Array.
const bytes = z.custom<Uint8Array>((value) => value instanceof Uint8Array, "Expected bytes");
const MAX_TEXT = 256 * 1024 * 1024;

const writeOptions = {
  createParents: z.boolean().optional(),
  expectedMtime: z.number().finite().optional(),
};

const fileFilter = z
  .object({
    name: z.string().max(200),
    extensions: z.array(z.string().regex(/^(\*|[a-zA-Z0-9]{1,16})$/)).max(50),
  })
  .strict();

const menuRole = z.enum([
  "undo",
  "redo",
  "cut",
  "copy",
  "paste",
  "pasteAndMatchStyle",
  "selectAll",
  "delete",
  "minimize",
  "close",
  "quit",
  "about",
  "hide",
  "hideOthers",
  "unhide",
  "front",
  "zoom",
  "togglefullscreen",
  "toggleDevTools",
  "reload",
  "resetZoom",
  "zoomIn",
  "zoomOut",
  "appMenu",
  "fileMenu",
  "editMenu",
  "viewMenu",
  "windowMenu",
]);

export const menuItemSchema: z.ZodType<MenuItem> = z.lazy(() =>
  z.union([
    z.object({ type: z.literal("separator") }).strict(),
    z
      .object({
        type: z.enum(["normal", "checkbox"]).optional(),
        id: z.string().max(200).optional(),
        label: z.string().max(200).optional(),
        role: menuRole.optional(),
        accelerator: z
          .string()
          .max(100)
          .regex(/^[\w+\-=[\];',./`\\]+$/)
          .optional(),
        enabled: z.boolean().optional(),
        checked: z.boolean().optional(),
        submenu: z.array(menuItemSchema).max(100).optional(),
      })
      .strict(),
  ]),
);

const folderRef = z
  .object({ id: z.string().max(4096), name: z.string().max(1024), path: path.optional() })
  .strict();

export const scopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z.object({ kind: z.literal("local"), folder: folderRef }).strict(),
  z
    .object({
      kind: z.literal("hosted"),
      serverUrl: z.url({ protocol: /^https?$/ }),
      accountId: z.string().min(1).max(200),
    })
    .strict(),
]);

const accelerator = z.string().max(100).refine(isAccelerator, "Not a shortcut");

// A route object the app defines (a tab route); bounded so it fits a renderer argument.
const MAX_ROUTE = 16 * 1024;
const windowRoute = z
  .record(z.string().max(200), z.json())
  .refine((route) => JSON.stringify(route).length <= MAX_ROUTE, "Route too large");

const secretKey = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[\w.:@-]+$/);

const serviceName = z
  .string()
  .max(100)
  .regex(/^[a-z][a-z0-9-]*$/);
const memberName = z
  .string()
  .max(100)
  .regex(/^[a-zA-Z][\w-]*$/);
const subscriptionId = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[\w-]+$/);

export const invokeContract = {
  "folders:pick": channel<FolderRef | null>()(
    z.object({ title: z.string().max(200).optional() }).strict(),
  ),
  "folders:recent": channel<RecentFolder[]>()(none),
  "folders:forget": channel()(z.object({ id: z.string().max(4096) }).strict()),

  "fs:stat": channel<FileStat | null>()(z.object({ path }).strict()),
  "fs:list": channel<FileEntry[]>()(z.object({ path, recursive: z.boolean().optional() }).strict()),
  "fs:read-text": channel<string>()(z.object({ path }).strict()),
  "fs:read-bytes": channel<Uint8Array>()(z.object({ path }).strict()),
  "fs:write-text": channel<FileStat>()(
    z.object({ path, content: z.string().max(MAX_TEXT), ...writeOptions }).strict(),
  ),
  "fs:write-bytes": channel<FileStat>()(
    z.object({ path, content: bytes, ...writeOptions }).strict(),
  ),
  "fs:mkdir": channel()(z.object({ path }).strict()),
  "fs:rename": channel()(
    z.object({ from: path, to: path, overwrite: z.boolean().optional() }).strict(),
  ),
  "fs:delete": channel()(
    z.object({ path, recursive: z.boolean().optional(), toTrash: z.boolean().optional() }).strict(),
  ),
  "fs:watch": channel()(none),
  "fs:unwatch": channel()(none),

  "dialogs:message": channel<number>()(
    z
      .object({
        type: z.enum(["none", "info", "warning", "error", "question"]).optional(),
        title: z.string().max(200).optional(),
        message: z.string().max(10_000),
        detail: z.string().max(10_000).optional(),
        buttons: z.array(z.string().max(100)).min(1).max(10).optional(),
        defaultId: z.number().int().min(0).optional(),
        cancelId: z.number().int().min(0).optional(),
      })
      .strict(),
  ),
  "dialogs:open-files": channel<PickedFile[]>()(
    z
      .object({
        title: z.string().max(200).optional(),
        multiple: z.boolean().optional(),
        filters: z.array(fileFilter).max(20).optional(),
      })
      .strict(),
  ),
  "dialogs:save-file": channel<boolean>()(
    z
      .object({
        defaultName: z.string().max(255),
        content: z.union([z.string().max(MAX_TEXT), bytes]),
        filters: z.array(fileFilter).max(20).optional(),
      })
      .strict(),
  ),

  // A hosted export or backup link, saved where the person picks (main/downloads.ts). `id`
  // names its `downloads:progress` events.
  "downloads:save": channel<DownloadResult>()(
    z
      .object({
        id: subscriptionId,
        url: z.string().max(8192),
        filename: z.string().min(1).max(255),
      })
      .strict(),
  ),

  "window:minimize": channel()(none),
  "window:toggle-maximize": channel()(none),
  "window:toggle-fullscreen": channel()(none),
  "window:close": channel()(none),
  "window:set-title": channel()(z.object({ title: z.string().max(500) }).strict()),
  "window:open": channel()(
    z
      .object({
        scope: scopeSchema,
        replace: z.boolean().optional(),
        route: windowRoute.optional(),
      })
      .strict(),
  ),

  // The page attached its first menu-action listener: actions queued until then.
  "menu:take-pending": channel<string[]>()(none),
  "menu:set-application": channel()(z.object({ items: z.array(menuItemSchema).max(50) }).strict()),
  "menu:popup": channel<string | null>()(
    z
      .object({
        items: z.array(menuItemSchema).max(100),
        position: z
          .object({ x: z.number().int().min(0), y: z.number().int().min(0) })
          .strict()
          .optional(),
      })
      .strict(),
  ),

  "shell:open-external": channel()(z.object({ url: z.string().max(8192) }).strict()),
  "app:set-color-scheme": channel()(
    z.object({ scheme: z.enum(["light", "dark", "system"]) }).strict(),
  ),
  "clipboard:read-text": channel<string>()(none),
  "clipboard:write": channel()(
    z
      .object({ text: z.string().max(MAX_TEXT), html: z.string().max(MAX_TEXT).optional() })
      .strict(),
  ),

  "secrets:get": channel<string | null>()(z.object({ key: secretKey }).strict()),
  "secrets:set": channel()(z.object({ key: secretKey, value: z.string().max(64 * 1024) }).strict()),
  "secrets:delete": channel()(z.object({ key: secretKey }).strict()),

  "updater:check": channel()(none),
  "updater:download": channel()(none),
  "updater:restart": channel()(none),

  "shortcuts:register": channel<boolean>()(z.object({ accelerator }).strict()),
  "shortcuts:unregister": channel()(z.object({ accelerator }).strict()),
  "shortcuts:quick-capture": channel<string | null>()(none),
  "shortcuts:set-quick-capture": channel<boolean>()(
    z.object({ accelerator: accelerator.nullable() }).strict(),
  ),

  // Privacy mode (LYD-382): keep every window out of screenshots and screen sharing.
  "privacy:screen-capture": channel<ScreenCaptureState>()(none),
  "privacy:set-screen-capture": channel()(z.object({ blocked: z.boolean() }).strict()),

  // The app lock (LYD-383, main/app-lock.ts).
  "app-lock:state": channel<AppLockState>()(none),
  "app-lock:set-up": channel()(
    z
      .object({
        secret: z.string().max(256),
        idleMinutes: z.number().int().min(1).max(1440).nullable(),
        touchId: z.boolean(),
      })
      .strict(),
  ),
  "app-lock:update": channel()(
    z
      .object({
        idleMinutes: z.number().int().min(1).max(1440).nullable().optional(),
        touchId: z.boolean().optional(),
      })
      .strict(),
  ),
  "app-lock:change-secret": channel<boolean>()(
    z.object({ current: z.string().max(256), secret: z.string().max(256) }).strict(),
  ),
  "app-lock:remove": channel<boolean>()(z.object({ current: z.string().max(256) }).strict()),
  "app-lock:lock": channel()(none),
  "app-lock:unlock": channel<boolean>()(z.object({ secret: z.string().max(256) }).strict()),
  "app-lock:unlock-touch-id": channel<boolean>()(none),

  // Links that arrived before this window listened.
  "deep-links:take": channel<string[]>()(none),

  "services:request": channel<unknown>()(
    z.object({ service: serviceName, method: memberName, input: z.unknown() }).strict(),
  ),
  "services:subscribe": channel()(
    z
      .object({ id: subscriptionId, service: serviceName, stream: memberName, params: z.unknown() })
      .strict(),
  ),
  "services:unsubscribe": channel()(z.object({ id: subscriptionId }).strict()),
} as const;

export type InvokeContract = typeof invokeContract;
export type InvokeChannel = keyof InvokeContract;
export type InvokeInput<C extends InvokeChannel> = z.input<InvokeContract[C]["input"]>;
export type InvokeOutput<C extends InvokeChannel> = InvokeContract[C]["output"];

export type ServiceEvent = { id: string; event: unknown } | { id: string; error: string };

// Main → renderer messages. Not validated in the renderer: the main process is trusted.
export type EventContract = {
  "workspace:changes": FileChange[];
  "window:state": WindowState;
  "menu:action": string;
  "deep-links:open": string;
  "updater:state": UpdateState;
  "app-lock:state": AppLockState;
  "services:event": ServiceEvent;
  // A global shortcut this window registered was pressed (the accelerator as registered).
  "shortcuts:triggered": string;
  // A trackpad scroll event with its phases (main/trackpad.ts), for two-finger swipes.
  "trackpad:scroll": TrackpadScroll;
  // How far a `downloads:save` has got.
  "downloads:progress": DownloadProgress & { id: string };
};

export type EventChannel = keyof EventContract;
