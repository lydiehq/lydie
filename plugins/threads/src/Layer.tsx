import { assembleThreads, useDeviceSetting, useOps, useQuery } from "@lydie/plugin-api";
import type { EditorOverlayProps } from "@lydie/plugin-api";
import { TextSelection, useEditorState } from "@lydie/plugin-api/editor";
import type { Editor } from "@lydie/plugin-api/editor";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import { threadsKey, threadsState } from "./extension.ts";
import type { Marked, ThreadsMeta } from "./extension.ts";
import { Margin } from "./Margin.tsx";
import type { MarginItem } from "./Margin.tsx";
import {
  clearDraft,
  draftOf,
  editorOf,
  resolvedShownIn,
  setDraft,
  setEditor,
  SHOWN_KEY,
  subscribe,
} from "./store.ts";
import { anchorAt, docText } from "./text.ts";
import { Composer } from "./ThreadCard.tsx";

// How long after the last local edit a moved passage is saved as its thread's anchor.
const SAVE_AFTER_MS = 1500;

function setMeta(editor: Editor, meta: ThreadsMeta) {
  if (editor.isDestroyed) return;
  editor.view.dispatch(editor.state.tr.setMeta(threadsKey, meta).setMeta("addToHistory", false));
}

export function openThread(editor: Editor, id: string | null) {
  setMeta(editor, { active: id });
}

// Mounted once per editor: feeds the document's open threads to the editor (the highlighted
// passages), keeps their anchors up to date while the text is edited, and shows the comments
// beside the text with the one being written.
export function ThreadsLayer({ editor, docId, tabId }: EditorOverlayProps) {
  const ops = useOps();
  const { data } = useQuery("thread.list", { documentId: docId });
  const threads = useMemo(() => assembleThreads(data), [data]);
  const [shown, setShown] = useDeviceSetting(SHOWN_KEY, true);
  const draft = useSyncExternalStore(subscribe, () => draftOf(tabId));
  const withResolved = useSyncExternalStore(subscribe, () => resolvedShownIn(tabId));

  const marked = useMemo(
    () =>
      shown
        ? threads.flatMap((t): Marked[] =>
            t.anchor && !t.resolvedAt ? [{ id: t.id, kind: t.kind, anchor: t.anchor }] : [],
          )
        : [],
    [threads, shown],
  );
  useEffect(() => setMeta(editor, { threads: marked }), [editor, marked]);

  useEffect(() => {
    if (!tabId) return;
    setEditor(tabId, editor);
    return () => {
      setEditor(tabId, null);
      clearDraft(tabId);
    };
  }, [editor, tabId]);

  // Starting a comment while comments are hidden shows them again.
  useEffect(() => {
    if (draft && !shown) setShown(true);
  }, [draft, shown, setShown]);

  // A passage that was edited here becomes its thread's anchor, so the thread stays on it for
  // everyone else and after a reload. Changes that came from elsewhere are not ours to save.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      if (editor.isDestroyed || !editor.isEditable) return;
      const state = threadsState(editor.state);
      const text = docText(editor.state.doc);
      for (const thread of state.threads) {
        const range = state.ranges.get(thread.id);
        const anchor = range && anchorAt(text, range);
        if (!anchor || anchor.quote === thread.anchor.quote) continue;
        void ops.thread.setAnchor({ id: thread.id, anchor }, { history: false }).catch(() => {});
      }
    };
    const onTransaction = ({
      transaction,
    }: {
      transaction: { docChanged: boolean; getMeta(key: string): unknown };
    }) => {
      if (!transaction.docChanged || transaction.getMeta("y-sync$")) return;
      clearTimeout(timer);
      timer = setTimeout(save, SAVE_AFTER_MS);
    };
    editor.on("transaction", onTransaction);
    return () => {
      clearTimeout(timer);
      editor.off("transaction", onTransaction);
    };
  }, [editor, ops]);

  const view = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const state = current ? threadsState(current.state) : null;
      return { active: state?.active ?? null, ranges: state?.ranges };
    },
  });

  const closeDraft = () => {
    if (tabId) clearDraft(tabId);
    setMeta(editor, { draft: null });
    editor.view.focus();
  };

  // Open ones, then resolved ones when asked for; nothing while comments are hidden.
  const items: MarginItem[] = shown
    ? threads
        .filter((t) => !t.resolvedAt || withResolved)
        .map((thread) => ({ thread, range: view.ranges?.get(thread.id) ?? null }))
    : [];

  return (
    <Margin
      editor={editor}
      items={items}
      active={view.active}
      open={(id) => openThread(editor, id)}
      draft={
        draft && tabId
          ? {
              onPage: !draft.anchor,
              key: draft.seq,
              content: (
                <Composer
                  key={draft.seq}
                  label="Comment"
                  placeholder={draft.anchor ? "Add a comment" : "Comment on this page"}
                  submitLabel="Add comment"
                  buttons="always"
                  autoFocus
                  onCancel={closeDraft}
                  onSubmit={async (body) => {
                    await ops.thread.create({
                      documentId: docId,
                      kind: "comment",
                      body,
                      ...(draft.anchor ? { ...draft.anchor, exact: true } : {}),
                    });
                    closeDraft();
                  }}
                />
              ),
            }
          : null
      }
    />
  );
}

// Starts a comment on the selected text (the selection toolbar's button).
export function startDraft(editor: Editor, tabId: string | null) {
  if (!tabId) return;
  const { from, to } = editor.state.selection;
  const anchor = anchorAt(docText(editor.state.doc), { from, to });
  if (!anchor) return;
  // The passage is marked as the draft's and the selection let go, so the selection toolbar
  // makes room for the field.
  editor.view.dispatch(
    editor.state.tr
      .setMeta(threadsKey, { active: null, draft: { from, to } })
      .setMeta("addToHistory", false)
      .setSelection(TextSelection.create(editor.state.doc, to)),
  );
  setDraft(tabId, anchor);
}

// Starts a comment on the page as a whole (the top bar, the command).
export function startPageDraft(tabId: string | null) {
  const editor = editorOf(tabId);
  if (!tabId || !editor) return;
  setMeta(editor, { active: null, draft: null });
  setDraft(tabId, null);
}
