// Folder vaults (Electron): the editor edits through the file bridge's session for its document,
// so a change made on disk while the note is open arrives as steps and merges with unsaved typing
// (LYD-196), and a true conflict shows a banner (LYD-197). Elsewhere `backend.documents` is absent
// and the editor saves with `doc.updateBody`.
import { useApp, useBackend, useOps } from "@lydie/plugin-api";
import type { DocumentSession, FileConflictInfo } from "@lydie/plugin-api";
import { Mapping, Step } from "@lydie/plugin-api/editor";
import type { Editor, Transaction } from "@lydie/plugin-api/editor";
import { Button, StatusBanner } from "@lydie/plugin-api/ui";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { SessionLog } from "./session-log.ts";

// Transactions carrying this meta came from disk: not a local edit, not on the undo stack.
export const EXTERNAL = "lydie:external";

const UPDATE_DELAY = 150;

// Rebases replace steps made against `base` (the document main computed them against) over the
// editor's changes since (`local`, base → editor), as prosemirror-collab does, and applies them.
// Returns the steps as received and the mapping of what was applied.
export function applyExternalSteps(
  editor: Editor,
  json: readonly unknown[],
  local: Mapping,
): { steps: Step[]; applied: Mapping } {
  const remote = json.map((s) =>
    Step.fromJSON(editor.schema, { stepType: "replace", ...(s as object) }),
  );
  const tr = editor.state.tr;
  const applied: (Step | null)[] = [];
  for (let i = 0; i < remote.length; i++) {
    // remote[i] is relative to base + remote[0..i-1]: undo those, redo local, redo them mapped.
    const mapping = new Mapping();
    for (let j = i - 1; j >= 0; j--) mapping.appendMap(remote[j]!.getMap().invert());
    mapping.appendMapping(local);
    for (let j = 0; j < i; j++) {
      const step = applied[j];
      if (step) mapping.appendMap(step.getMap(), i - 1 - j);
    }
    const mapped = remote[i]!.map(mapping);
    applied.push(mapped && !tr.maybeStep(mapped).failed ? mapped : null);
  }
  if (!tr.docChanged) return { steps: remote, applied: new Mapping() };
  tr.setMeta(EXTERNAL, true).setMeta("addToHistory", false);
  editor.view.dispatch(tr);
  return { steps: remote, applied: tr.mapping };
}

export type FileSession = {
  // Saves go to the file through the session.
  active: boolean;
  save(doc: unknown): Promise<void>;
  // Called for every editor transaction that changed the document.
  track(tr: Transaction): void;
  conflict: FileConflictInfo | null;
};

