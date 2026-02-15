import { useAtomValue } from "jotai";

import {
  activeDocumentIdAtom,
  activeEditorInstanceAtom,
  editorRegistry,
} from "@/atoms/editor";

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
  return useAtomValue(activeDocumentIdAtom);
}

/**
 * Get the editor registry singleton.
 * Use this to access editors for specific documents.
 * 
 * Example:
 *   const registry = useEditorRegistry();
 *   const instance = registry.get(documentId);
 *   if (instance) {
 *     instance.contentEditor.commands.setContent('...');
 *   }
 */
export function useEditorRegistry() {
  return editorRegistry;
}
