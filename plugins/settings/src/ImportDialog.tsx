// Importing from a source (an `importer` contribution): how to get the files out of it, picking
// them, reading them into a plan (with a summary of what comes in), writing it with `runImport`,
// and what did not carry over. Rendered by the settings page, not opened as an overlay, which
// would close Settings.
import { useApp } from "@lydie/plugin-api";
import type { ImporterDef } from "@lydie/plugin-api";
import { runImport } from "@lydie/plugin-api/import";
import type {
  ImportPlan,
  ImportProgress,
  ImportResult,
  ImportRunProgress,
  ImportWarning,
} from "@lydie/plugin-api/import";
import { Button, Dialog, Heading, Modal, ProgressBar } from "@lydie/plugin-api/ui";
import { useRef, useState } from "react";
import type { DragEvent } from "react";

import { describePlan, phaseLabel, plural } from "./import-summary.ts";

type Step =
  | { kind: "pick" }
  | { kind: "reading"; progress: ImportProgress | null }
  | { kind: "review"; plan: ImportPlan }
  | { kind: "running"; plan: ImportPlan; progress: ImportRunProgress | null }
  | { kind: "done"; result: ImportResult };

function pickFiles(accept: readonly string[]): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept.join(",");
    input.multiple = true;
    input.addEventListener("change", () => resolve([...(input.files ?? [])]));
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

function Warnings({ warnings }: { warnings: readonly ImportWarning[] }) {
  const [all, setAll] = useState(false);
  if (!warnings.length) return null;
  const shown = all ? warnings : warnings.slice(0, 6);
  return (
    <div className="flex flex-col gap-1 rounded-md bg-gray-950/3 p-3 text-xs text-gray-700">
      <p className="font-medium text-gray-900">
        {plural(warnings.length, "thing")} did not carry over as in the source
      </p>
      <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto" data-testid="import-warnings">
        {shown.map((w, i) => (
          <li key={i}>
            {w.source && <span className="font-medium">{w.source}: </span>}
            {w.message}
          </li>
        ))}
      </ul>
      {warnings.length > shown.length && (
        <Button size="xs" variant="ghost" className="self-start" onPress={() => setAll(true)}>
          Show all {warnings.length}
        </Button>
      )}
    </div>
  );
}

