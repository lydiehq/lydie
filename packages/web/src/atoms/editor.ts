import { atom } from "jotai";

import { activeTabIdAtom } from "@/atoms/tabs";
import { editorSessions, type EditorSession } from "@/lib/editor/editor-sessions";

export type EditorInstance = EditorSession;

export interface PendingEditorChange {
  documentId: string;
  title?: string;
  selectionWithEllipsis: string;
  replace: string;
  organizationId: string;
}

export type PendingChangeStatus = "pending" | "applying" | "applied" | "failed" | null;

export { editorSessions };

export const activeEditorInstanceAtom = atom((get) => {
  const activeId = get(activeTabIdAtom);
  if (!activeId) {
    return null;
  }

  return editorSessions.get(activeId) ?? null;
});

export const pendingEditorChangeAtom = atom<PendingEditorChange | null>(null);
export const pendingChangeStatusAtom = atom<PendingChangeStatus>(null);

export interface ProposedChangeState {
  documentId: string;
  toolCallId: string;
  selectionWithEllipsis: string;
  replace: string;
  title?: string;
  isPreviewing: boolean;
}

/**
 * Tracks the currently active proposed change for diff visualization.
 * When set, the document shows the diff view with Accept/Reject buttons.
 */
export const proposedChangeAtom = atom<ProposedChangeState | null>(null);

/**
 * Tracks whether a proposed change is currently being applied.
 */
export const isApplyingProposedChangeAtom = atom<boolean>(false);
