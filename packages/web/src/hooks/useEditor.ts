import { useAtomValue } from "jotai";

import { documentEditorAtom, titleEditorAtom } from "@/atoms/editor";

// Hook to access the current document editor instance from anywhere in the app.
// Only components using this hook will re-render when the editor changes.
// Returns the current document editor instance or null if not available
export function useDocumentEditor() {
  return useAtomValue(documentEditorAtom);
}

// Hook to access the current title editor instance from anywhere in the app.
// Only components using this hook will re-render when the editor changes.
// Returns the current title editor instance or null if not available
export function useTitleEditor() {
  return useAtomValue(titleEditorAtom);
}
