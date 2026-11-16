import { useAccount, useApp } from "@lydie/plugin-api";
import type {
  HandoffOutcome,
  HandoffPlanHandle,
  HandoffProgress,
  HostedWorkspaceSummary,
} from "@lydie/plugin-api";
import {
  Button,
  Checkbox,
  Dialog,
  Heading,
  LoadingState,
  Modal,
  ProgressBar,
  Select,
  SelectItem,
  TextField,
} from "@lydie/plugin-api/ui";
import { useEffect, useRef, useState } from "react";

import { NEVER_ASK_KEY } from "./after-sign-in.ts";
import { bytes, errorMessage, failureOf, plural } from "./format.ts";
import { readCloud, readCopied, rememberCopied } from "./local-notice.ts";

export type HandoffProps = {
  // After signing in with pages changed here meanwhile: ask about moving those to the person's
  // cloud workspace, instead of the steps that choose one.
  ask?: { workspaceId: string; workspaceName: string; count: number };
};

type Step =
  | { kind: "ask" }
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
export function HandoffDialog({ close, props }: { close: () => void; props: unknown }) {
  const app = useApp();
  const { api, state } = useAccount();
  const ask = ((props ?? {}) as HandoffProps).ask ?? null;
  const [step, setStep] = useState<Step>({ kind: ask ? "ask" : "choose" });
  const [neverAsk, setNeverAsk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<HostedWorkspaceSummary[] | null>(null);
  // A cloud workspace's id, or "new".
  const [choice, setChoice] = useState("new");
  const [name, setName] = useState(app.workspace.workspaceName);
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
        if (known) setChoice(known.id);
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
  // Nothing the plan would leave behind: no page another workspace has, no file missing, and no
  // page the target already has (a change made to one here is not copied, LYD-423).
  const clean = (planned: HandoffPlanHandle) =>
    planned.summary.conflicts.length === 0 &&
    planned.summary.missingBytes.length === 0 &&
    planned.summary.existingInTarget.length === 0;
  // Everything is in the cloud workspace, so the copy here can go.
  const complete = (planned: HandoffPlanHandle, outcome: HandoffOutcome) =>
    outcome.ok && clean(planned);
  const openTarget = async (planned: HandoffPlanHandle, outcome: HandoffOutcome) => {
    // Forgotten only now, as the window leaves: until then this is still where the notes are.
    if (discard && complete(planned, outcome)) await discard().catch(() => {});
    await api.openScope({ kind: "hosted", workspaceId: planned.target.workspaceId });
    close();
  };

  const plan = async () => {
    setError(null);
    setStep({ kind: "planning" });
    const found = workspaces?.find((w) => w.id === choice);
    const target: Promise<{ id: string; name: string }> =
      choice === "new"
        ? api.createWorkspace({ name: name.trim() || app.workspace.workspaceName })
        : found
          ? Promise.resolve(found)
          : Promise.reject(new Error("Choose a workspace"));
    const planning = target.then((ws) =>
      handoff.plan({ workspaceId: ws.id, workspaceName: ws.name }),
    );
    const failed = await failureOf(planning);
    if (failed) {
      setError(errorMessage(failed.error));
      setStep({ kind: "choose" });
    } else {
      setStep({ kind: "review", plan: await planning });
    }
  };

  const run = async (planned: HandoffPlanHandle) => {
    setError(null);
    const { signal } = (abort.current = new AbortController());
    setStep({ kind: "running", plan: planned, progress: null });
    const running = handoff.run(planned, {
      signal,
      onProgress: (progress) => setStep({ kind: "running", plan: planned, progress }),
    });
    const failed = await failureOf(
      running.then(async (outcome) => {
        if (outcome.ok) rememberCopied(app, app.workspace.workspaceId, planned.target);
        // Asked and answered: with everything moved there is nothing left to read here.
        if (ask && complete(planned, outcome)) await openTarget(planned, outcome);
        else setStep({ kind: "done", plan: planned, outcome });
      }),
    );
    if (failed) {
      setError(
        signal.aborted
          ? "Stopped. Nothing is lost: run it again to continue."
          : errorMessage(failed.error),
      );
      setStep({ kind: "review", plan: planned });
    }
  };

  // "Move" on the question: straight to it, unless the plan has something to read first.
  const moveAsked = async () => {
    if (!ask) return;
    if (neverAsk) app.storage.set(NEVER_ASK_KEY, true);
    setError(null);
    setStep({ kind: "planning" });
    const planning = handoff.plan({
      workspaceId: ask.workspaceId,
      workspaceName: ask.workspaceName,
    });
    const failed = await failureOf(planning);
    if (failed) {
      setError(errorMessage(failed.error));
      setStep({ kind: "ask" });
      return;
    }
    const planned = await planning;
    if (clean(planned) && planned.summary.warnings.length === 0) await run(planned);
    else setStep({ kind: "review", plan: planned });
  };
  const notNow = async () => {
    if (!ask) return;
    if (neverAsk) app.storage.set(NEVER_ASK_KEY, true);
    await api.openScope({ kind: "hosted", workspaceId: ask.workspaceId });
    close();
  };

  const busy = step.kind === "planning" || step.kind === "running";
  if (step.kind === "ask" && ask) {
    return (
      <Modal isOpen isDismissable onOpenChange={(open) => !open && close()} size="sm">
        <Dialog aria-label="Move your notes to the cloud" className="flex flex-col gap-3 p-5">
          <Heading slot="title" className="text-base font-medium text-gray-900">
            Move your notes to “{ask.workspaceName}”?
          </Heading>
          <p className="text-sm text-gray-600">
            You edited {plural(ask.count, "document")} in this browser while signed out. If you do
            not move {ask.count === 1 ? "it" : "them"}, {ask.count === 1 ? "it stays" : "they stay"}{" "}
            here, under “{app.workspace.workspaceName}” in the workspace menu.
          </p>
          <Checkbox isSelected={neverAsk} onChange={setNeverAsk}>
            Don’t ask again
          </Checkbox>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="mt-1 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onPress={() => void notNow()}>
              Not now
            </Button>
            <Button size="sm" onPress={() => void moveAsked()}>
              Move
            </Button>
          </div>
        </Dialog>
      </Modal>
    );
  }
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
            <Select
              label="Cloud workspace"
              selectedKey={choice}
              onSelectionChange={(key) => setChoice(String(key))}
            >
              {[
                ...(workspaces ?? []).map((w) => (
                  <SelectItem key={w.id} id={w.id}>
                    {w.name}
                  </SelectItem>
                )),
                <SelectItem key="new" id="new">
                  New workspace…
                </SelectItem>,
              ]}
            </Select>
            {choice === "new" && <TextField label="Name" value={name} onChange={setName} />}
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
                  : `Your notes also stay ${inFolder ? "in the folder, unchanged" : "in this browser, because some pages were already there or could not be copied"}, and what you change there later is not added to the cloud workspace on its own.`}
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
