import { useApp } from "@lydie/plugin-api";
import type { FolderSettings, FolderSettingsPatch } from "@lydie/plugin-api/hosted";
import {
  Button,
  EmptyState,
  Radio,
  RadioGroup,
  Select,
  SelectItem,
  SettingsCard,
  SettingsCardBlock,
  SettingsRow,
  SettingsSaveStatus,
  SettingsSection,
  SettingsSections,
  SettingsTextInput,
  TextArea,
  useSettingsSave,
} from "@lydie/plugin-api/ui";
import { useEffect, useState } from "react";

import { NewNoteSetting } from "../NewNoteSetting.tsx";

// Local-folder workspaces (desktop): where the folder is and how files and links are written.
export function FilesAndLinksPage() {
  const app = useApp();
  const vault = app.services?.vault;
  const [settings, setSettings] = useState<FolderSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vault?.settings) return;
    let live = true;
    vault.settings
      .get()
      .then((value) => live && setSettings(value))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    // Changes from another window (or this one) of the same folder.
    const off = vault.settings.subscribe((value) => live && setSettings(value));
    return () => {
      live = false;
      off();
    };
  }, [vault]);

  if (!vault) {
    return (
      <EmptyState
        title="No folder"
        description={
          app.workspace.mode === "synced"
            ? "This workspace lives in your account. Folder settings apply to workspaces opened from a folder in the desktop app."
            : "This workspace lives in your browser. Open a folder of Markdown files in the desktop app to use these settings."
        }
      />
    );
  }

  const save = async (patch: FolderSettingsPatch) => {
    if (!vault.settings) throw new Error("This version of the app cannot change folder settings");
    setSettings(await vault.settings.set(patch));
  };
  const editable = Boolean(vault.settings && settings);

  return (
    <SettingsSections>
      <SettingsSection title="Folder">
        <SettingsCard>
          <SettingsRow label="Location" description="Your notes are the Markdown files in it.">
            <code className="max-w-80 truncate rounded bg-gray-50 px-2 py-1 text-xs text-gray-700">
              {vault.folder}
            </code>
          </SettingsRow>
          <SettingsRow
            label="Attachments folder"
            htmlFor="settings-attachments-folder"
            description="Where pasted and dropped files are saved, inside the folder."
          >
            <SettingsTextInput
              id="settings-attachments-folder"
              value={settings?.attachmentsFolder ?? ""}
              placeholder="attachments"
              disabled={!editable}
              onSave={(attachmentsFolder) => save({ attachmentsFolder: attachmentsFolder.trim() })}
            />
          </SettingsRow>
        </SettingsCard>
        {!vault.settings && (
          <p className="text-xs text-gray-500">
            Attachments folder, excluded folders and link format are kept in the folder’s{" "}
            <code>.lydie/workspace.json</code>; this version of the desktop app cannot change them
            from here yet.
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-red-600">
            Could not read the folder settings: {error}
          </p>
        )}
      </SettingsSection>

      <SettingsSection
        title="Excluded folders"
        description="Files in these folders are not indexed or shown. One pattern per line, e.g. Archive/ or *.excalidraw.md."
      >
        <SettingsCard>
          <SettingsCardBlock>
            <ExcludedFolders
              key={(settings?.exclude ?? []).join("\n")}
              value={settings?.exclude ?? []}
              disabled={!editable}
              onSave={(exclude) => save({ exclude })}
            />
          </SettingsCardBlock>
        </SettingsCard>
      </SettingsSection>

      {vault.settings && (
        <SettingsSection title="New documents">
          <SettingsCard>
            <NewNoteSetting />
          </SettingsCard>
        </SettingsSection>
      )}

      <SettingsSection
        title="Links"
        description="How new links are written into your files. Kept with the folder, like Obsidian's “Files and links”."
      >
        <SettingsCard>
          <SettingsRow label="Link format">
            <RadioGroup
              aria-label="Link format"
              isDisabled={!editable}
              value={settings?.linkFormat ?? "wiki"}
              onChange={(value) => void save({ linkFormat: value as FolderSettings["linkFormat"] })}
            >
              <Radio value="wiki">Wiki links: [[Note]]</Radio>
              <Radio value="markdown">Markdown links: [Note](Note.md)</Radio>
            </RadioGroup>
          </SettingsRow>
          <SettingsRow label="Link path" description="How a link names the note it points to.">
            <Select
              aria-label="Link path"
              className="w-56"
              isDisabled={!editable}
              selectedKey={settings?.linkPath ?? "shortest"}
              onSelectionChange={(key) =>
                void save({ linkPath: key as FolderSettings["linkPath"] })
              }
            >
              {Object.entries(LINK_PATHS).map(([id, label]) => (
                <SelectItem key={id} id={id}>
                  {label}
                </SelectItem>
              ))}
            </Select>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        title="Version history"
        description="Earlier versions of your notes, in the History panel. Snapshots are kept on this device, outside the folder. Git commits the folder as you work, and makes it a repository if it is not one yet."
      >
        <SettingsCard>
          <SettingsRow label="Keep versions with">
            <Select
              aria-label="Keep versions with"
              className="w-56"
              isDisabled={!editable}
              selectedKey={settings?.versionHistory ?? "snapshots"}
              onSelectionChange={(key) =>
                // Git can refuse (not installed on this device): say so, the setting stays.
                void save({ versionHistory: key as FolderSettings["versionHistory"] }).catch(
                  (e: unknown) =>
                    app.notify({
                      title: "Could not change version history",
                      description: e instanceof Error ? e.message : String(e),
                      kind: "error",
                    }),
                )
              }
            >
              {Object.entries(VERSION_HISTORIES).map(([id, label]) => (
                <SelectItem key={id} id={id}>
                  {label}
                </SelectItem>
              ))}
            </Select>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
    </SettingsSections>
  );
}

const VERSION_HISTORIES: Record<FolderSettings["versionHistory"], string> = {
  snapshots: "Snapshots",
  git: "Git",
  off: "Off",
};

const LINK_PATHS: Record<FolderSettings["linkPath"], string> = {
  shortest: "Shortest path when possible",
  relative: "Relative to the note",
  absolute: "From the folder's top level",
};

function ExcludedFolders({
  value,
  disabled,
  onSave,
}: {
  value: readonly string[];
  disabled: boolean;
  onSave: (exclude: string[]) => Promise<unknown>;
}) {
  const state = useSettingsSave();
  const [draft, setDraft] = useState(value.join("\n"));
  const parsed = draft
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const changed = parsed.join("\n") !== value.join("\n");
  const submit = () => void state.save(() => onSave(parsed));
  return (
    <div className="flex flex-col gap-2">
      <TextArea
        aria-label="Excluded folders"
        rows={4}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.currentTarget.value)}
        className="font-mono text-xs"
      />
      <div className="flex items-center justify-end gap-2">
        <SettingsSaveStatus state={state} onRetry={submit} />
        <Button size="sm" isDisabled={disabled || !changed} onPress={submit}>
          Apply
        </Button>
      </div>
    </div>
  );
}
