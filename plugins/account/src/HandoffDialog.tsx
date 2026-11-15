import { useAccount, useApp } from "@lydie/plugin-api";
import type {
  HandoffOutcome,
  HandoffPlanHandle,
  HandoffProgress,
  HostedWorkspaceSummary,
} from "@lydie/plugin-api";
import {
  Button,
  Dialog,
  Heading,
  LoadingState,
  Modal,
  ProgressBar,
  Radio,
  RadioGroup,
  Select,
  SelectItem,
  TextField,
} from "@lydie/plugin-api/ui";
import { useEffect, useRef, useState } from "react";

import { bytes, errorMessage, plural } from "./format.ts";
import { readCloud, readCopied, rememberCopied } from "./local-notice.ts";

type Step =
  | { kind: "choose" }
  | { kind: "planning" }
  | { kind: "review"; plan: HandoffPlanHandle }
  | { kind: "running"; plan: HandoffPlanHandle; progress: HandoffProgress | null }
  | { kind: "done"; plan: HandoffPlanHandle; outcome: HandoffOutcome };

const PHASES: Record<HandoffProgress["phase"], string> = {
  documents: "Copying pages",
  bodies: "Copying page contents",
  attachments: "Uploading files",
  trash: "Copying the trash",
  done: "Finishing",
};

