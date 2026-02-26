import { useAtomValue } from "jotai";

import { activeTabIdAtom } from "@/atoms/tabs";
import { activeEditorInstanceAtom, editorSessions } from "@/atoms/editor";

/**
 * Get the full editor instance for the currently active document.
 * Returns both content and title editors, plus metadata.
 */
export function useActiveEditor() {
  return useAtomValue(activeEditorInstanceAtom);
}

/**
 * Get the ID of the currently active document.
 */
export function useActiveDocumentId() {
  return useAtomValue(activeTabIdAtom);
}

/**
 * Get the editor sessions singleton.
 * Use this to access editors for specific documents.
 *
 * Example:
 *   const sessions = useEditorSessions();
 *   const instance = sessions.get(documentId);
 *   if (instance) {
 *     instance.contentEditor.commands.setContent('...');
 *   }
 */
export function useEditorSessions() {
  return editorSessions;
}
