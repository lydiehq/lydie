// A folder's settings (Settings → Files & links), stored in `.lydie/workspace.json` next to the
// workspace id, so they travel with the folder. Unset ones fall back to the folder's Obsidian
// settings (read-only: Lydie never writes `.obsidian/`), then to Lydie's defaults.
//
// The bridge applies `attachmentsFolder` and `exclude` (what it indexes and where attachments go);
// the others are for the app (where new notes go, how links are written).
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { WorkspaceConfig } from "./meta.ts";
import { META_DIR, TRASH_DIR } from "./paths.ts";

// How new links are written: `[[Note]]` or `[Note](Note.md)`.
export type LinkFormat = "wiki" | "markdown";
// How new links name their target (Obsidian's "New link format").
export type LinkPath = "shortest" | "relative" | "absolute";
export type NewNoteLocation = "root" | "current" | "folder";
// What keeps version history of note bodies: snapshots beside the folder's database (the
// default), git commits of the folder (for people who turn it on), or nothing.
export type VersionHistory = "snapshots" | "git" | "off";

export type FolderSettings = {
  // Where new attachments go ("" = the folder's top level). Its files are not indexed as notes.
  attachmentsFolder: string;
  // Ignore patterns (gitignore-like) for notes Lydie does not index.
  exclude: string[];
  // Where "New note" creates: the top level, next to the current note, or `newNoteFolder`.
  newNoteLocation: NewNoteLocation;
  newNoteFolder: string | null;
  linkFormat: LinkFormat;
  linkPath: LinkPath;
  versionHistory: VersionHistory;
};

// A change: each field set replaces the stored value; null clears it (back to the default).
export type FolderSettingsPatch = {
  [K in keyof FolderSettings]?: FolderSettings[K] | null;
};

export const SETTING_KEYS = [
  "attachmentsFolder",
  "exclude",
  "newNoteLocation",
  "newNoteFolder",
  "linkFormat",
  "linkPath",
  "versionHistory",
] as const satisfies readonly (keyof FolderSettings)[];

const LINK_FORMATS: readonly LinkFormat[] = ["wiki", "markdown"];
const LINK_PATHS: readonly LinkPath[] = ["shortest", "relative", "absolute"];
const LOCATIONS: readonly NewNoteLocation[] = ["root", "current", "folder"];
const VERSION_HISTORIES: readonly VersionHistory[] = ["snapshots", "git", "off"];
const RESERVED = [META_DIR, TRASH_DIR, ".obsidian"];

export class SettingsError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(`${field}: ${message}`);
    this.name = "SettingsError";
  }
}

// A vault-relative folder ("" = top level when `allowRoot`). Returns the cleaned path.
export function checkFolder(field: string, value: unknown, allowRoot = false): string {
  if (typeof value !== "string") throw new SettingsError(field, "expected a folder path");
  const clean = value.trim().replace(/^\/+|\/+$/g, "");
  if (clean === "") {
    if (allowRoot) return "";
    throw new SettingsError(field, "expected a folder, not the top level");
  }
  if (clean.length > 500) throw new SettingsError(field, "path too long");
  if (/[\\\0:]/.test(clean)) throw new SettingsError(field, "use / and plain folder names");
  const parts = clean.split("/");
  if (parts.some((p) => p === "" || p === "." || p === ".." || p.trim() !== p)) {
    throw new SettingsError(field, "not a folder inside this folder");
  }
  if (RESERVED.includes(parts[0]!)) throw new SettingsError(field, `${parts[0]} is reserved`);
  return clean;
}