// "Move to cloud" / "Copy to cloud": copies the local workspace into a cloud one (a dry run first),
// then reopens the window on it. This browser's workspace is a move: once all of it is in the
// cloud it is forgotten here (`handoff.discard`), so there is one place for the notes. A folder
// is a copy: the files stay.
export function HandoffDialog({ close }: { close: () => void; props: unknown }) {
  const app = useApp();
  const { api, state } = useAccount();
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [error, setError] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<HostedWorkspaceSummary[] | null>(null);
  const [target, setTarget] = useState<"new" | "existing">("new");
  const [name, setName] = useState(app.workspace.workspaceName);
  const [existingId, setExistingId] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!api || state.status !== "signed-in") return;
    let live = true;
    api
      .workspaces()
      .then((list) => {
        if (!live) return;
        const own = list.filter((w) => w.role !== "guest");
        setWorkspaces(own);
        // Copied before, or a cloud workspace used on this device: more of the same goes there.
        const before =
          readCopied(app, app.workspace.workspaceId)?.workspaceId ?? readCloud(app)?.workspaceId;
        const known = own.find((w) => w.id === before);
        if (known) setTarget("existing");
        setExistingId(known?.id ?? own[0]?.id ?? null);
      })
      .catch(() => live && setWorkspaces([]));
    return () => {
      live = false;
    };
  }, [api, app, state.status]);

  // Signing in comes first; the sign-in dialog brings the user back here.
  const signedIn = state.status === "signed-in";
  useEffect(() => {
    if (!signedIn) app.overlays.open("account.signIn", { then: "handoff" });
  }, [signedIn, app]);

  if (!api?.handoff || !signedIn) return null;
  // Desktop folder windows copy the folder's workspace; the files stay as they are.
  const inFolder = api.localWorkspaces().find((w) => w.current)?.kind === "folder";
  const handoff = api.handoff;
  const discard = handoff.discard;
  const moves = Boolean(discard);
  const verb = moves ? "Move" : "Copy";
  const stays = moves
    ? "Once everything is there they are removed from this browser, so there is one place for them."
    : inFolder
      ? "The folder and its files stay as they are."
      : "They also stay in this browser.";
  // Everything is in the cloud workspace: nothing was refused, left out or missing its file.
  const complete = (planned: HandoffPlanHandle, outcome: HandoffOutcome) =>
    outcome.ok &&
    planned.summary.conflicts.length === 0 &&
    planned.summary.missingBytes.length === 0;
  const openTarget = async (planned: HandoffPlanHandle, outcome: HandoffOutcome) => {
    // Forgotten only now, as the window leaves: until then this is still where the notes are.
    if (discard && complete(planned, outcome)) await discard().catch(() => {});
    await api.openScope({ kind: "hosted", workspaceId: planned.target.workspaceId });
    close();
  };

  const plan = async () => {
    setError(null);
    setStep({ kind: "planning" });
    try {
      let ws: { id: string; name: string };
      if (target === "new") {
        ws = await api.createWorkspace({ name: name.trim() || app.workspace.workspaceName });
      } else {
        const found = workspaces?.find((w) => w.id === existingId);
        if (!found) throw new Error("Choose a workspace");
        ws = found;
      }
      const planned = await handoff.plan({ workspaceId: ws.id, workspaceName: ws.name });
      setStep({ kind: "review", plan: planned });
    } catch (e) {
      setError(errorMessage(e));
      setStep({ kind: "choose" });
    }
  };

  const run = async (planned: HandoffPlanHandle) => {
    setError(null);
    abort.current = new AbortController();
    setStep({ kind: "running", plan: planned, progress: null });
    try {
      const outcome = await handoff.run(planned, {
        signal: abort.current.signal,
        onProgress: (progress) => setStep({ kind: "running", plan: planned, progress }),
      });
      if (outcome.ok) rememberCopied(app, app.workspace.workspaceId, planned.target);
      setStep({ kind: "done", plan: planned, outcome });
    } catch (e) {
      setError(
        abort.current.signal.aborted
          ? "Stopped. Nothing is lost: run it again to continue."
          : errorMessage(e),
      );
      setStep({ kind: "review", plan: planned });
    }
  };

  const busy = step.kind === "planning" || step.kind === "running";
  return (
    <Modal
      isOpen
      isDismissable={!busy}
      isKeyboardDismissDisabled={busy}
      onOpenChange={(open) => !open && !busy && close()}
      size="md"
    >
      <Dialog aria-label={`${verb} to cloud`} className="flex flex-col gap-3 p-5">
        <Heading slot="title" className="text-base font-medium text-gray-900">
          {verb} “{app.workspace.workspaceName}” to the cloud
        </Heading>

        {step.kind === "choose" && (
          <>
            <p className="text-sm text-gray-600">
              Your notes {moves ? "move" : "are copied"} to a workspace in Lydie Cloud, which syncs
              across your devices and can be shared. {stays}
            </p>
            <RadioGroup
              aria-label={moves ? "Where to move to" : "Where to copy to"}
              value={target}
              onChange={(value) => setTarget(value as "new" | "existing")}
            >
              <Radio value="new">A new cloud workspace</Radio>
              {target === "new" && (
                <TextField
                  aria-label="Workspace name"
                  value={name}
                  onChange={setName}
                  className="ml-6"
                />
              )}
              <Radio value="existing" isDisabled={!workspaces?.length}>
                A cloud workspace I already have
              </Radio>
              {target === "existing" && workspaces && workspaces.length > 0 && (
                <Select
                  aria-label="Workspace"
                  className="ml-6"
                  selectedKey={existingId}
                  onSelectionChange={(key) => setExistingId(String(key))}
                >
                  {workspaces.map((w) => (
                    <SelectItem key={w.id} id={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </Select>
              )}
            </RadioGroup>
          </>
        )}

        {step.kind === "planning" && <LoadingState label="Checking what to copy…" />}

        {step.kind === "review" && <Summary plan={step.plan} moves={moves} />}

        {step.kind === "running" && (
          <div className="flex flex-col gap-2" data-testid="handoff-progress">
            <ProgressBar
              label={step.progress ? PHASES[step.progress.phase] : "Starting"}
              value={step.progress?.done ?? 0}
              maxValue={Math.max(1, step.progress?.total ?? 1)}
            />
            <p className="text-xs text-gray-500">
              Keep this tab open. If it closes, run it again: nothing is copied twice.
            </p>
          </div>
        )}

        {step.kind === "done" && (
          <div className="flex flex-col gap-2 text-sm text-gray-700" data-testid="handoff-done">
            {step.outcome.ok ? (
              <p>
                {moves && complete(step.plan, step.outcome) ? "Moved" : "Copied"}{" "}
                {plural(step.outcome.applied + step.outcome.duplicates, "change")} to “
                {step.plan.target.workspaceName}”. Open it to keep working there: it is the one that
                syncs.{" "}
                {moves && complete(step.plan, step.outcome)
                  ? "Your notes are removed from this browser when you open it."
                  : `Your notes also stay ${inFolder ? "in the folder, unchanged" : "in this browser, because not everything could be copied"}, and what you change there later is not added to the cloud workspace on its own.`}
              </p>
            ) : (
              <>
                <p className="text-amber-800">
                  Most of your notes were copied, but not everything:
                </p>
                <ul className="list-disc pl-5 text-xs">
                  {step.outcome.rejected.length > 0 && (
                    <li>{plural(step.outcome.rejected.length, "change")} refused by the server</li>
                  )}
                  {step.outcome.bodies.failed.length > 0 && (
                    <li>{plural(step.outcome.bodies.failed.length, "page")} without its content</li>
                  )}
                  {step.outcome.attachments.failed.length > 0 && (
                    <li>{plural(step.outcome.attachments.failed.length, "file")} not uploaded</li>
                  )}
                </ul>
              </>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="mt-2 flex justify-end gap-2">
          {step.kind === "running" ? (
            <Button variant="secondary" size="sm" onPress={() => abort.current?.abort()}>
              Stop
            </Button>
          ) : step.kind === "done" ? (
            <>
              {!step.outcome.ok && (
                <Button variant="secondary" size="sm" onPress={() => void run(step.plan)}>
                  Try again
                </Button>
              )}
              <Button size="sm" onPress={() => void openTarget(step.plan, step.outcome)}>
                Open “{step.plan.target.workspaceName}”
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" onPress={close} isDisabled={busy}>
                Cancel
              </Button>
              {step.kind === "review" ? (
                <Button
                  size="sm"
                  onPress={() => void run(step.plan)}
                  isDisabled={step.plan.summary.documents === step.plan.summary.conflicts.length}
                >
                  {verb}{" "}
                  {plural(step.plan.summary.documents - step.plan.summary.conflicts.length, "page")}
                </Button>
              ) : (
                <Button size="sm" onPress={() => void plan()} isPending={step.kind === "planning"}>
                  Continue
                </Button>
              )}
            </>
          )}
        </div>
      </Dialog>
    </Modal>
  );
}

function Summary({ plan, moves }: { plan: HandoffPlanHandle; moves: boolean }) {
  const s = plan.summary;
  return (
    <div className="flex flex-col gap-2 text-sm text-gray-700" data-testid="handoff-summary">
      <p>
        {moves ? "This moves to" : "This copies to"} “{plan.target.workspaceName}”
        {moves ? ", and is then removed from this browser:" : ":"}
      </p>
      <ul className="list-disc pl-5">
        <li>{plural(s.documents - s.trashed, "page")}</li>
        {s.trashed > 0 && <li>{plural(s.trashed, "page")} in the trash</li>}
        {s.attachments > 0 && (
          <li>
            {plural(s.attachments, "file")} ({bytes(s.attachmentBytes)})
          </li>
        )}
      </ul>
      {s.existingInTarget.length > 0 && (
        <p className="text-xs text-gray-500">
          {plural(s.existingInTarget.length, "page")} are already in “{plan.target.workspaceName}”
          and stay as they are there. Changes made to them here are not copied.
        </p>
      )}
      {s.conflicts.length > 0 && (
        <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
          {plural(s.conflicts.length, "page")} cannot be copied because another workspace already
          has them: {s.conflicts.map((c) => c.title || "Untitled").join(", ")}.
        </div>
      )}
      {s.missingBytes.length > 0 && (
        <p className="text-xs text-gray-500">
          {plural(s.missingBytes.length, "file")} are not on this device and are copied without
          their contents.
        </p>
      )}
      {s.warnings.map((w) => (
        <p key={w} className="text-xs text-gray-500">
          {w}
        </p>
      ))}
    </div>
  );
}