export function ImportDialog({ importer, close }: { importer: ImporterDef; close: () => void }) {
  const app = useApp();
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const busy = step.kind === "reading" || step.kind === "running";
  const synced = app.workspace.mode === "synced";

  const read = async (files: readonly File[]) => {
    if (!files.length) return;
    setError(null);
    const controller = new AbortController();
    abort.current = controller;
    setStep({ kind: "reading", progress: null });
    // The throw outside the try statement, where the React Compiler cannot compile one.
    const readPlan = async () => {
      const plan = await importer.read(files, {
        app,
        signal: controller.signal,
        onProgress: (progress) => setStep({ kind: "reading", progress }),
      });
      if (!plan.pages.length) throw new Error("There is nothing to import in these files.");
      return plan;
    };
    try {
      setStep({ kind: "review", plan: await readPlan() });
    } catch (e) {
      setStep({ kind: "pick" });
      if (!isAbort(e)) setError(e instanceof Error ? e.message : String(e));
    }
  };

  const run = async (plan: ImportPlan) => {
    setError(null);
    const controller = new AbortController();
    abort.current = controller;
    setStep({ kind: "running", plan, progress: null });
    try {
      const result = await runImport(app, plan, {
        signal: controller.signal,
        onProgress: (progress) => setStep({ kind: "running", plan, progress }),
      });
      setStep({ kind: "done", result });
    } catch (e) {
      setStep({ kind: "review", plan });
      setError(
        `The import stopped: ${e instanceof Error ? e.message : String(e)}. What was imported so far is in the sidebar.`,
      );
    }
  };

  const open = (id: string) => {
    close();
    app.overlays.close("settings");
    app.openDoc(id);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void read([...event.dataTransfer.files]);
  };

  return (
    <Modal
      isOpen
      isDismissable={!busy}
      isKeyboardDismissDisabled={busy}
      onOpenChange={(isOpen) => !isOpen && !busy && close()}
      size="md"
    >
      <Dialog aria-label={`Import from ${importer.name}`} className="flex flex-col gap-3 p-5">
        <Heading slot="title" className="text-base font-medium text-gray-900">
          Import from {importer.name}
        </Heading>

        {step.kind === "pick" && (
          <>
            {importer.instructions && (
              <div className="text-sm text-gray-600">{importer.instructions}</div>
            )}
            <div
              data-testid="import-drop"
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center text-sm text-gray-600 ${dragging ? "border-gray-950/30 bg-gray-950/4" : "border-gray-950/15"}`}
            >
              <span>Drop the file here, or</span>
              <Button
                size="sm"
                variant="secondary"
                onPress={() => void pickFiles(importer.accept).then(read)}
              >
                Choose file…
              </Button>
            </div>
          </>
        )}

        {step.kind === "reading" && (
          <ProgressBar
            label={step.progress?.label ?? "Reading the files"}
            value={step.progress?.done ?? 0}
            maxValue={Math.max(1, step.progress?.total ?? 1)}
            isIndeterminate={!step.progress?.total}
          />
        )}

        {step.kind === "review" && (
          <div className="flex flex-col gap-2 text-sm text-gray-700" data-testid="import-summary">
            <p>{describePlan(step.plan)}</p>
            <p className="text-xs text-gray-500">
              Everything goes under a new page, “{step.plan.rootTitle}”, at the top of the sidebar.
              {synced && " It uploads to the cloud in the background."}
            </p>
            <Warnings warnings={step.plan.warnings} />
          </div>
        )}

        {step.kind === "running" && (
          <div className="flex flex-col gap-2" data-testid="import-progress">
            <ProgressBar
              label={step.progress ? phaseLabel(step.progress.phase) : "Starting"}
              value={step.progress?.done ?? 0}
              maxValue={Math.max(1, step.progress?.total ?? 1)}
            />
            <p className="text-xs text-gray-500">Keep this window open until it is done.</p>
          </div>
        )}

        {step.kind === "done" && (
          <div className="flex flex-col gap-2 text-sm text-gray-700" data-testid="import-done">
            <p>
              {step.result.stopped ? "Stopped. Imported" : "Imported"}{" "}
              {plural(step.result.pages, "page")}
              {step.result.databases > 0 && `, ${plural(step.result.databases, "collection")}`}
              {step.result.files > 0 && ` and ${plural(step.result.files, "file")}`} into “
              {step.result.rootTitle}”.
              {synced && " They upload to the cloud in the background."}
            </p>
            {step.result.failedFiles.length > 0 && (
              <p className="text-xs text-amber-800">
                {plural(step.result.failedFiles.length, "file")} could not be added.
              </p>
            )}
            <Warnings warnings={step.result.warnings} />
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="mt-2 flex justify-end gap-2">
          {busy ? (
            <Button variant="secondary" size="sm" onPress={() => abort.current?.abort()}>
              Stop
            </Button>
          ) : step.kind === "done" ? (
            <>
              <Button variant="secondary" size="sm" onPress={close}>
                Close
              </Button>
              <Button size="sm" onPress={() => open(step.result.rootId)}>
                Open “{step.result.rootTitle}”
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" onPress={close}>
                Cancel
              </Button>
              {step.kind === "review" && (
                <>
                  <Button variant="secondary" size="sm" onPress={() => setStep({ kind: "pick" })}>
                    Choose another file
                  </Button>
                  <Button size="sm" onPress={() => void run(step.plan)}>
                    Import
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </Dialog>
    </Modal>
  );
}
