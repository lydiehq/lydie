// Folder vaults (Electron): the editor edits through the file bridge's session for its document,
// so a change made on disk while the note is open arrives as steps and merges with unsaved typing
// (LYD-196), and a true conflict shows a banner (LYD-197). Elsewhere `backend.documents` is absent
// and the editor saves with `doc.updateBody`.
import { useApp, useBackend, useOps } from "@lydie/plugin-api";
import type { DocumentSession, FileConflictInfo } from "@lydie/plugin-api";
import { Mapping, Step } from "@lydie/plugin-api/editor";
import type { Editor, ProseMirrorNode, Transaction } from "@lydie/plugin-api/editor";
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

// What main has of the editor's document: update or save `seq` sent `doc`, and no steps came
// since. Later updates and saves send only the blocks that changed after it.
type Sent = { seq: number; doc: ProseMirrorNode };

// The vault service's document patch (@lydie/bridge-fs `DocumentPatch`): the top-level blocks of
// `doc` that differ from what main has. ProseMirror keeps unchanged blocks as the same nodes from
// one state to the next, so this compares references, not content.
export function patchFrom(sent: Sent, doc: ProseMirrorNode) {
  const before = sent.doc.childCount;
  const after = doc.childCount;
  let from = 0;
  while (from < before && from < after && sent.doc.child(from) === doc.child(from)) from++;
  let tail = 0;
  while (
    tail < before - from &&
    tail < after - from &&
    sent.doc.child(before - 1 - tail) === doc.child(after - 1 - tail)
  ) {
    tail++;
  }
  const content: unknown[] = [];
  for (let i = from; i < after - tail; i++) content.push(doc.child(i).toJSON());
  return { type: "patch", base: sent.seq, from, to: before - tail, content, count: after };
}

export type FileSession = {
  // Saves go to the file through the session.
  active: boolean;
  // Saves the editor's document (`doc`, its JSON, is only used once the editor is gone).
  save(doc?: unknown): Promise<void>;
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
  const sent = useRef<Sent | null>(null);
  // Updates and saves sent, and saves not answered yet: a save's seq is known only then, so
  // updates sent meanwhile carry the whole document.
  const sends = useRef(0);
  const saving = useRef(0);

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
        sent.current = null;
        off = s.subscribe((event) => {
          const editor = editorRef.current;
          if (event.type === "steps") {
            // Main applied these to its copy: it is no longer what was sent.
            sent.current = null;
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
              if (!editor.isDestroyed) {
                const doc = editor.state.doc;
                const seq = s.update(doc.toJSON());
                sends.current++;
                log.current.update(seq);
                sent.current = { seq, doc };
              }
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
      let whole = false;
      // Stale: main sent steps this document lacks; apply them (they are on the way) and save the
      // result instead. A patch main could not apply goes again as the whole document, at once.
      for (let attempt = 0; attempt < 4; attempt++) {
        const editor = editorRef.current;
        const live = editor && !editor.isDestroyed ? editor.state.doc : null;
        if (!live && (attempt > 0 || doc === undefined)) return;
        const patch = live && sent.current && !whole ? patchFrom(sent.current, live) : null;
        const setSeq = log.current.update(-1);
        const mark = ++sends.current;
        saving.current++;
        const result = await session.save(patch ?? live?.toJSON() ?? doc).finally(() => {
          saving.current--;
        });
        setSeq(result.seq);
        if (!result.stale) {
          if (live && sends.current === mark) sent.current = { seq: result.seq, doc: live };
          log.current.saved(result.seq);
          return;
        }
        sent.current = null;
        if (patch) {
          whole = true;
          continue;
        }
        whole = false;
        await new Promise<void>((resolve) => {
          applied.current.push(resolve);
          setTimeout(resolve, 1000);
        });
      }
    },
    track(tr) {
      if (!session || tr.getMeta(EXTERNAL)) return;
      log.current.local(tr.mapping);
      if (updateTimer.current) clearTimeout(updateTimer.current);
      updateTimer.current = setTimeout(() => {
        const editor = editorRef.current;
        if (!editor || editor.isDestroyed || !dirty.current) return;
        const doc = editor.state.doc;
        const patch = sent.current && saving.current === 0 ? patchFrom(sent.current, doc) : null;
        const seq = session.update(patch ?? doc.toJSON());
        sends.current++;
        log.current.update(seq);
        sent.current = { seq, doc };
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
