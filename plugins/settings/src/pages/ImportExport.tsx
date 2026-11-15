import { useApp, useContributions, useHostedQuery } from "@lydie/plugin-api";
import type { AppApi, ImporterDef } from "@lydie/plugin-api";
import {
  Button,
  Select,
  SelectItem,
  SettingsCard,
  SettingsCardEmpty,
  SettingsListItem,
  SettingsRow,
  SettingsSection,
  SettingsSections,
} from "@lydie/plugin-api/ui";
import { useState } from "react";

import { exportWorkspace, saveLink } from "../export.ts";
import type { SaveProgress } from "../export.ts";
import { ImportDialog } from "../ImportDialog.tsx";

type Frequency = "off" | "daily" | "weekly";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type ProgressButtonProps = {
  children: string;
  size: "xs" | "sm";
  variant?: "ghost";
  // What the button does, for screen readers ("Export", "Download the backup from …").
  label?: string;
  // What it says while busy ("Exporting").
  busyLabel: string;
  run: (onProgress: (progress: SaveProgress) => void) => Promise<void>;
};

// Runs `run` once at a time: a spinner until it reports progress, then the percentage, or the
// amount saved so far when the size is not known.
function ProgressButton({ children, size, variant, label, busyLabel, run }: ProgressButtonProps) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<SaveProgress | null>(null);
  const shown =
    progress === null
      ? null
      : "percent" in progress
        ? `${progress.percent}%`
        : formatSize(progress.received);
  return (
    <Button
      size={size}
      {...(variant ? { variant } : {})}
      className="min-w-16 tabular-nums"
      isPending={busy && shown === null}
      isDisabled={busy}
      aria-label={
        shown === null
          ? label
          : `${busyLabel}, ${shown}${progress && "percent" in progress ? " done" : " so far"}`
      }
      onPress={async () => {
        setBusy(true);
        try {
          await run(setProgress);
        } finally {
          setBusy(false);
          setProgress(null);
        }
      }}
    >
      {shown ?? children}
    </Button>
  );
}

function ExportRow() {
  const app = useApp();
  return (
    <SettingsRow
      label="Export workspace"
      description="Every page, database and file you can see, as a zip of Markdown files. It opens in Lydie and Obsidian."
    >
      <ProgressButton
        size="sm"
        busyLabel="Exporting"
        run={(onProgress) => exportWorkspace(app, { onProgress })}
      >
        Export
      </ProgressButton>
    </SettingsRow>
  );
}

function HostedBackups({ app }: { app: AppApi }) {
  const api = app.services!.account!;
  const workspaceId = app.workspace.workspaceId;
  const status = useHostedQuery("backup.get", { workspaceId });
  const [error, setError] = useState<string | null>(null);
  const frequency = status.data?.frequency ?? "off";
  const setFrequency = async (frequency: Frequency) => {
    setError(null);
    try {
      const updated = await api.call("backup.setFrequency", { workspaceId, frequency });
      status.setData(() => updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <SettingsCard>
      <SettingsRow
        label="Automatic backups"
        description="A zip of what you can see, kept in Lydie's storage. The last 7 are kept."
      >
        <Select
          aria-label="Automatic backups"
          className="w-40"
          isDisabled={!status.data}
          selectedKey={frequency}
          onSelectionChange={(key) => void setFrequency(key as Frequency)}
        >
          <SelectItem id="off">Off</SelectItem>
          <SelectItem id="daily">Daily</SelectItem>
          <SelectItem id="weekly">Weekly</SelectItem>
        </Select>
      </SettingsRow>
      {(error ?? status.data?.lastError) && (
        <SettingsCardEmpty role="alert" className="text-red-600">
          {error ?? `The last backup failed: ${status.data?.lastError}`}
        </SettingsCardEmpty>
      )}
      {status.error && (
        <SettingsCardEmpty role="alert" className="text-red-600">
          {status.error.message}
        </SettingsCardEmpty>
      )}
      {status.data?.backups.map((b) => (
        <SettingsListItem
          key={b.id}
          title={new Date(b.createdAt).toLocaleString()}
          meta={[formatSize(b.size)]}
          trailing={
            <ProgressButton
              size="xs"
              variant="ghost"
              label={`Download the backup from ${new Date(b.createdAt).toLocaleString()}`}
              busyLabel="Downloading"
              run={async (onProgress) => {
                setError(null);
                try {
                  const link = await api.call("backup.downloadUrl", { id: b.id });
                  await saveLink(app, link, "Backup saved", onProgress);
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                }
              }}
            >
              Download
            </ProgressButton>
          }
        />
      ))}
      {status.data && frequency !== "off" && status.data.backups.length === 0 && (
        <SettingsCardEmpty>The first backup runs in a few minutes.</SettingsCardEmpty>
      )}
    </SettingsCard>
  );
}

function Importers() {
  const importers = [...useContributions("importer")].sort(
    (a, b) => (a.order ?? 100) - (b.order ?? 100),
  );
  const [importing, setImporting] = useState<ImporterDef | null>(null);
  return (
    <SettingsSection title="Import" description="Bring pages in from another app.">
      <SettingsCard data-testid="importers">
        {importers.length === 0 && (
          <SettingsCardEmpty>No importers are turned on.</SettingsCardEmpty>
        )}
        {importers.map((importer) => (
          <SettingsListItem
            key={`${importer.pluginId}:${importer.id}`}
            icon={importer.icon}
            title={importer.name}
            meta={importer.description}
            trailing={
              <Button
                size="sm"
                variant="secondary"
                aria-label={`Import from ${importer.name}`}
                onPress={() => setImporting(importer)}
              >
                Import
              </Button>
            }
          />
        ))}
      </SettingsCard>
      {importing && <ImportDialog importer={importing} close={() => setImporting(null)} />}
    </SettingsSection>
  );
}

export function ImportExportPage() {
  const app = useApp();
  const hosted = app.backend.info.mode === "synced" && Boolean(app.services?.account);
  const folder = Boolean(app.services?.vault);
  return (
    <SettingsSections>
      <Importers />
      <SettingsSection title="Export">
        <SettingsCard>
          <ExportRow />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Backups">
        {hosted ? (
          <HostedBackups app={app} />
        ) : (
          <SettingsCard>
            <SettingsCardEmpty>
              {folder
                ? "Your notes are files in this folder: back the folder up like any other."
                : "Notes in this browser are not backed up. Export them now and then, or sync the workspace."}
            </SettingsCardEmpty>
          </SettingsCard>
        )}
      </SettingsSection>
    </SettingsSections>
  );
}
