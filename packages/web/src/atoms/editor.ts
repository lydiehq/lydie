// Editor state management - exports from the editor registry
// All editor access should go through the registry for multi-tab support
export {
  activeDocumentIdAtom,
  activeEditorInstanceAtom,
  editorCache,
  editorRegistry,
  pendingChangeStatusAtom,
  pendingEditorChangeAtom,
} from "@/lib/editor/editor-registry";

export type {
  EditorInstance,
  PendingEditorChange,
  PendingChangeStatus,
} from "@/lib/editor/editor-registry";

// Proposed change diff view state
import { atom } from "jotai";

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
