// Small JSON state in userData: recent folders, the last workspace and window bounds. Written
// atomically and debounced.
import { readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { uuidsForUlids } from "@lydie/contract";
import type { RecentFolder } from "@lydie/platform";
import { z } from "zod";

const boundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().min(200),
  height: z.number().min(200),
  maximized: z.boolean().optional(),
});

const stateSchema = z.object({
  recentFolders: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        path: z.string().optional(),
        openedAt: z.number(),
      }),
    )
    .catch([]),
  // The workspace of the app window focused last, reopened on launch. "synced": the remembered
  // hosted workspace (account.json) decides.
  lastWorkspace: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("folder"), id: z.string() }),
      z.object({ kind: z.literal("synced") }),
    ])
    .optional()
    .catch(undefined),
  // Keyed by scope key (see `scopeKey`), so each folder reopens where it was.
  windowBounds: z.record(z.string(), boundsSchema).catch({}),
  // The quick-capture shortcut the user chose; null turns it off, absent means the default.
  quickCapture: z.string().max(100).nullable().optional().catch(undefined),
  // Privacy mode (LYD-382): windows are left out of screenshots, recordings and screen sharing.
  blockScreenCapture: z.boolean().catch(false),
});

export type WindowBounds = z.infer<typeof boundsSchema>;
export type AppState = z.infer<typeof stateSchema>;
export type LastWorkspace = NonNullable<AppState["lastWorkspace"]>;

const MAX_RECENT = 20;
const MAX_BOUNDS = 50;

export class StateStore {
  private state: AppState;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {
    let raw: unknown = {};
    try {
      raw = JSON.parse(uuidsForUlids(readFileSync(file, "utf8")));
    } catch {
      // First run or unreadable: start fresh.
    }
    const parsed = stateSchema.safeParse(raw);
    this.state = parsed.success
      ? parsed.data
      : { recentFolders: [], windowBounds: {}, blockScreenCapture: false };
  }

  recentFolders(): RecentFolder[] {
    return this.state.recentFolders;
  }

  addRecent(folder: { id: string; name: string; path?: string }) {
    const rest = this.state.recentFolders.filter((entry) => entry.id !== folder.id);
    this.state.recentFolders = [{ ...folder, openedAt: Date.now() }, ...rest].slice(0, MAX_RECENT);
    this.save();
  }

  forgetRecent(id: string) {
    this.state.recentFolders = this.state.recentFolders.filter((entry) => entry.id !== id);
    const last = this.state.lastWorkspace;
    if (last?.kind === "folder" && last.id === id) this.state.lastWorkspace = undefined;
    this.save();
  }

  lastWorkspace(): LastWorkspace | undefined {
    return this.state.lastWorkspace;
  }

  setLastWorkspace(workspace: LastWorkspace) {
    // Called on every focus: write only when it changes.
    if (JSON.stringify(this.state.lastWorkspace) === JSON.stringify(workspace)) return;
    this.state.lastWorkspace = workspace;
    this.save();
  }

  // The folder a plain launch reopens, or null to let the hosted preference decide. Before
  // `lastWorkspace` existed, the newest recent folder stands in unless a synced workspace is preferred.
  folderToRestore(prefersSynced: boolean): string | null {
    const last = this.state.lastWorkspace;
    if (last?.kind === "synced") return null;
    if (last) return this.state.recentFolders.some((f) => f.id === last.id) ? last.id : null;
    return prefersSynced ? null : (this.state.recentFolders[0]?.id ?? null);
  }

  bounds(key: string): WindowBounds | undefined {
    return this.state.windowBounds[key] ?? this.state.windowBounds["*"];
  }

  setBounds(key: string, bounds: WindowBounds) {
    const { [key]: _, ...rest } = this.state.windowBounds;
    const entries = Object.entries(rest).slice(-(MAX_BOUNDS - 2));
    // "*" is the last bounds of any window, used for scopes never opened before.
    this.state.windowBounds = { ...Object.fromEntries(entries), [key]: bounds, "*": bounds };
    this.save();
  }

  quickCaptureShortcut(): string | null | undefined {
    return this.state.quickCapture;
  }

  setQuickCaptureShortcut(accelerator: string | null) {
    this.state.quickCapture = accelerator;
    this.save();
  }

  blockScreenCapture(): boolean {
    return this.state.blockScreenCapture;
  }

  setBlockScreenCapture(blocked: boolean) {
    this.state.blockScreenCapture = blocked;
    this.save();
  }

  save() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 300);
  }

  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const data = JSON.stringify(this.state, null, 2);
    this.writing = this.writing.then(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      const temp = `${this.file}.tmp`;
      await writeFile(temp, data);
      await rename(temp, this.file);
    });
    return this.writing;
  }
}
