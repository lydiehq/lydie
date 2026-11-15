import { useApp, useDeviceSetting } from "@lydie/plugin-api";
import type { FolderSettings, VaultApi } from "@lydie/plugin-api";
import { Select, SelectItem, SettingsRow, SettingsTextInput } from "@lydie/plugin-api/ui";
import { useEffect, useState } from "react";

import { NEW_NOTE_LOCATIONS, newNoteLocationKey } from "./preferences.ts";
import type { NewNoteLocation } from "./preferences.ts";

const FOLDER_LOCATIONS: Record<FolderSettings["newNoteLocation"], string> = {
  root: "At the top level",
  current: "Next to the open document",
  folder: "In a folder",
};

// Where "New document" puts a document: kept with the folder in folder windows (like Obsidian's
// "Default location for new notes"), per workspace on this device elsewhere. Folder windows show it
// under Files & links, other windows under General.
export function NewNoteSetting() {
  const settings = useApp().services?.vault?.settings ?? null;
  return settings ? <FolderNewNote settings={settings} /> : <DeviceNewNote />;
}

function DeviceNewNote() {
  const app = useApp();
  const [where, setWhere] = useDeviceSetting<NewNoteLocation>(
    newNoteLocationKey(app.workspace.workspaceId),
    "root",
  );
  return (
    <SettingsRow
      label="New documents"
      description="Where “New document” puts them. Applies to this device."
    >
      <Select
        aria-label="Where new documents go"
        className="w-56"
        selectedKey={where}
        onSelectionChange={(key) => setWhere(key as NewNoteLocation)}
      >
        {Object.entries(NEW_NOTE_LOCATIONS).map(([id, label]) => (
          <SelectItem key={id} id={id}>
            {label}
          </SelectItem>
        ))}
      </Select>
    </SettingsRow>
  );
}

function FolderNewNote({ settings }: { settings: NonNullable<VaultApi["settings"]> }) {
  const [value, setValue] = useState(() => settings.current());
  const [error, setError] = useState<string | null>(null);
  // "In a folder" needs the folder: chosen first, saved together with it.
  const [choosingFolder, setChoosingFolder] = useState(false);
  useEffect(() => settings.subscribe(setValue), [settings]);
  const location = choosingFolder ? "folder" : value.newNoteLocation;
  const save = async (patch: Parameters<typeof settings.set>[0]) => {
    setError(null);
    setValue(await settings.set(patch));
  };
  return (
    <>
      <SettingsRow
        label="New documents"
        description="Where “New document” puts them. Kept with the folder."
      >
        <Select
          aria-label="Where new documents go"
          className="w-56"
          selectedKey={location}
          onSelectionChange={(key) => {
            const next = key as FolderSettings["newNoteLocation"];
            setChoosingFolder(next === "folder" && !value.newNoteFolder);
            if (next === "folder" && !value.newNoteFolder) return;
            void save({ newNoteLocation: next }).catch((e: unknown) =>
              setError(e instanceof Error ? e.message : String(e)),
            );
          }}
        >
          {Object.entries(FOLDER_LOCATIONS).map(([id, label]) => (
            <SelectItem key={id} id={id}>
              {label}
            </SelectItem>
          ))}
        </Select>
      </SettingsRow>
      {location === "folder" && (
        <SettingsRow
          label="Folder for new documents"
          htmlFor="settings-new-note-folder"
          description="A folder inside this one, e.g. Inbox or Notes/Drafts; made when missing."
        >
          <SettingsTextInput
            id="settings-new-note-folder"
            value={value.newNoteFolder ?? ""}
            placeholder="Inbox"
            onSave={async (folder) => {
              await save({ newNoteLocation: "folder", newNoteFolder: folder.trim() || null });
              setChoosingFolder(false);
            }}
          />
        </SettingsRow>
      )}
      {error && (
        <p role="alert" className="px-4 pb-2 text-xs text-red-600">
          {error}
        </p>
      )}
    </>
  );
}