// Validates and normalises a patch. Throws SettingsError naming the first bad field.
export function checkPatch(patch: unknown): FolderSettingsPatch {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new SettingsError("settings", "expected an object");
  }
  const input = patch as Record<string, unknown>;
  const out: FolderSettingsPatch = {};
  for (const key of Object.keys(input)) {
    if (!(SETTING_KEYS as readonly string[]).includes(key)) {
      throw new SettingsError(key, "unknown setting");
    }
  }
  const has = (k: string) => Object.hasOwn(input, k) && input[k] !== undefined;
  if (has("attachmentsFolder")) {
    out.attachmentsFolder =
      input.attachmentsFolder === null
        ? null
        : checkFolder("attachmentsFolder", input.attachmentsFolder, true);
  }
  if (has("newNoteFolder")) {
    out.newNoteFolder =
      input.newNoteFolder === null ? null : checkFolder("newNoteFolder", input.newNoteFolder);
  }
  if (has("exclude")) {
    const list = input.exclude;
    if (list === null) out.exclude = null;
    else {
      if (!Array.isArray(list) || list.length > 200) {
        throw new SettingsError("exclude", "expected at most 200 patterns");
      }
      out.exclude = list
        .map((p, i) => {
          if (typeof p !== "string" || p.length > 500 || p.includes("\0")) {
            throw new SettingsError(`exclude[${i}]`, "expected a pattern");
          }
          return p.trim();
        })
        .filter((p) => p !== "");
    }
  }
  const oneOf = <T extends string>(k: keyof FolderSettings, values: readonly T[]) => {
    if (!has(k)) return;
    const v = input[k];
    if (v !== null && !values.includes(v as T)) {
      throw new SettingsError(k, `expected one of ${values.join(", ")}`);
    }
    (out as Record<string, unknown>)[k] = v;
  };
  oneOf("newNoteLocation", LOCATIONS);
  oneOf("linkFormat", LINK_FORMATS);
  oneOf("linkPath", LINK_PATHS);
  oneOf("versionHistory", VERSION_HISTORIES);
  return out;
}

// The folder's Obsidian settings Lydie reads as defaults.
export type ObsidianDefaults = Partial<FolderSettings>;

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function obsidianDefaults(root: string): Promise<ObsidianDefaults> {
  const dir = join(root, ".obsidian");
  const app = await readJson(join(dir, "app.json"));
  const out: ObsidianDefaults = {};
  const folder = (value: unknown, allowRoot = false) => {
    try {
      return typeof value === "string" ? checkFolder("", value, allowRoot) : null;
    } catch {
      return null;
    }
  };
  const attachments = folder(app?.attachmentFolderPath);
  if (attachments) out.attachmentsFolder = attachments;
  const location = app?.newFileLocation;
  if (location === "root" || location === "current" || location === "folder") {
    out.newNoteLocation = location;
  }
  const newFolder = folder(app?.newFileFolderPath);
  if (newFolder) out.newNoteFolder = newFolder;
  if (LINK_PATHS.includes(app?.newLinkFormat as LinkPath)) {
    out.linkPath = app!.newLinkFormat as LinkPath;
  }
  if (typeof app?.useMarkdownLinks === "boolean") {
    out.linkFormat = app.useMarkdownLinks ? "markdown" : "wiki";
  }
  return out;
}

export const DEFAULT_SETTINGS: FolderSettings = {
  attachmentsFolder: "attachments",
  exclude: [],
  newNoteLocation: "root",
  newNoteFolder: null,
  linkFormat: "wiki",
  linkPath: "shortest",
  versionHistory: "snapshots",
};

// Stored values, then Obsidian's, then the defaults.
export function effectiveSettings(
  config: WorkspaceConfig,
  obsidian: ObsidianDefaults,
): FolderSettings {
  const out = { ...DEFAULT_SETTINGS, ...obsidian } as FolderSettings;
  for (const key of SETTING_KEYS) {
    const stored = config[key];
    if (stored !== undefined) (out as Record<string, unknown>)[key] = stored;
  }
  if (out.newNoteLocation === "folder" && !out.newNoteFolder) out.newNoteLocation = "root";
  return out;
}

// Applies a checked patch to the stored config (null removes the key).
export function applyPatch(config: WorkspaceConfig, patch: FolderSettingsPatch): WorkspaceConfig {
  const next: Record<string, unknown> = { ...config };
  for (const key of SETTING_KEYS) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value === null || value === undefined) delete next[key];
    else next[key] = value;
  }
  return next as WorkspaceConfig;
}