export function useFileSession(
  id: string,
  editorRef: RefObject<Editor | null>,
  dirty: RefObject<boolean>,
  enabled: boolean,
): FileSession {
  const backend = useBackend();
  const documents = enabled ? backend.documents : undefined;
  const [session, setSession] = useState<DocumentSession | null>(null);
  const [conflict, setConflict] = useState<FileConflictInfo | null>(null);
  const log = useRef(new SessionLog());
  // Resolves when the next steps event has been applied (a stale save waits for it).
  const applied = useRef<(() => void)[]>([]);
  const updateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!documents) return;
    let live = true;
    let opened: DocumentSession | null = null;
    let off = () => {};
    void documents
      .open(id)
      .then((s) => {
        opened = s;
        if (!live) return s.close();
        log.current = new SessionLog();
        off = s.subscribe((event) => {
          const editor = editorRef.current;
          if (event.type === "steps") {
            if (!editor || editor.isDestroyed) return;
            const { steps, applied: done } = applyExternalSteps(
              editor,
              event.steps,
              log.current.since(event.basedOn),
            );
            log.current.prune(event.basedOn);
            log.current.remote(steps, done);
            // Main's copy lacks the edits mapped onto the merge (and the version it now has):
            // send it, tagged with this event's version by the session.
            queueMicrotask(() => {
              if (!editor.isDestroyed) log.current.update(s.update(editor.getJSON()));
              for (const resolve of applied.current.splice(0)) resolve();
            });
          } else if (event.type === "conflict") setConflict(event.conflict);
        });
        setSession(s);
      })
      // No file for this document (or no folder): the editor saves through doc.updateBody.
      .catch(() => {});
    void documents
      .conflicts()
      .then((list) => {
        const mine = list.find((c) => c.id === id);
        if (live && mine) setConflict(mine);
      })
      .catch(() => {});
    return () => {
      live = false;
      off();
      opened?.close();
      if (updateTimer.current) clearTimeout(updateTimer.current);
      setSession(null);
    };
  }, [documents, id, editorRef]);

  return {
    active: session !== null,
    conflict,
    async save(doc) {
      if (!session) return;
      if (updateTimer.current) clearTimeout(updateTimer.current);
      let current = doc;
      // Stale: main sent steps this document lacks; apply them (they are on the way) and save the
      // result instead.
      for (let attempt = 0; attempt < 3; attempt++) {
        const setSeq = log.current.update(-1);
        const result = await session.save(current);
        setSeq(result.seq);
        if (!result.stale) return;
        await new Promise<void>((resolve) => {
          applied.current.push(resolve);
          setTimeout(resolve, 1000);
        });
        const editor = editorRef.current;
        if (!editor || editor.isDestroyed) return;
        current = editor.getJSON();
      }
    },
    track(tr) {
      if (!session || tr.getMeta(EXTERNAL)) return;
      log.current.local(tr.mapping);
      if (updateTimer.current) clearTimeout(updateTimer.current);
      updateTimer.current = setTimeout(() => {
        const editor = editorRef.current;
        if (!editor || editor.isDestroyed || !dirty.current) return;
        log.current.update(session.update(editor.getJSON()));
      }, UPDATE_DELAY);
    },
  };
}

// Both versions were kept: the file has the disk version (shown now), the editor's went to a copy.
export function ConflictBanner({
  docId,
  conflict,
  editorRef,
  onDone,
}: {
  docId: string;
  conflict: FileConflictInfo;
  editorRef: RefObject<Editor | null>;
  onDone: () => void;
}) {
  const app = useApp();
  const ops = useOps();
  const backend = useBackend();
  const resolve = async () => {
    await backend.documents?.resolveConflict(docId).catch(() => {});
    onDone();
  };
  const dropCopy = async () => {
    if (conflict.conflictId) await ops.doc.delete({ id: conflict.conflictId }).catch(() => {});
  };
  return (
    <StatusBanner
      kind="warning"
      action={
        <div className="flex gap-1">
          <Button
            size="xs"
            variant="secondary"
            onPress={async () => {
              const copy = conflict.conflictId
                ? (
                    await backend.query("doc.get", { id: conflict.conflictId, includeBody: true })
                  )[0]
                : undefined;
              const editor = editorRef.current;
              if (copy?.body && editor && !editor.isDestroyed) {
                // An ordinary edit (undoable), saved like typing.
                editor.commands.setContent(app.editor.fromMarkdown(copy.body.markdown).content);
              }
              await dropCopy();
              await resolve();
            }}
          >
            Keep mine
          </Button>
          <Button
            size="xs"
            variant="secondary"
            onPress={async () => {
              await dropCopy();
              await resolve();
            }}
          >
            Keep theirs
          </Button>
          {conflict.conflictId && (
            <Button
              size="xs"
              variant="secondary"
              onPress={() => app.openDoc(conflict.conflictId!, { mode: "split" })}
            >
              Open both
            </Button>
          )}
        </div>
      }
    >
      <span data-testid="conflict-banner">
        This note changed on disk while you were editing. It shows the disk version; yours is in{" "}
        {conflict.conflictPath.split("/").pop()}.
      </span>
    </StatusBanner>
  );
}
