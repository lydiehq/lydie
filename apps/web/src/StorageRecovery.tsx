// Shown when the browser's database exists but cannot be opened (LYD-279). Nothing has been deleted:
// the first thing offered is a copy of the raw database file, before the user tries anything else.
import { readWebDatabaseFiles } from "@lydie/store/web";
import type { WebDatabaseFiles, WebStoreOpenError } from "@lydie/store/web";
import { Button, ErrorState } from "@lydie/ui";
import { useState } from "react";

type Props = { error: WebStoreOpenError };

type Saved =
  | { state: "idle" }
  | { state: "saved"; names: string[] }
  | { state: "error"; message: string };

function download(file: File, name: string) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function StorageRecovery({ error }: Props) {
  const [saved, setSaved] = useState<Saved>({ state: "idle" });
  const [journal, setJournal] = useState<File | null>(null);
  const name = error.dbFilename;

  async function save() {
    let files: WebDatabaseFiles;
    try {
      files = await readWebDatabaseFiles(name);
    } catch (cause) {
      setSaved({
        state: "error",
        message: `The file could not be read (${cause instanceof Error ? cause.message : String(cause)}). Close other Lydie tabs and try again.`,
      });
      return;
    }
    if (!files.database) {
      setSaved({ state: "error", message: "There is no database file in this browser." });
      return;
    }
    download(files.database, name);
    setJournal(files.journal);
    setSaved({ state: "saved", names: [name] });
  }

  return (
    <div className="flex h-dvh items-center justify-center bg-canvas">
      <ErrorState
        title="Lydie could not open your notes"
        error={error}
        action={
          <div className="flex max-w-md flex-col items-center gap-3">
            <p className="text-xs text-gray-600">
              Your notes are still stored in this browser: nothing has been deleted. Save a copy of
              the database file before you try anything else. If this device is low on storage
              space, free some up, then reload.
            </p>
            <div className="flex gap-2">
              <Button onPress={() => void save()}>Save a copy</Button>
              <Button variant="secondary" onPress={() => window.location.reload()}>
                Reload
              </Button>
            </div>
            {saved.state === "saved" && (
              <output className="text-xs text-gray-600">Saved {saved.names.join(" and ")}.</output>
            )}
            {journal && (
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs text-gray-600">
                  A change was not finished when Lydie stopped. Save its journal too and keep it in
                  the same folder as the database: opening the database then undoes the unfinished
                  change.
                </p>
                <Button
                  variant="secondary"
                  onPress={() => {
                    download(journal, `${name}-journal`);
                    setSaved({ state: "saved", names: [name, `${name}-journal`] });
                    setJournal(null);
                  }}
                >
                  Save the journal
                </Button>
              </div>
            )}
            {saved.state === "error" && (
              <p role="alert" className="text-xs text-red-700">
                {saved.message}
              </p>
            )}
          </div>
        }
      />
    </div>
  );
}
