// Lydie's own files in the vault, under `.lydie/`. Portable (vault-relative, no device state), small,
// and only written when they change, so they are safe to sync with iCloud, Dropbox or git:
//
//   workspace.json    { version, workspaceId, ...folder settings (settings.ts) }
//   ids.json          { "<key>": "<id>" } ids that differ from the default rule (see ids.ts)
//   order.json        { "<folder key>": ["name", …] } manual sibling order, where it differs from
//                     the default name order ("" is the top level)
//   trash.json        { "<id>": TrashRecord } documents Lydie moved to `.trash/`
//   attachments.json  { "<id>": AttachmentRecord } attachments added through Lydie
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { uuidsForUlids } from "@lydie/contract";

import { atomicWrite, isMissing } from "./fs.ts";
import type { WriteHooks } from "./fs.ts";
import { META_DIR } from "./paths.ts";

// The folder settings (see settings.ts) are optional keys here; unset ones use their defaults.
export type WorkspaceConfig = {
  version: 1;
  workspaceId: string;
  attachmentsFolder?: string;
  exclude?: string[];
  newNoteLocation?: "root" | "current" | "folder";
  newNoteFolder?: string;
  linkFormat?: "wiki" | "markdown";
  linkPath?: "shortest" | "relative" | "absolute";
  versionHistory?: "snapshots" | "git" | "off";
};

export type TrashRecord = {
  // Key under `.trash/`.
  key: string;
  title: string;
  deletedAt: string;
  // Only for the root of a trashed subtree: where it goes back to.
  parentId?: string | null;
  sortKey?: string;
};

export type AttachmentRecord = {
  path: string;
  workspaceId: string;
  documentId: string | null;
  filename: string;
  contentType: string;
  size: number;
  sha256: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
};

export type MetaFiles = {
  ids: Record<string, string>;
  order: Record<string, string[]>;
  trash: Record<string, TrashRecord>;
  attachments: Record<string, AttachmentRecord>;
};

type MetaName = keyof MetaFiles;

const FILES: Record<MetaName, string> = {
  ids: "ids.json",
  order: "order.json",
  trash: "trash.json",
  attachments: "attachments.json",
};

async function readJson<T>(path: string): Promise<T | null> {
  try {
    // Files written before ids were UUIDs name them as ULIDs: read as the same ids.
    return JSON.parse(uuidsForUlids(await readFile(path, "utf8"))) as T;
  } catch (error) {
    if (isMissing(error)) return null;
    // A broken file (a sync conflict, a bad hand edit) is treated as absent rather than fatal; it
    // is only overwritten when Lydie next needs to change it.
    console.warn(`[bridge-fs] ignoring unreadable ${path}:`, (error as Error).message);
    return null;
  }
}

function sorted<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

const serialize = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export class VaultMeta {
  private written: Record<MetaName, string>;

  private constructor(
    private readonly dir: string,
    readonly files: MetaFiles,
    private readonly hooks: WriteHooks | undefined,
  ) {
    this.written = {
      ids: serialize(sorted(files.ids)),
      order: serialize(sorted(files.order)),
      trash: serialize(sorted(files.trash)),
      attachments: serialize(sorted(files.attachments)),
    };
  }

  static async load(root: string, hooks?: WriteHooks): Promise<VaultMeta> {
    const dir = join(root, META_DIR);
    const files: MetaFiles = {
      ids: (await readJson(join(dir, FILES.ids))) ?? {},
      order: (await readJson(join(dir, FILES.order))) ?? {},
      trash: (await readJson(join(dir, FILES.trash))) ?? {},
      attachments: (await readJson(join(dir, FILES.attachments))) ?? {},
    };
    const meta = new VaultMeta(dir, files, hooks);
    // Remember what is on disk byte for byte (absent files serialize as "{}").
    for (const name of Object.keys(FILES) as MetaName[]) {
      try {
        meta.written[name] = await readFile(join(dir, FILES[name]), "utf8");
      } catch {
        meta.written[name] = serialize({});
      }
    }
    return meta;
  }

  // Writes the files whose content changed. Empty records are not created.
  async flush(): Promise<void> {
    for (const name of Object.keys(FILES) as MetaName[]) {
      const text = serialize(sorted(this.files[name] as Record<string, unknown>));
      if (text === this.written[name]) continue;
      await atomicWrite(join(this.dir, FILES[name]), text, this.hooks);
      this.written[name] = text;
    }
  }
}

export async function loadWorkspaceConfig(root: string): Promise<WorkspaceConfig | null> {
  const config = await readJson<WorkspaceConfig>(join(root, META_DIR, "workspace.json"));
  return config && typeof config.workspaceId === "string" ? config : null;
}

export async function saveWorkspaceConfig(root: string, config: WorkspaceConfig): Promise<void> {
  await atomicWrite(join(root, META_DIR, "workspace.json"), serialize(config));
}

// Obsidian's attachment folder (`.obsidian/app.json` `attachmentFolderPath`), if it is a plain
// vault folder. Read-only: Lydie never writes `.obsidian/`.
export async function obsidianAttachmentFolder(root: string): Promise<string | null> {
  const app = await readJson<{ attachmentFolderPath?: unknown }>(
    join(root, ".obsidian", "app.json"),
  );
  const path = app?.attachmentFolderPath;
  if (typeof path !== "string") return null;
  const clean = path.replace(/^\/+|\/+$/g, "");
  if (!clean || clean.startsWith(".") || clean.includes("..")) return null;
  return clean;
}
